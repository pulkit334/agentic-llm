"""Deterministic offline follow-up agent (mode "rules"). No API calls.

Same return shape as agent.run(); emits the same event types.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime, parseaddr

from . import config, db, guards, tools
from .clock import now

TEMPLATES = {
    "customer": (
        "Hi {first},\n\n"
        "Just checking in on my earlier note about \"{subject}\"{ref}. "
        "I'd be happy to answer any questions or help with anything that's holding you back.\n\n"
        "Would you like to go ahead? A one-line reply is all I need.\n\n"
        "Best regards,\n{sender}"
    ),
    "student": (
        "Hi {first},\n\n"
        "A quick reminder about \"{subject}\"{ref}. "
        "Please complete the pending step as soon as you can. If you're stuck on anything, just reply and "
        "I'll help you out.\n\n"
        "You've got this!\n{sender}"
    ),
    "employee": (
        "Hi {first},\n\n"
        "Following up on \"{subject}\"{ref}. Could you share a quick status update, or let me know if "
        "anything is blocking you?\n\n"
        "Thanks,\n{sender}"
    ),
    "business": (
        "Dear {first},\n\n"
        "I hope you are well. I am following up on my previous message regarding \"{subject}\"{ref}. "
        "We remain very interested in moving this forward.\n\n"
        "Would a short call this week or early next week suit you? I am happy to work around your "
        "schedule, or to share any further information you need.\n\n"
        "Kind regards,\n{sender}"
    ),
}

GREETING = re.compile(r"^(hi|hello|hey|dear|good (morning|afternoon|evening))\b.*$", re.I)


class _Run:
    def __init__(self, on_event, run_id):
        self.on_event = on_event
        self.run_id = run_id
        self.events = []
        self.decision = None

    def emit(self, type_, text, data=None):
        ev = {"type": type_, "text": text, "data": data}
        self.events.append(ev)
        if self.on_event:
            try:
                self.on_event(ev)
            except Exception:
                pass
        return ev

    def call(self, name, args):
        self.emit("tool_call", f"{name}({_short(args)})", {"name": name, "input": args})
        result = tools.execute(name, args, self.run_id)
        self.emit("tool_result", f"{name} -> {_trunc(str(result))}", {"name": name, "result": result,
                                                                        "is_error": "error" in result})
        if name == "record_decision":
            self.decision = args.get("decision")
            self.emit("decision", f"{args.get('decision')}: {args.get('reason')}", args)
        return result


def _trunc(s, n=600):
    return s if len(s) <= n else s[:n] + "..."


def _short(args):
    return ", ".join(f"{k}={_trunc(repr(v), 60)}" for k, v in args.items())


def _first_sentence(body: str) -> str:
    lines = [l.strip() for l in (body or "").splitlines() if l.strip()]
    if lines and GREETING.match(lines[0]) and len(lines[0]) < 60:
        lines = lines[1:]
    text = " ".join(lines)
    sentences = [x.strip() for x in re.split(r"(?<=[.!?])\s+", text) if x.strip()]
    # skip pleasantries like "Thanks for reaching out." / "Hope you are well."
    useful = [x for x in sentences
              if len(x.split()) >= 5 and not re.match(r"^(thanks|thank you|hope|i hope|good to)\b", x, re.I)]
    s = (useful or sentences or [""])[0]
    if len(s) > 160:
        s = s[:157].rsplit(" ", 1)[0] + "..."
    return s


def draft(contact_type, contact_name, subject, last_outbound_body):
    first = (contact_name or "there").split()[0]
    sent = _first_sentence(last_outbound_body)
    ref = ""
    if sent:
        ref = f" (my last message: \"{sent if sent.endswith('...') else sent.rstrip('.')}\")"
    tpl = TEMPLATES.get(contact_type, TEMPLATES["customer"])
    return tpl.format(first=first, subject=re.sub(r"^(re:\s*)+", "", subject, flags=re.I), ref=ref,
                      sender=config.SENDER_NAME)


# ---------------------------------------------------------------- thread flow

def _process_thread(r: _Run, thread_id: str) -> str:
    hist = r.call("get_thread_history", {"thread_id": thread_id})
    if "error" in hist:
        r.emit("error", hist["error"])
        return f"Thread {thread_id} not found."
    contact = hist["contact"]
    r.call("list_followups", {"contact_email": contact["email"]})
    st = guards.thread_state(thread_id)
    last_out_body = next((m["body"] for m in reversed(st["messages"]) if m["direction"] == "outbound"), "")
    subject = "Re: " + re.sub(r"^(re:\s*)+", "", hist["subject"], flags=re.I)
    body = draft(contact["type"], contact["name"], hist["subject"], last_out_body)

    strat = r.call("get_strategy", {"thread_id": thread_id})
    send_at = datetime.fromisoformat(strat["suggested_send_at_utc"])
    verdict = guards.check(thread_id, send_at, body, now())
    r.emit("plan", "Checked hard rules: " + ("all clear" if verdict["allowed"] else "; ".join(verdict["reasons"])),
           {"verdict": {**verdict, "send_at": str(verdict["send_at"])}})

    if not verdict["allowed"]:
        reasons = verdict["reasons"]
        dup = any("duplicate" in x or "identical" in x for x in reasons)
        decision = "blocked_duplicate" if dup else "skipped"
        r.call("record_decision", {"thread_id": thread_id, "decision": decision,
                                   "reason": "; ".join(reasons),
                                   "key_points": [f"contact type: {contact['type']}",
                                                  f"follow-ups already sent: {hist['summary']['followups_already_sent']}",
                                                  f"recipient wrote last: {hist['summary']['recipient_wrote_last']}"]})
        return f"No follow-up for {contact['name']} ({contact['type']}): {'; '.join(reasons)}."

    r.emit("plan", f"Drafting a {contact['type']} follow-up ({strat['tone']}) for {strat['suggested_send_at_local']}.")
    reason = (f"No reply since our last message; {contact['type']} strategy waits {strat['delay_hours']}h "
              f"and sends in business hours.")
    res = r.call("schedule_followup", {"thread_id": thread_id, "subject": subject, "body": body,
                                       "send_at_utc": strat["suggested_send_at_utc"], "reason": reason,
                                       "strategy": contact["type"]})
    if res.get("status") == "scheduled":
        r.call("record_decision", {"thread_id": thread_id, "decision": "scheduled", "reason": reason,
                                   "key_points": [f"last outbound: {hist['summary']['last_outbound_utc']}",
                                                  f"send at {res['send_at_local']}"]})
        return (f"Scheduled a {contact['type']} follow-up to {contact['name']} for {res['send_at_local']} "
                f"(follow-up #{res['followup_id']}).")
    reasons = res.get("reasons") or [res.get("error", "unknown error")]
    r.call("record_decision", {"thread_id": thread_id, "decision": "skipped", "reason": "; ".join(reasons)})
    return f"Follow-up not scheduled: {'; '.join(reasons)}."


# ---------------------------------------------------------------- raw text parsing

def _guess_type(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(student|assignment|homework|course|class|exam|submission|professor)\b", t):
        return "student"
    if re.search(r"\b(team|report|manager|sprint|standup|deliverable|colleague)\b", t):
        return "employee"
    if re.search(r"\b(proposal|partnership|meeting|contract|vendor|collaboration|rfp)\b", t):
        return "business"
    return "customer"


def _parse_date(s: str | None, fallback: datetime) -> datetime:
    if s:
        s = s.strip()
        try:
            d = parsedate_to_datetime(s)
            if d.tzinfo:
                d = d.astimezone(timezone.utc).replace(tzinfo=None)
            return d.replace(microsecond=0)
        except Exception:
            pass
        iso = s.replace("Z", "+00:00")
        for abbr, off in (("IST", "+05:30"), ("UTC", "+00:00"), ("GMT", "+00:00")):
            iso = re.sub(rf"\s*\b{abbr}\b\s*$", off, iso)
        try:
            d = datetime.fromisoformat(iso)
            if d.tzinfo:
                d = d.astimezone(timezone.utc).replace(tzinfo=None)
            return d.replace(microsecond=0)
        except Exception:
            pass
    return fallback


def parse_raw(text: str) -> dict | None:
    blocks = [b.strip() for b in re.split(r"(?m)^\s*-{3,}\s*$", text) if b.strip()]
    parsed = []
    for b in blocks:
        headers, body_lines, in_body = {}, [], False
        for line in b.splitlines():
            m = re.match(r"^\s*(from|to|date|subject|sent)\s*:\s*(.*)$", line, re.I)
            if not in_body and m:
                headers[m.group(1).lower()] = m.group(2).strip()
                continue
            if not in_body and not line.strip():
                if headers:
                    in_body = True
                continue
            in_body = True
            body_lines.append(line)
        body = "\n".join(body_lines).strip()
        if body:
            parsed.append({"headers": headers, "body": body})
    if not parsed:
        return None

    def addr(h):
        name, email = parseaddr(h or "")
        return name.strip(), email.strip().lower()

    def is_me(h):
        name, email = addr(h)
        low = (h or "").strip().lower()
        sender = config.SENDER_NAME.lower()
        return low in ("me", "i", "us", "myself") or (name and name.lower() in sender) or \
            (email and email == (config.SMTP.get("sender") or "").lower())

    # Who is the contact? Prefer an explicit non-me party with an email address.
    contact_name, contact_email = "", ""
    first = parsed[0]["headers"]
    candidates = []
    if first.get("from") and not is_me(first["from"]) and not first.get("to"):
        candidates.append(first["from"])
    elif first.get("to"):
        candidates.append(first["to"])
    for p in parsed:
        for k in ("from", "to"):
            if p["headers"].get(k) and not is_me(p["headers"][k]):
                candidates.append(p["headers"][k])
    for c in candidates:
        n, e = addr(c)
        if "@" in e and not is_me(c):
            contact_name, contact_email = n, e
            break
    if not contact_email:
        return None
    if not contact_name:
        contact_name = contact_email.split("@")[0].replace(".", " ").title()

    subject = next((p["headers"]["subject"] for p in parsed if p["headers"].get("subject")), None) \
        or _first_sentence(parsed[0]["body"])[:80] or "Follow-up"
    subject = re.sub(r"^(re:\s*|fwd?:\s*)+", "", subject, flags=re.I).strip() or "Follow-up"

    n = now()
    messages = []
    for i, p in enumerate(parsed):
        frm = p["headers"].get("from", "")
        _, femail = addr(frm)
        inbound = bool(frm) and femail == contact_email
        fallback = n - timedelta(hours=24 * (len(parsed) - i))
        sent_at = _parse_date(p["headers"].get("date") or p["headers"].get("sent"), fallback)
        messages.append({"direction": "inbound" if inbound else "outbound", "body": p["body"],
                         "sent_at": sent_at.strftime("%Y-%m-%d %H:%M")})
    return {
        "contact": {"email": contact_email, "name": contact_name, "type": _guess_type(text)},
        "subject": subject,
        "messages": messages,
    }


# ---------------------------------------------------------------- entry point

def run(thread_id: str | None = None, text: str | None = None, on_event=None, run_id: str | None = None,
        _events=None) -> dict:
    run_id = run_id or uuid.uuid4().hex[:10]
    r = _Run(on_event, run_id)
    if _events is not None:  # continue an existing event list (llm -> rules fallback)
        r.events = _events
    own_log = _events is None
    if own_log:
        db.log_action("agent_run_started", thread_id, {"mode": "rules", "has_text": bool(text)}, run_id=run_id)
    summary = ""
    try:
        if not thread_id and not text:
            r.emit("error", "Nothing to process: give a thread_id or text.")
            summary = "Error: no thread_id or text given."
        elif not thread_id:
            r.emit("plan", "Parsing pasted conversation (From/To/Date/Subject headers, blocks split by ---).")
            parsed = parse_raw(text)
            if not parsed:
                r.emit("error", "Could not find a contact email address in the pasted text.")
                summary = ("Error: could not parse the conversation. Use lines like 'From: Name <email>', "
                           "'To:', 'Date:', 'Subject:' and separate messages with '---'.")
            else:
                r.emit("info", f"Detected contact type '{parsed['contact']['type']}' from keywords.",
                       parsed["contact"])
                res = r.call("save_conversation", parsed)
                if "error" in res:
                    summary = f"Error saving conversation: {res['error']}"
                else:
                    thread_id = res["thread_id"]
                    summary = _process_thread(r, thread_id)
        else:
            summary = _process_thread(r, thread_id)
    except Exception as e:
        r.emit("error", f"{type(e).__name__}: {e}")
        summary = f"Error: {type(e).__name__}: {e}"
    if own_log:
        db.log_action("agent_run_finished", thread_id, {"mode": "rules", "decision": r.decision,
                                                         "summary": summary}, run_id=run_id)
    return {"run_id": run_id, "mode": "rules", "thread_id": thread_id, "decision": r.decision,
            "summary": summary, "events": r.events}
