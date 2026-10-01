"""Tools the agent can call. Each returns a JSON-serialisable dict."""
import re
from datetime import datetime, timezone

from . import db, email_tool, guards, strategies
from .clock import now

CONTACT_TYPES = ["customer", "student", "employee", "business"]


def _iso(dt):
    return dt.isoformat(sep=" ") if isinstance(dt, datetime) else dt


def _parse_dt(s: str) -> datetime:
    """Parse 'YYYY-MM-DD HH:MM' (UTC) - also accepts 'T', 'Z', ' UTC' and +HH:MM offsets (converted to UTC)."""
    # strip the zone suffix BEFORE replacing "T", otherwise " UTC" becomes " U C" and fails to parse
    s = re.sub(r"\s*(Z|UTC|GMT)$", "+00:00", s.strip(), flags=re.I).replace("T", " ")
    d = datetime.fromisoformat(s)
    if d.tzinfo:
        d = d.astimezone(timezone.utc).replace(tzinfo=None)
    return d.replace(microsecond=0)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "thread"


# ---------------------------------------------------------------- tool impls

def save_conversation(contact, subject, messages, thread_id=None, _run_id=None):
    email = contact["email"].strip().lower()
    ctype = contact.get("type", "customer")
    if ctype not in CONTACT_TYPES:
        ctype = "customer"
    existing = db.one("SELECT * FROM contacts WHERE email=%s", (email,))
    if existing:
        if contact.get("type") in CONTACT_TYPES and contact["type"] != existing["type"]:
            db.execute("UPDATE contacts SET type=%s WHERE email=%s", (contact["type"], email))
    else:
        db.execute(
            "INSERT INTO contacts (email,name,type,company,timezone) VALUES (%s,%s,%s,%s,%s)",
            (email, contact.get("name") or email.split("@")[0], ctype, contact.get("company"),
             contact.get("timezone") or "Asia/Kolkata"),
        )
    if not thread_id:
        row = db.one("SELECT id FROM threads WHERE contact_email=%s AND LOWER(subject)=LOWER(%s)", (email, subject))
        if row:
            thread_id = row["id"]
        else:  # new thread: never reuse an id owned by another contact (e.g. info@a.com vs info@b.com)
            base = f"{_slug(subject)}-{_slug(email.split('@')[0])}"[:64]
            thread_id, n = base, 2
            while db.one("SELECT id FROM threads WHERE id=%s", (thread_id,)):
                thread_id, n = f"{base[:60]}-{n}", n + 1
    is_new_thread = not db.one("SELECT id FROM threads WHERE id=%s", (thread_id,))
    parsed = sorted(
        [{**m, "sent_at": _parse_dt(m["sent_at"]) if m.get("sent_at") else now()} for m in messages],
        key=lambda m: m["sent_at"],
    )
    if is_new_thread:
        db.execute("INSERT INTO threads (id,subject,contact_email,status,created_at) VALUES (%s,%s,%s,'open',%s)",
                   (thread_id, subject, email, parsed[0]["sent_at"] if parsed else now()))
    added = 0
    for m in parsed:
        dup = db.one("SELECT id FROM messages WHERE thread_id=%s AND direction=%s AND body=%s",
                     (thread_id, m["direction"], m["body"]))
        if dup:
            continue
        out = m["direction"] == "outbound"
        db.execute(
            "INSERT INTO messages (thread_id,direction,sender,recipient,body,sent_at) VALUES (%s,%s,%s,%s,%s,%s)",
            (thread_id, m["direction"], "me" if out else email, email if out else "me", m["body"], m["sent_at"]),
        )
        added += 1
    result = {"thread_id": thread_id, "new_thread": is_new_thread, "messages_added": added,
              "messages_skipped_as_duplicates": len(parsed) - added}
    db.log_action("conversation_saved", thread_id, {"contact": email, "type": ctype, **result}, run_id=_run_id)
    return result


def get_contact(email):
    c = db.one("SELECT * FROM contacts WHERE email=%s", (email.strip().lower(),))
    if not c:
        return {"error": f"no contact {email}"}
    c["threads"] = db.query("SELECT id, subject, status FROM threads WHERE contact_email=%s", (c["email"],))
    return c


def get_thread_history(thread_id):
    st = guards.thread_state(thread_id)
    if not st:
        return {"error": f"thread {thread_id} not found"}
    t = st["thread"]
    tz = t["timezone"]
    they_wrote_last = bool(st["last_inbound"]) and (
        not st["last_outbound"] or st["last_inbound"] > st["last_outbound"])
    return {
        "thread_id": t["id"], "subject": t["subject"], "status": t["status"],
        "contact": {"email": t["contact_email"], "name": t["contact_name"], "type": t["contact_type"],
                    "timezone": tz},
        "now_utc": _iso(now()), "now_recipient_local": strategies.local_str(now(), tz),
        "messages": [
            {"direction": m["direction"], "from": m["sender"], "sent_at_utc": _iso(m["sent_at"]),
             "is_followup": bool(m["is_followup"]), "body": m["body"]}
            for m in st["messages"]
        ],
        "summary": {
            "last_outbound_utc": _iso(st["last_outbound"]), "last_inbound_utc": _iso(st["last_inbound"]),
            "recipient_wrote_last": they_wrote_last,
            "followups_already_sent": st["sent_followups"],
            "pending_followups": [{"id": p["id"], "send_at_utc": _iso(p["send_at"]), "body": p["body"]}
                                  for p in st["pending"]],
        },
    }


def list_followups(contact_email):
    rows = db.query("SELECT id, thread_id, subject, send_at, status, strategy, reason FROM followups "
                    "WHERE contact_email=%s ORDER BY created_at", (contact_email.strip().lower(),))
    return {"followups": [{**r, "send_at": _iso(r["send_at"])} for r in rows]}


def get_strategy(thread_id, deadline_utc=None):
    st = guards.thread_state(thread_id)
    if not st:
        return {"error": f"thread {thread_id} not found"}
    t = st["thread"]
    deadline = _parse_dt(deadline_utc) if deadline_utc else None
    ref = st["last_outbound"]
    if st["last_inbound"] and (not ref or st["last_inbound"] > ref):
        ref = st["last_inbound"]
    suggested = strategies.suggest_send_at(t["contact_type"], ref, now(), t["timezone"], deadline)
    s = strategies.get(t["contact_type"])
    return {
        "contact_type": t["contact_type"], **s,
        "min_gap_hours": strategies.effective_min_gap(
            t["contact_type"], st["last_outbound"], now(), t["timezone"],
            deadline or strategies.thread_deadline(t["subject"], st["messages"], t["timezone"], now())),
        "business_hours": "Mon-Fri 09:00-18:00 recipient local time",
        "suggested_send_at_utc": _iso(suggested),
        "suggested_send_at_local": strategies.local_str(suggested, t["timezone"]),
    }


def schedule_followup(thread_id, subject, body, send_at_utc, reason, strategy=None, kind="followup",
                      recipient_promised_update=False, _run_id=None):
    st = guards.thread_state(thread_id)
    if not st:
        return {"status": "error", "error": f"thread {thread_id} not found"}
    send_at = _parse_dt(send_at_utc)
    verdict = guards.check(thread_id, send_at, body, now(), kind=kind,
                           recipient_promised_update=recipient_promised_update)
    if not verdict["allowed"]:
        db.log_action("followup_blocked", thread_id, {"reasons": verdict["reasons"], "requested_send_at": send_at},
                      run_id=_run_id)
        return {"status": "blocked", "reasons": verdict["reasons"]}
    t = st["thread"]
    fid = db.execute(
        "INSERT INTO followups (thread_id,contact_email,subject,body,send_at,status,strategy,reason,created_at) "
        "VALUES (%s,%s,%s,%s,%s,'pending',%s,%s,%s)",
        (thread_id, t["contact_email"], subject, body, verdict["send_at"], strategy or t["contact_type"], reason,
         now()),
    )
    db.log_action("followup_scheduled", thread_id,
                  {"followup_id": fid, "send_at": verdict["send_at"], "adjustments": verdict["adjustments"],
                   "reason": reason}, run_id=_run_id)
    return {"status": "scheduled", "followup_id": fid, "send_at_utc": _iso(verdict["send_at"]),
            "send_at_local": strategies.local_str(verdict["send_at"], t["timezone"]),
            "adjustments": verdict["adjustments"]}


def send_email_now(thread_id, subject, body, reason, kind="reply", _run_id=None):
    st = guards.thread_state(thread_id)
    if not st:
        return {"status": "error", "error": f"thread {thread_id} not found"}
    t = st["thread"]
    verdict = guards.check(thread_id, now(), body, now(), kind=kind)
    if not verdict["allowed"]:
        db.log_action("send_blocked", thread_id, {"reasons": verdict["reasons"]}, run_id=_run_id)
        return {"status": "blocked", "reasons": verdict["reasons"]}
    if verdict["send_at"] > now():
        return {"status": "not_sent",
                "reason": "outside recipient business hours or too soon after our last message",
                "hint": f"use schedule_followup with send_at_utc={_iso(verdict['send_at'])}"}
    result = deliver(thread_id, t["contact_email"], subject, body, is_followup=(kind != "reply"))
    db.log_action("email_sent", thread_id, {"kind": kind, "reason": reason, **result}, run_id=_run_id)
    return {"status": result["status"], **result}


def cancel_followup(followup_id, reason, _run_id=None):
    f = db.one("SELECT * FROM followups WHERE id=%s", (followup_id,))
    if not f:
        return {"status": "error", "error": f"follow-up {followup_id} not found"}
    if f["status"] != "pending":
        return {"status": "noop", "detail": f"follow-up is already {f['status']}"}
    db.execute("UPDATE followups SET status='cancelled', done_at=%s, reason=CONCAT(IFNULL(reason,''), %s) "
               "WHERE id=%s", (now(), f" | cancelled: {reason}", followup_id))
    db.log_action("followup_cancelled", f["thread_id"], {"followup_id": followup_id, "reason": reason},
                  run_id=_run_id)
    return {"status": "cancelled", "followup_id": followup_id}


def close_thread(thread_id, reason, _run_id=None):
    if not db.one("SELECT id FROM threads WHERE id=%s", (thread_id,)):
        return {"status": "error", "error": f"thread {thread_id} not found"}
    db.execute("UPDATE threads SET status='closed' WHERE id=%s", (thread_id,))
    for p in db.query("SELECT id FROM followups WHERE thread_id=%s AND status='pending'", (thread_id,)):
        cancel_followup(p["id"], "thread closed", _run_id=_run_id)
    db.log_action("thread_closed", thread_id, {"reason": reason}, run_id=_run_id)
    return {"status": "closed", "thread_id": thread_id}


def record_decision(thread_id, decision, reason, key_points=None, _run_id=None):
    db.log_action(f"decision:{decision}", thread_id, {"reason": reason, "key_points": key_points or []},
                  run_id=_run_id)
    return {"status": "recorded"}


# Small product knowledge base so replies to customer questions are grounded, not invented.
PRODUCT_FAQ = [
    {"topic": "WhatsApp integration",
     "keywords": ["whatsapp", "integration", "integrate", "chat", "orders"],
     "answer": "Yes - the Pro plan includes the WhatsApp Business integration. Orders and enquiries that arrive "
               "on WhatsApp are logged in Acme CRM automatically, and your team can reply to them from inside "
               "the CRM. It is not available on the Starter plan."},
    {"topic": "Pro plan pricing and features",
     "keywords": ["pro plan", "price", "pricing", "cost", "upgrade", "per user", "features", "automation"],
     "answer": "The Pro plan is INR 1,450 per user per month (billed annually) and adds workflow automation, "
               "advanced reports and integrations (WhatsApp Business, Gmail/Outlook, Tally). Trial data carries "
               "over when you upgrade."},
    {"topic": "Trial",
     "keywords": ["trial", "extend", "starter"],
     "answer": "Trials run for 14 days on the Starter plan and can be extended by 7 days on request. Upgrading "
               "keeps all trial data."},
    {"topic": "Onboarding and go-live",
     "keywords": ["onboarding", "training", "go live", "go-live", "implementation", "setup"],
     "answer": "Onboarding and two training sessions are included for 20+ licenses; most teams go live within "
               "10 working days of sign-off."},
    {"topic": "HR Lite (rosters, attendance, payroll)",
     "keywords": ["hr", "payroll", "roster", "attendance", "biometric", "shift", "pf", "esi"],
     "answer": "Acme HR Lite covers shift rosters, attendance and payroll with PF/ESI compliance for INR 99 per "
               "employee per month, and integrates with ZKTeco and eSSL biometric devices."},
    {"topic": "Payments and invoices",
     "keywords": ["invoice", "payment", "pay", "neft", "upi", "utr", "receipt"],
     "answer": "Invoices can be paid by NEFT or UPI to the account on the invoice; share the UTR number and we "
               "reconcile within one working day."},
]


def lookup_faq(question):
    q = (question or "").lower()
    scored = []
    for e in PRODUCT_FAQ:
        score = sum(1 for k in e["keywords"] if re.search(rf"\b{re.escape(k)}\b", q))
        if score:
            scored.append((score, e))
    scored.sort(key=lambda x: -x[0])
    matches = [{"topic": e["topic"], "answer": e["answer"]} for _, e in scored[:3]]
    if not matches:
        return {"matches": [], "note": "No documented answer. Do not guess - say you will confirm and get back."}
    return {"matches": matches}


# ---------------------------------------------------------------- shared helpers

def deliver(thread_id, to_email, subject, body, is_followup=True):
    """Send through the email tool and store it as an outbound message in the thread."""
    result = email_tool.send(to_email, subject, body, thread_id)
    if result["status"] == "sent":
        db.execute(
            "INSERT INTO messages (thread_id,direction,sender,recipient,body,sent_at,is_followup) "
            "VALUES (%s,'outbound','me',%s,%s,%s,%s)",
            (thread_id, to_email, body, now(), int(is_followup)),
        )
    return result


IMPLS = {
    "save_conversation": save_conversation,
    "get_contact": get_contact,
    "get_thread_history": get_thread_history,
    "list_followups": list_followups,
    "get_strategy": get_strategy,
    "schedule_followup": schedule_followup,
    "send_email_now": send_email_now,
    "cancel_followup": cancel_followup,
    "close_thread": close_thread,
    "record_decision": record_decision,
    "lookup_faq": lookup_faq,
}
NEEDS_RUN_ID = {"save_conversation", "schedule_followup", "send_email_now", "cancel_followup", "close_thread", "record_decision"}


def execute(name, args, run_id=None):
    fn = IMPLS.get(name)
    if not fn:
        return {"error": f"unknown tool {name}"}
    if name in NEEDS_RUN_ID:
        args = {**args, "_run_id": run_id}
    try:
        return fn(**args)
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


# ---------------------------------------------------------------- schemas for Claude

def _obj(props, required):
    return {"type": "object", "properties": props, "required": required, "additionalProperties": False}


TOOL_SCHEMAS = [
    {
        "name": "save_conversation",
        "description": "Store a conversation the user pasted (new contact/thread or new messages on an existing "
                       "thread). Duplicate messages are skipped automatically. Use only when the input is raw text, "
                       "not an existing thread_id. Times must be UTC 'YYYY-MM-DD HH:MM'.",
        "input_schema": _obj({
            "contact": _obj({
                "email": {"type": "string"},
                "name": {"type": "string"},
                "type": {"type": "string", "enum": CONTACT_TYPES},
                "company": {"type": "string"},
                "timezone": {"type": "string", "description": "IANA zone, e.g. Asia/Kolkata"},
            }, ["email", "name", "type"]),
            "subject": {"type": "string"},
            "messages": {"type": "array", "items": _obj({
                "direction": {"type": "string", "enum": ["inbound", "outbound"],
                              "description": "outbound = sent by us, inbound = sent by the contact"},
                "body": {"type": "string"},
                "sent_at": {"type": "string", "description": "UTC 'YYYY-MM-DD HH:MM'"},
            }, ["direction", "body", "sent_at"])},
        }, ["contact", "subject", "messages"]),
    },
    {
        "name": "get_contact",
        "description": "Look up a contact: name, type (customer/student/employee/business), timezone, threads.",
        "input_schema": _obj({"email": {"type": "string"}}, ["email"]),
    },
    {
        "name": "get_thread_history",
        "description": "Full message history of a thread plus a summary: who wrote last, follow-ups already "
                       "sent, pending follow-ups, current time. Always call this before deciding.",
        "input_schema": _obj({"thread_id": {"type": "string"}}, ["thread_id"]),
    },
    {
        "name": "list_followups",
        "description": "All follow-ups (pending/sent/cancelled) for a contact across every thread.",
        "input_schema": _obj({"contact_email": {"type": "string"}}, ["contact_email"]),
    },
    {
        "name": "get_strategy",
        "description": "Follow-up strategy for this thread's contact type (delay, tone, focus, length, max "
                       "follow-ups) and a suggested send time already adjusted to business hours. Pass "
                       "deadline_utc if the conversation mentions a deadline.",
        "input_schema": _obj({"thread_id": {"type": "string"},
                              "deadline_utc": {"type": "string", "description": "UTC 'YYYY-MM-DD HH:MM'"}},
                             ["thread_id"]),
    },
    {
        "name": "schedule_followup",
        "description": "Queue a follow-up email for later. Safety rules are enforced: it is BLOCKED if a follow-up "
                       "is already pending, the recipient replied, the thread is closed, they opted out or the "
                       "max follow-ups is reached; the time may be moved to respect business hours and a 24h gap. "
                       "Set recipient_promised_update=true only when their last message promised to get back "
                       "to us.",
        "input_schema": _obj({
            "thread_id": {"type": "string"},
            "subject": {"type": "string", "description": "Usually 'Re: <original subject>'"},
            "body": {"type": "string", "description": "Full email body including greeting and sign-off"},
            "send_at_utc": {"type": "string", "description": "UTC 'YYYY-MM-DD HH:MM'"},
            "reason": {"type": "string", "description": "Why this follow-up and this time"},
            "strategy": {"type": "string", "enum": CONTACT_TYPES},
            "kind": {"type": "string", "enum": ["followup", "reply"]},
            "recipient_promised_update": {"type": "boolean"},
        }, ["thread_id", "subject", "body", "send_at_utc", "reason"]),
    },
    {
        "name": "send_email_now",
        "description": "Send an email immediately. Use kind='reply' to answer a question the recipient asked in "
                       "their latest message. Refused outside business hours (then schedule instead).",
        "input_schema": _obj({
            "thread_id": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
            "reason": {"type": "string"},
            "kind": {"type": "string", "enum": ["reply", "followup"]},
        }, ["thread_id", "subject", "body", "reason"]),
    },
    {
        "name": "lookup_faq",
        "description": "Search the product knowledge base (plans, pricing, integrations, trial, onboarding, HR Lite, "
                       "payments). Use it before answering a recipient's question; never invent product facts "
                       "that are not in the results.",
        "input_schema": _obj({"question": {"type": "string"}}, ["question"]),
    },
    {
        "name": "cancel_followup",
        "description": "Cancel a pending follow-up (e.g. it is outdated or the recipient replied).",
        "input_schema": _obj({"followup_id": {"type": "integer"}, "reason": {"type": "string"}},
                             ["followup_id", "reason"]),
    },
    {
        "name": "close_thread",
        "description": "Mark a thread closed (resolved, declined, opted out). Cancels pending follow-ups.",
        "input_schema": _obj({"thread_id": {"type": "string"}, "reason": {"type": "string"}},
                             ["thread_id", "reason"]),
    },
    {
        "name": "record_decision",
        "description": "Record the final decision for this thread in the action log. Call exactly once, last.",
        "input_schema": _obj({
            "thread_id": {"type": "string"},
            "decision": {"type": "string",
                         "enum": ["scheduled", "sent_now", "replied", "skipped", "blocked_duplicate", "closed"]},
            "reason": {"type": "string"},
            "key_points": {"type": "array", "items": {"type": "string"},
                           "description": "The relevant facts from the conversation the decision relied on"},
        }, ["thread_id", "decision", "reason"]),
    },
]
