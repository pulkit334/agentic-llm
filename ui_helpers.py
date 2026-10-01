"""Pure presentation helpers for the Streamlit UI (no Streamlit / DB imports - easy to unit test).

All datetimes coming from the backend are naive UTC.
"""
import re
from datetime import datetime
from zoneinfo import ZoneInfo

HOME_TZ = "Asia/Kolkata"  # the user's own time zone ("local India time")

TYPE_LABELS = {"customer": "Customer", "student": "Student", "employee": "Employee", "business": "Business partner"}
TYPE_ICONS = {"customer": "🛍️", "student": "🎓", "employee": "🧑‍💼", "business": "🤝"}

# decision -> (badge text, colour key, icon, plain-language headline)
DECISIONS = {
    "scheduled": ("Follow-up scheduled", "indigo", "📅", "A follow-up email is scheduled."),
    "sent_now": ("Email sent", "green", "📨", "An email was sent right away."),
    "replied": ("Reply sent", "green", "💬", "The assistant answered their question."),
    "skipped": ("Not needed", "gray", "✋", "No email needed right now."),
    "closed": ("Conversation closed", "gray", "🔒", "They said no, so the conversation was closed."),
    "blocked_duplicate": ("Blocked - duplicate", "amber", "🛡️", "A follow-up is already waiting, so no duplicate was created."),
}
UNKNOWN_DECISION = ("Could not finish", "red", "⚠️", "The assistant could not finish this one.")

# Friendly progress steps shown while the agent works: (key, label, tool names that start / finish it)
STEPS = [
    ("read", "Reading the conversation", {"save_conversation", "get_thread_history", "get_contact"}),
    ("history", "Checking past emails", {"list_followups"}),
    ("timing", "Choosing the best time", {"get_strategy", "lookup_faq"}),
    ("write", "Writing the email", {"schedule_followup", "send_email_now", "close_thread"}),
    ("save", "Saving the decision", {"record_decision"}),
]

ACTIONS = {
    "agent_run_started": "Assistant started working",
    "agent_run_finished": "Assistant finished",
    "clock_advanced": "Demo clock moved forward",
    "conversation_saved": "Saved a new conversation",
    "email_sent": "Email sent",
    "followup_auto_cancelled": "Follow-up cancelled automatically",
    "followup_blocked": "Follow-up blocked by a safety rule",
    "followup_cancelled": "Follow-up cancelled",
    "followup_edited": "Follow-up edited",
    "followup_rescheduled": "Follow-up moved",
    "followup_scheduled": "Follow-up scheduled",
    "followup_send_failed": "Sending failed",
    "followup_sent": "Follow-up sent",
    "reply_received": "They replied",
    "reply_synced": "Reply picked up from inbox",
    "send_blocked": "Email blocked by a safety rule",
    "thread_closed": "Conversation closed",
}


def type_label(t):
    return TYPE_LABELS.get(t or "", (t or "Contact").title())


def decision_info(decision):
    return DECISIONS.get(decision or "", UNKNOWN_DECISION)


def action_label(action):
    if action and action.startswith("decision:"):
        return "Decision: " + decision_info(action.split(":", 1)[1])[0]
    return ACTIONS.get(action, (action or "").replace("_", " ").capitalize())


def plural(n, word, many=None):
    return f"{n} {word if n == 1 else (many or word + 's')}"


# ------------------------------------------------------------------ time
def to_local(utc_dt, tz=HOME_TZ):
    if utc_dt is None:
        return None
    if isinstance(utc_dt, str):
        utc_dt = datetime.fromisoformat(utc_dt.replace("Z", ""))
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=ZoneInfo("UTC"))
    return utc_dt.astimezone(ZoneInfo(tz))


def local_to_utc(local_naive, tz=HOME_TZ):
    """Naive local datetime (in tz) -> naive UTC."""
    return local_naive.replace(tzinfo=ZoneInfo(tz)).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def fmt_time(utc_dt, tz=HOME_TZ, with_day=True):
    """'Thu 1 Oct, 11:00 AM' in the given zone."""
    d = to_local(utc_dt, tz)
    if d is None:
        return "-"
    hour = d.strftime("%I:%M %p").lstrip("0")
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}, {hour}" if with_day else hour


def tz_city(tz):
    return (tz or HOME_TZ).split("/")[-1].replace("_", " ")


def humanize_delta(target_utc, now_utc):
    """'in 2 days', 'in 5 hours', '3 hours ago', 'now'."""
    if target_utc is None or now_utc is None:
        return ""
    secs = (target_utc - now_utc).total_seconds()
    future = secs >= 0
    s = abs(secs)
    if s < 60:
        return "now"
    if s < 3600:
        n, unit = round(s / 60), "minute"
    elif s < 86400:
        n, unit = round(s / 3600), "hour"
    else:
        days = s / 86400
        n, unit = (round(days), "day") if days >= 1.5 else (round(s / 3600), "hour")
    text = plural(n, unit)
    return f"in {text}" if future else f"{text} ago"


# ------------------------------------------------------------------ text
def first_sentence(text, limit=220):
    t = " ".join((text or "").split())
    for sep in (". ", "; ", " | "):
        if sep in t:
            t = t.split(sep, 1)[0].rstrip(".") + "."
            break
    return t if len(t) <= limit else t[: limit - 1].rstrip() + "…"


def short(v, n=48):
    v = " ".join(str(v).split())
    return v if len(v) <= n else v[: n - 1].rstrip() + "…"


_LOCAL_TS = re.compile(r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}:\d{2}) "
                       r"([A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?)")
_UTC_TS = re.compile(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?\s*(?:UTC|Z)?")


def humanize_text(text, tz=HOME_TZ):
    """Plain-language version of agent/guard reasons: timestamps -> India time, no internal ids."""
    if not text:
        return ""

    def _loc(m):
        try:
            d = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)} {m.group(4)}", "%d %b %Y %H:%M")
            d = d.replace(tzinfo=ZoneInfo(m.group(5))).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
            return fmt_time(d, tz) + " India time"
        except Exception:
            return m.group(0)

    def _ts(m):
        try:
            return fmt_time(datetime.fromisoformat(f"{m.group(1)} {m.group(2)}"), tz) + " India time"
        except ValueError:
            return m.group(0)

    t = _LOCAL_TS.sub(_loc, text)
    t = _UTC_TS.sub(_ts, t)
    t = re.sub(r"\s*\((?:a )?follow-up #?\d*\)", "", t)
    t = re.sub(r"\s*\(outbox #\d+\)", "", t)
    t = re.sub(r"follow-up #\d+", "a follow-up", t)
    t = t.replace("message(s)", "messages").replace("email(s)", "emails")
    t = re.sub(r"^(duplicate|blocked|skipped|scheduled)\s*:\s*", "", t, flags=re.I)
    for k in TYPE_LABELS:
        t = t.replace(f" ({k})", "")
    return t[:1].upper() + t[1:]


def friendly_reason(decision, reason, name="they"):
    """One plain sentence explaining a decision, for non-technical readers."""
    who = (name or "they").split()[0]
    r = (reason or "").strip()
    low = r.lower()
    if "replied after our last message" in low or "already replied" in low:
        return f"{who} replied, and there's nothing you owe them right now."
    if "already closed" in low or "thread is closed" in low:
        return "This conversation is closed, so nothing more will be sent."
    if "opted out" in low or "declined" in low:
        return f"{who} said no, so the conversation was closed and nothing more will be sent."
    if "duplicate" in low:
        return f"A follow-up to {who} is already waiting, so a second one wasn't created."
    if "max follow-ups" in low:
        return f"{who} has already had the maximum number of reminders for this kind of contact."
    if "identical" in low:
        return "The same email was already sent before, so it wasn't repeated."
    if "nothing to reply to" in low:
        return "You sent the last message, so there's nothing to reply to."
    if "asked a question" in low:
        q = re.search(r'"([^"]+)"', r)
        queued = " It goes out during their working hours." if "queued" in low else ""
        return (f"{who} asked a question" + (f" (“{short(q.group(1), 90)}”)" if q else "")
                + ", so the assistant answered it." + queued)
    if low.startswith("no reply since our last message"):
        tail = ""
        dl = re.search(r"before the deadline \(([^)]+)\)", r)
        if dl:
            tail = " and before the deadline (" + humanize_text(dl.group(1)) + ")"
        return f"{who} hasn't replied yet, so a polite reminder is scheduled during their working hours{tail}."
    if low.startswith("reply not sent"):
        return "The reply couldn't be sent: " + first_sentence(humanize_text(r.split(":", 1)[-1].strip()))
    if not r:
        return decision_info(decision)[3]
    return first_sentence(humanize_text(r))


# ------------------------------------------------------------------ agent events
def used_fallback(result, requested_mode):
    """True when the Claude brain was requested but the run fell back to the offline rules."""
    if requested_mode != "llm":
        return False
    if (result or {}).get("mode") == "rules":
        return True
    return any(ev.get("type") in ("info", "error") and "falling back" in (ev.get("text") or "").lower()
               for ev in (result or {}).get("events") or [])


def real_errors(result):
    """Errors that are NOT just the expected 'Claude unavailable -> using rules' fallback."""
    errs = []
    for ev in (result or {}).get("events") or []:
        txt = ev.get("text") or ""
        if ev.get("type") == "error" and not txt.startswith("Claude API error"):
            errs.append(txt)
    return errs


def extract_email(events):
    """The email the agent scheduled/sent in this run: dict(kind, status, subject, body, followup_id, send_at)."""
    calls = {}
    email = None
    for ev in events or []:
        data = ev.get("data") or {}
        name = data.get("name")
        if ev.get("type") == "tool_call" and name in ("schedule_followup", "send_email_now"):
            calls[name] = data.get("input") or {}
        elif ev.get("type") == "tool_result" and name in ("schedule_followup", "send_email_now"):
            res = data.get("result") or {}
            inp = calls.get(name, {})
            if res.get("status") in ("scheduled", "sent"):
                email = {
                    "kind": "scheduled" if name == "schedule_followup" else "sent",
                    "status": res.get("status"),
                    "subject": inp.get("subject", ""),
                    "body": inp.get("body", ""),
                    "followup_id": res.get("followup_id"),
                    "send_at": res.get("send_at_utc"),
                }
    return email


def decision_reason(events):
    for ev in reversed(events or []):
        if ev.get("type") == "decision":
            return (ev.get("data") or {}).get("reason") or ""
    return ""


def progress(events):
    """Map raw agent events to the friendly step list while the agent is still working.

    Returns [(label, state)] where state is 'done' | 'active' | 'todo'.
    """
    reached = -1
    finished = False
    for ev in events or []:
        if ev.get("type") in ("tool_call", "tool_result"):
            name = (ev.get("data") or {}).get("name")
            for i, (_, _, tools) in enumerate(STEPS):
                if name in tools:
                    reached = max(reached, i)
        if ev.get("type") == "decision":
            finished = True
            reached = len(STEPS) - 1
    out = []
    for i, (_, label, _) in enumerate(STEPS):
        if i < reached or (finished and i == reached):
            state = "done"
        elif i == reached:
            state = "active"
        else:
            state = "todo"
        out.append([label, state])
    return out


def _tool_results(events):
    out = {}
    for ev in events or []:
        if ev.get("type") == "tool_result":
            data = ev.get("data") or {}
            out.setdefault(data.get("name"), []).append(data.get("result") or {})
    return out


def final_steps(events, decision=None):
    """Honest step list after the run, built from the tools that actually ran.

    States: 'done' | 'skipped' (not needed for this decision) | 'failed' (the run stopped before it).
    """
    used = {(ev.get("data") or {}).get("name") for ev in events or [] if ev.get("type") == "tool_call"}
    finished = bool(decision) or any(ev.get("type") == "decision" for ev in events or [])
    mail = extract_email(events)
    closed = any(r.get("status") == "closed" for r in _tool_results(events).get("close_thread", []))
    miss = "skipped" if finished else "failed"

    steps = [
        ["Read the conversation", "done" if used & STEPS[0][2] else miss],
        ["Checked past emails", "done" if "list_followups" in used else miss],
        ["Chose the best time", "done" if used & STEPS[2][2] else miss],
    ]
    if mail:
        steps.append(["Wrote the email", "done"])
    elif closed:
        steps.append(["Closed the conversation", "done"])
    elif finished:
        steps.append(["No email needed", "skipped"])
    else:
        steps.append(["Writing the email", "failed"])
    if not finished:
        steps.append(["Saving the decision", "failed"])
    elif mail and mail["kind"] == "scheduled":
        steps.append(["Scheduled it and saved the decision", "done"])
    elif mail:
        steps.append(["Sent it and saved the decision", "done"])
    else:
        steps.append(["Saved the decision (nothing scheduled)", "done"])
    return steps


# Hard rules enforced in code before anything is sent: (label, substrings meaning the rule FAILED)
HARD_RULES = [
    ("Conversation is still open", ("thread is closed",)),
    ("They haven't said no / opted out", ("opted out", "declined")),
    ("They haven't replied since our last email", ("already replied",)),
    ("No follow-up already waiting (no duplicates)", ("duplicate",)),
    ("Under the reminder limit for this contact type", ("max follow-ups",)),
    ("Not repeating an email already sent", ("identical",)),
]


def hard_rule_checks(events):
    """[(rule, 'pass'|'fail'|'n/a')] from the guard verdicts seen in this run."""
    reasons, checked = [], False
    for ev in events or []:
        data = ev.get("data") or {}
        if ev.get("type") == "plan" and isinstance(data.get("verdict"), dict):
            checked = True
            reasons += data["verdict"].get("reasons") or []
        if ev.get("type") == "tool_result" and data.get("name") in ("schedule_followup", "send_email_now"):
            res = data.get("result") or {}
            if res.get("status") in ("scheduled", "sent", "blocked"):
                checked = True
                reasons += res.get("reasons") or []
    low = " | ".join(map(str, reasons)).lower()
    return [(label, "n/a" if not checked else ("fail" if any(n in low for n in needles) else "pass"))
            for label, needles in HARD_RULES]


KEY_ARGS = ("thread_id", "contact_email", "followup_id", "send_at_utc", "deadline_utc", "decision", "kind",
            "subject", "question")


def trace_rows(events):
    """Compact table of tool calls: step #, tool, key args, short result, ms (when timing was recorded)."""
    rows, pending = [], {}
    for ev in events or []:
        data = ev.get("data") or {}
        name = data.get("name")
        if ev.get("type") == "tool_call":
            inp = data.get("input") or {}
            if name == "save_conversation":
                inp = {"contact_email": (inp.get("contact") or {}).get("email"), "subject": inp.get("subject")}
            args = ", ".join(f"{k}={short(inp[k], 32)}" for k in KEY_ARGS if inp.get(k) not in (None, ""))
            row = {"#": len(rows) + 1, "Tool": name, "Key arguments": args, "Result": "", "ms": None}
            rows.append(row)
            pending.setdefault(name, []).append((row, ev.get("_t")))
        elif ev.get("type") == "tool_result" and pending.get(name):
            row, t0 = pending[name].pop(0)
            res = data.get("result") or {}
            bits = [f"{k}={res[k]}" for k in ("status", "followup_id", "send_at_utc", "thread_id", "new_thread",
                                              "outbox_id") if res.get(k) not in (None, "")]
            if res.get("error"):
                bits.append("error=" + short(res["error"]))
            if res.get("reasons"):
                bits.append("reasons=" + short("; ".join(map(str, res["reasons"])), 80))
            for k, one_, many in (("followups", "follow-up", "follow-ups"), ("matches", "FAQ match", "FAQ matches"),
                                  ("messages", "message", "messages")):
                if isinstance(res.get(k), list):
                    bits.append(plural(len(res[k]), one_, many))
            row["Result"] = ", ".join(bits) or short(res, 80)
            if t0 is not None and ev.get("_t") is not None:
                row["ms"] = round((ev["_t"] - t0) * 1000)
    return rows


# ------------------------------------------------------------------ activity log
HIDDEN_ACTIONS = {"agent_run_started", "agent_run_finished", "clock_advanced"}


def activity_sentence(action, details, name, subject):
    """Plain-language line for one action_log row (None = hide it in Simple view)."""
    if action in HIDDEN_ACTIONS:
        return None
    d = details if isinstance(details, dict) else {}
    who = name or "someone"
    about = f" about “{subject}”" if subject else ""
    if action == "reply_received":
        return f"{who} replied{about}"
    if action == "reply_synced":
        return f"Picked up a reply from {who} from the inbox{about}"
    if action == "conversation_saved":
        return f"Saved a conversation with {who}{about}"
    if action == "followup_scheduled":
        when = d.get("send_at")
        return f"Follow-up to {who} scheduled" + (f" for {fmt_time(when)}" if when else "")
    if action == "followup_sent":
        return f"Follow-up sent to {who}{about}"
    if action == "email_sent":
        return (f"Replied to {who}" if d.get("kind") == "reply" else f"Email sent to {who}") + about
    if action == "followup_cancelled":
        return f"Follow-up to {who} cancelled"
    if action == "followup_auto_cancelled":
        reason = (d.get("reason") or "").lower()
        why = ("they had already replied" if "replied" in reason else
               "they had said no" if "opted out" in reason or "declined" in reason else
               "the conversation was closed" if "closed" in reason else "a safety rule stopped it")
        return f"Follow-up to {who} not sent - {why}"
    if action in ("followup_blocked", "send_blocked"):
        return f"Stopped an extra email to {who} (safety rule)"
    if action == "followup_send_failed":
        return f"Sending to {who} failed"
    if action == "thread_closed":
        return f"Conversation with {who} closed"
    if action == "followup_edited":
        return f"You edited the follow-up to {who}"
    if action == "followup_rescheduled":
        when = d.get("send_at")
        return f"You moved the follow-up to {who}" + (f" to {fmt_time(when)}" if when else "")
    if action.startswith("decision:"):
        dec = action.split(":", 1)[1]
        text = {"scheduled": f"Decided to follow up with {who}",
                "sent_now": f"Decided to email {who} right away",
                "replied": f"Decided to answer {who}'s question",
                "skipped": f"Decided no email is needed for {who}",
                "closed": f"Decided to close the conversation with {who}",
                "blocked_duplicate": f"Stopped a duplicate follow-up to {who}"}.get(dec)
        return text or f"Decision for {who}: {decision_info(dec)[0]}"
    return f"{action_label(action)} - {who}"


# ------------------------------------------------------------------ simple "new person" form
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def valid_email(s):
    return bool(EMAIL_RE.match((s or "").strip()))


def build_messages(sent_body, sent_at_utc, reply_body=None, reply_at_utc=None):
    """Messages list for tools.save_conversation from the simple form (times are naive UTC)."""
    msgs = [{"direction": "outbound", "body": sent_body.strip(), "sent_at": sent_at_utc.strftime("%Y-%m-%d %H:%M")}]
    if reply_body and reply_body.strip():
        msgs.append({"direction": "inbound", "body": reply_body.strip(),
                     "sent_at": (reply_at_utc or sent_at_utc).strftime("%Y-%m-%d %H:%M")})
    return msgs


def missing_form_fields(form):
    """Plain names of the required fields still empty / invalid in the new-person form."""
    miss = []
    if not (form.get("name") or "").strip():
        miss.append("their name")
    if not valid_email(form.get("email")):
        miss.append("a valid email address" if (form.get("email") or "").strip() else "their email")
    if not (form.get("subject") or "").strip():
        miss.append("what it's about")
    if not (form.get("sent_body") or "").strip():
        miss.append("what you sent them")
    return miss
