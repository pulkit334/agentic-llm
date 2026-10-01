"""Turn database rows into the JSON shapes of the API contract.

Conventions:
- Every timestamp goes out twice: as ISO 8601 UTC with a "Z" suffix (for code) and as a
  "*_local" string such as "Thu 01 Oct, 11:00" (for people). Local strings use the contact's
  timezone; the demo clock and the activity log use CLOCK_TZ, the user's own timezone.
- Storage is naive UTC (see followup/db.py), so naive datetimes are treated as UTC.
"""
import json
from datetime import datetime, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from followup import db, strategies
from followup.clock import now

CLOCK_TZ = "Asia/Kolkata"  # the user's own timezone: the demo clock and the activity log are shown in it
LOCAL_FORMAT = "%a %d %b, %H:%M"

# Plain-language label for every action code written to action_log by followup/ (and the API).
ACTION_LABELS = {
    # agent runs
    "agent_run_started": "Agent started working on the conversation",
    "agent_run_finished": "Agent finished",
    "conversation_saved": "Conversation saved",
    "decision:scheduled": "Decision: follow-up scheduled",
    "decision:sent_now": "Decision: email sent right away",
    "decision:replied": "Decision: answered their question",
    "decision:skipped": "Decision: no follow-up needed",
    "decision:blocked_duplicate": "Decision: duplicate follow-up avoided",
    "decision:closed": "Decision: conversation closed",
    # follow-up queue and sending
    "followup_scheduled": "Follow-up scheduled",
    "followup_blocked": "Follow-up blocked by a safety rule",
    "send_blocked": "Email blocked by a safety rule",
    "email_sent": "Email sent",
    "followup_sent": "Follow-up sent",
    "followup_send_failed": "Follow-up could not be sent",
    "followup_cancelled": "Follow-up cancelled",
    "followup_auto_cancelled": "Follow-up cancelled automatically before sending",
    "followup_edited": "Follow-up edited",
    "followup_rescheduled": "Follow-up moved to a new time",
    "thread_closed": "Conversation closed",
    # replies
    "reply_received": "Reply received",
    "reply_synced": "Reply picked up from the inbox",
    "reply_sync": "Inbox checked for new replies",
    # demo and batch
    "clock_advanced": "Demo clock moved forward",
    "batch_started": "Batch run started",
    "batch_finished": "Batch run finished",
    # accounts (kept out of the activity feed, labelled for completeness)
    "user_registered": "Account created",
    "login_success": "Signed in",
    "login_failed": "Sign-in failed",
    "password_changed": "Password changed",
    "user_role_changed": "User role changed",
    "user_active_changed": "User access changed",
}

# Account and security events: recorded in action_log, but not part of the follow-up activity feed.
AUTH_ACTIONS = ("user_registered", "login_success", "login_failed", "password_changed",
                "user_role_changed", "user_active_changed")

# How followups.reason records a cancellation (tools.cancel_followup / scheduler.run_due append these).
_CANCEL_MARKERS = (" | auto-cancelled: ", " | cancelled: ")


# ------------------------------------------------------------------ time

def _to_utc(dt) -> datetime | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.strip().replace("Z", "+00:00"))
    if dt.tzinfo:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(microsecond=0)


def iso(dt) -> str | None:
    """Naive-UTC datetime (or ISO string) -> '2026-10-01T05:30:00Z'; None stays None."""
    d = _to_utc(dt)
    return d.isoformat() + "Z" if d else None


@lru_cache(maxsize=256)
def zone(tz: str | None) -> str:
    """tz when it is a known IANA zone, else CLOCK_TZ.

    Contacts saved from pasted text carry whatever zone the agent extracted; one bad value must
    not break every list that shows the contact (nor the browser's Intl formatting of it)."""
    if tz:
        try:
            ZoneInfo(tz)
            return tz
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return CLOCK_TZ


def local(dt, tz: str | None = None) -> str | None:
    """Naive-UTC datetime -> 'Thu 01 Oct, 11:00' in tz (CLOCK_TZ by default)."""
    d = _to_utc(dt)
    if d is None:
        return None
    return d.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(zone(tz))).strftime(LOCAL_FORMAT)


def clock() -> dict:
    """Clock = {utc, local, tz} for the (simulated) current time."""
    t = now()
    return {"utc": iso(t), "local": local(t, CLOCK_TZ), "tz": CLOCK_TZ}


# ------------------------------------------------------------------ contacts, strategies

def contact(row: dict) -> dict:
    """Contact = {email, name, type, company, timezone}.

    Accepts a contacts row, or a row joined with contacts (plain column names, or the
    contact_* aliases used by guards.thread_state)."""
    email = row.get("email") or row.get("contact_email")
    return {
        "email": email,
        "name": row.get("name") or row.get("contact_name") or (email or "").split("@")[0],
        "type": row.get("type") or row.get("contact_type") or "customer",
        "company": row.get("company") or row.get("contact_company"),
        "timezone": zone(row.get("timezone") or row.get("contact_timezone")),
    }


def strategy(contact_type: str) -> dict:
    """Strategy = {delay_hours, max_followups, tone, focus, length, deadline_lead_hours?}."""
    return dict(strategies.get(contact_type))


# ------------------------------------------------------------------ follow-ups

# Columns followup() expects: the follow-up plus its contact.
FOLLOWUP_SELECT = ("SELECT f.*, c.email, c.name, c.type, c.company, c.timezone "
                   "FROM followups f LEFT JOIN contacts c ON c.email = f.contact_email")


def split_reason(reason: str | None) -> tuple[str | None, str | None]:
    """Stored reason -> (why it was scheduled, why it was cancelled or None)."""
    if not reason:
        return None, None
    for marker in _CANCEL_MARKERS:
        if marker in reason:
            why, cancelled = reason.split(marker, 1)
            return (why.strip() or None), (cancelled.strip() or None)
    return reason, None


def followup(row: dict) -> dict:
    """FollowUp from a followups row joined with contacts (see FOLLOWUP_SELECT).

    Adds next to the contract fields:
    - cancel_reason (str | None): why a cancelled follow-up was stopped; `reason` holds only why
      it was scheduled.
    - done_at / done_at_local (null while pending): when it was actually sent or cancelled. A
      "send due now" run can deliver later than send_at."""
    c = contact(row)
    reason, cancel_reason = split_reason(row.get("reason"))
    return {
        "id": row["id"],
        "thread_id": row["thread_id"],
        "contact": c,
        "subject": row["subject"],
        "body": row["body"],
        "send_at": iso(row["send_at"]),
        "send_at_local": local(row["send_at"], c["timezone"]),
        "status": row["status"],
        "strategy": row.get("strategy"),
        "reason": reason,
        "cancel_reason": cancel_reason,
        "created_at": iso(row["created_at"]),
        "done_at": iso(row.get("done_at")),
        "done_at_local": local(row.get("done_at"), c["timezone"]),
    }


# ------------------------------------------------------------------ activity

# Columns activity() expects: the log row plus the thread subject and contact name, when it has a thread.
ACTIVITY_SELECT = ("SELECT a.*, t.subject AS thread_subject, c.name AS contact_name "
                   "FROM action_log a LEFT JOIN threads t ON t.id = a.thread_id "
                   "LEFT JOIN contacts c ON c.email = t.contact_email")


def action_label(action: str) -> str:
    return ACTION_LABELS.get(action) or (action or "").replace("_", " ").replace(":", ": ").capitalize()


def _details(raw):
    if raw is None or isinstance(raw, dict):
        return raw
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return {"text": str(raw)}
    return value if isinstance(value, dict) else {"value": value}


def activity(row: dict) -> dict:
    """Activity from an action_log row (see ACTIVITY_SELECT).

    Adds run_id (groups the steps of one agent or scheduler run), subject and contact_name
    (null when the action has no thread) next to the contract fields."""
    return {
        "id": row["id"],
        "ts": iso(row["ts"]),
        "ts_local": local(row["ts"], CLOCK_TZ),
        "thread_id": row.get("thread_id"),
        "action": row["action"],
        "label": action_label(row["action"]),
        "details": _details(row.get("details")),
        "run_id": row.get("run_id"),
        "subject": row.get("thread_subject"),
        "contact_name": row.get("contact_name"),
    }


# ------------------------------------------------------------------ conversations

def _in_clause(ids):
    return ", ".join(["%s"] * len(ids))


def _they_wrote_last(last_in, last_out) -> bool:
    # Same rule as guards.check / tools.get_thread_history: a strictly later inbound message.
    return bool(last_in) and (not last_out or last_in > last_out)


def conversation_summaries(thread_ids: list[str] | None = None) -> list[dict]:
    """ConversationSummary for the given threads (all threads when None), most recent activity first.

    Three queries in total, whatever the number of threads."""
    if thread_ids is not None and not thread_ids:
        return []
    where, args = "", ()
    if thread_ids is not None:
        where, args = f" WHERE t.id IN ({_in_clause(thread_ids)})", tuple(thread_ids)
    threads = db.query(
        "SELECT t.id, t.subject, t.status, t.created_at, t.contact_email, c.email, c.name, c.type, "
        "c.company, c.timezone FROM threads t LEFT JOIN contacts c ON c.email = t.contact_email" + where, args)
    if not threads:
        return []
    ids = tuple(t["id"] for t in threads)
    marks = _in_clause(ids)
    msg_stats = {r["thread_id"]: r for r in db.query(
        "SELECT thread_id, COUNT(*) AS n, "
        "MAX(CASE WHEN direction = 'inbound' THEN sent_at END) AS last_in, "
        "MAX(CASE WHEN direction = 'outbound' THEN sent_at END) AS last_out "
        f"FROM messages WHERE thread_id IN ({marks}) GROUP BY thread_id", ids)}
    pending = {}
    for p in db.query(f"SELECT id, thread_id, send_at FROM followups WHERE status = 'pending' "
                      f"AND thread_id IN ({marks}) ORDER BY send_at, id", ids):
        pending.setdefault(p["thread_id"], p)  # earliest pending one per thread

    current = now()
    out = []
    for t in threads:
        c = contact(t)
        stats = msg_stats.get(t["id"]) or {}
        last_in, last_out = stats.get("last_in"), stats.get("last_out")
        last_at = max((d for d in (last_in, last_out) if d), default=None)
        last_from = None
        if last_at:
            last_from = "them" if _they_wrote_last(last_in, last_out) else "us"
        waiting = None
        if t["status"] == "open" and last_at:
            waiting = round(max((current - last_at).total_seconds(), 0) / 3600, 1)
        p = pending.get(t["id"])
        out.append({
            "id": t["id"],
            "subject": t["subject"],
            "status": t["status"],
            "contact": c,
            "message_count": int(stats.get("n") or 0),
            "last_message_at": iso(last_at or t["created_at"]),
            "last_from": last_from,
            "waiting_hours": waiting,
            "pending_followup": {"id": p["id"], "send_at": iso(p["send_at"]),
                                 "send_at_local": local(p["send_at"], c["timezone"])} if p else None,
        })
    out.sort(key=lambda s: (s["last_message_at"] or "", s["id"]), reverse=True)
    return out


def conversation_summary(thread_id: str) -> dict | None:
    """ConversationSummary for one thread, or None when it does not exist.

    waiting_hours: hours since the last message while the thread is open (last_from says who is
    waiting on whom); null for closed threads. last_from: "us" | "them" (null only with no messages)."""
    rows = conversation_summaries([thread_id])
    return rows[0] if rows else None


def message(row: dict, tz: str) -> dict:
    return {
        "id": row["id"],
        "direction": row["direction"],
        "body": row["body"],
        "sent_at": iso(row["sent_at"]),
        "sent_at_local": local(row["sent_at"], tz),
        "is_followup": bool(row["is_followup"]),
    }


# ------------------------------------------------------------------ outbox

def sent_email(row: dict) -> dict:
    """Outbox row (joined with the recipient's timezone as `timezone`) -> Sent item.

    `timezone` is the zone sent_at_local is written in: the recipient's, or CLOCK_TZ when the
    address has no contact."""
    tz = zone(row.get("timezone"))
    return {
        "id": row["id"],
        "thread_id": row.get("thread_id"),
        "to_email": row["to_email"],
        "delivered_to": row["delivered_to"],
        "subject": row["subject"],
        "body": row["body"],
        "provider": row["provider"],
        "status": row["status"],
        "error": row.get("error"),
        "sent_at": iso(row["sent_at"]),
        "sent_at_local": local(row["sent_at"], tz),
        "timezone": tz,
        "contact_name": row.get("name"),
    }
