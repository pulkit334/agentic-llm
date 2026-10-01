"""Hard rules that stop duplicate or unnecessary follow-ups.

Enforced in code, so they hold even if the LLM gets it wrong.
"""
from datetime import datetime, timedelta

from . import db, strategies

CLOSING_PHRASES = [
    "not interested", "unsubscribe", "stop emailing", "remove me", "no longer need",
    "we went with another", "decided to go with", "please don't contact",
]


def thread_state(thread_id: str) -> dict:
    t = db.one(
        "SELECT t.*, c.type AS contact_type, c.timezone, c.name AS contact_name "
        "FROM threads t JOIN contacts c ON c.email=t.contact_email WHERE t.id=%s",
        (thread_id,),
    )
    if not t:
        return {}
    msgs = db.query("SELECT * FROM messages WHERE thread_id=%s ORDER BY sent_at, id", (thread_id,))
    last_out = max((m["sent_at"] for m in msgs if m["direction"] == "outbound"), default=None)
    last_in = max((m["sent_at"] for m in msgs if m["direction"] == "inbound"), default=None)
    sent_followups = sum(1 for m in msgs if m["direction"] == "outbound" and m["is_followup"])
    pending = db.query("SELECT * FROM followups WHERE thread_id=%s AND status='pending'", (thread_id,))
    return {
        "thread": t, "messages": msgs, "last_outbound": last_out, "last_inbound": last_in,
        "sent_followups": sent_followups, "pending": pending,
    }


def check(thread_id: str, send_at: datetime, body: str, now: datetime, ignore_followup_id=None,
          kind: str = "followup", recipient_promised_update: bool = False,
          min_gap_hours: float | None = None, deadline: datetime | None = None) -> dict:
    """Return {"allowed": bool, "reasons": [...], "send_at": adjusted_time, "adjustments": [...]}.

    kind="reply" is a direct answer to the recipient's latest message (allowed when they wrote last).
    recipient_promised_update=True lets us follow up after their reply when they said they'd get back to us.
    min_gap_hours overrides the minimum gap. Otherwise the gap is strategies.effective_min_gap: 24h, or 12h for a
    student/employee reminder whose deadline (given, or stated by us in the thread) 24h would miss.
    """
    st = thread_state(thread_id)
    if not st:
        return {"allowed": False, "reasons": [f"thread {thread_id} not found"], "send_at": send_at, "adjustments": []}
    t = st["thread"]
    strat = strategies.get(t["contact_type"])
    reasons, adjustments = [], []

    if t["status"] == "closed":
        reasons.append("thread is closed")

    last_inbound_body = next(
        (m["body"].lower() for m in reversed(st["messages"]) if m["direction"] == "inbound"), "")
    if any(p in last_inbound_body for p in CLOSING_PHRASES):
        reasons.append("recipient opted out / declined in their last message")

    they_wrote_last = bool(st["last_inbound"]) and (
        not st["last_outbound"] or st["last_inbound"] > st["last_outbound"])
    if kind == "reply":
        if not they_wrote_last:
            reasons.append("nothing to reply to: we already sent the last message")
    elif they_wrote_last and not recipient_promised_update:
        reasons.append("recipient already replied after our last message - answer them instead of chasing")

    pending = [p for p in st["pending"] if p["id"] != ignore_followup_id]
    if pending and kind != "reply":
        p = pending[0]
        reasons.append(f"duplicate: follow-up #{p['id']} is already pending for {p['send_at']} UTC")

    if kind != "reply" and st["sent_followups"] >= strat["max_followups"]:
        reasons.append(f"max follow-ups reached ({st['sent_followups']}/{strat['max_followups']} for "
                       f"{t['contact_type']})")

    norm = " ".join(body.lower().split())
    for m in st["messages"]:
        if m["direction"] == "outbound" and " ".join(m["body"].lower().split()) == norm:
            reasons.append("identical message was already sent in this thread")
            break

    adjusted = max(send_at, now)
    last_contact = max([d for d in (st["last_outbound"], st["last_inbound"] if recipient_promised_update else None)
                        if d], default=None)
    if kind != "reply" and last_contact:
        gap = min_gap_hours
        if gap is None:
            dl = deadline or strategies.thread_deadline(t["subject"], st["messages"], t["timezone"], now)
            gap = strategies.effective_min_gap(t["contact_type"], last_contact, now, t["timezone"], dl)
        earliest = last_contact + timedelta(hours=gap)
        if adjusted < earliest:
            adjusted = earliest
            note = "" if gap == strategies.MIN_GAP_HOURS else " (shortened so the reminder lands before the deadline)"
            adjustments.append(f"moved to respect {gap:g}h minimum gap since our last message{note}")
    slot = strategies.next_business_slot(adjusted, t["timezone"])
    if slot != adjusted.replace(microsecond=0):
        adjustments.append("moved into recipient's business hours (Mon-Fri 09:00-18:00 local)")
        adjusted = slot

    return {"allowed": not reasons, "reasons": reasons, "send_at": adjusted, "adjustments": adjustments}
