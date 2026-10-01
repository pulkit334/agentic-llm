"""Background scheduler: delivers due follow-ups, re-checking the guards right before sending.

Works on the simulated clock, so the demo can fast-forward time with advance(hours).
"""
import uuid
from datetime import timedelta

from . import clock, config, db, guards, tools


def _new_run_id():
    return "sched-" + uuid.uuid4().hex[:8]


def _cancel_reason(f) -> str | None:
    """Why a due follow-up must NOT be sent any more (None = OK to send)."""
    st = guards.thread_state(f["thread_id"])
    if not st:
        return "thread no longer exists"
    if st["thread"]["status"] == "closed":
        return "thread is closed"
    inbound = [m for m in st["messages"] if m["direction"] == "inbound"]
    # A reply at the same simulated instant as creation still counts as "after" (demo clock does not tick).
    replied = [m for m in inbound if m["sent_at"] >= f["created_at"]]
    if replied:
        return f"recipient replied at {replied[-1]['sent_at']} UTC, after this follow-up was scheduled"
    if inbound:
        last = inbound[-1]["body"].lower()
        if any(p in last for p in guards.CLOSING_PHRASES):
            return "recipient opted out / declined"
    return None


def sync_inbox(run_id=None, since_days: int = 7) -> dict | None:
    """Pull real replies over IMAP before sending, so a reply cancels its pending follow-up.

    Only runs when EMAIL_MODE == "smtp" and a mailbox login is configured; returns None otherwise.
    Never raises; the outcome is recorded in the action log as 'reply_sync'.
    """
    if config.EMAIL_MODE != "smtp":
        return None
    try:
        from . import imap_sync
        if not imap_sync.is_configured():
            return None
        res = imap_sync.sync_replies(since_days=since_days)
    except Exception as e:  # never block sending because the inbox check broke
        res = {"error": f"{type(e).__name__}: {e}"}
    summary = {k: res.get(k) for k in ("checked", "added", "duplicates", "since", "error") if k in res}
    if res.get("threads"):
        summary["threads"] = [t.get("thread_id") for t in res["threads"]]
    try:
        db.log_action("reply_sync", None, summary, run_id=run_id)
    except Exception:
        pass
    return res


def run_due(run_id=None, sync: bool = True) -> list[dict]:
    run_id = run_id or _new_run_id()
    if sync:
        sync_inbox(run_id)
    now = clock.now()
    due = db.query("SELECT * FROM followups WHERE status='pending' AND send_at <= %s ORDER BY send_at, id", (now,))
    results = []
    for f in due:
        base = {"followup_id": f["id"], "thread_id": f["thread_id"], "to": f["contact_email"],
                "subject": f["subject"], "send_at": f["send_at"]}
        reason = _cancel_reason(f)
        if reason:
            db.execute("UPDATE followups SET status='cancelled', done_at=%s, "
                       "reason=CONCAT(IFNULL(reason,''), %s) WHERE id=%s",
                       (now, f" | auto-cancelled: {reason}", f["id"]))
            db.log_action("followup_auto_cancelled", f["thread_id"], {"followup_id": f["id"], "reason": reason},
                          run_id=run_id)
            results.append({**base, "status": "cancelled", "reason": reason})
            continue
        try:
            res = tools.deliver(f["thread_id"], f["contact_email"], f["subject"], f["body"], is_followup=True)
        except Exception as e:  # never crash the scheduler loop
            res = {"status": "failed", "error": f"{type(e).__name__}: {e}"}
        if res.get("status") == "sent":
            db.execute("UPDATE followups SET status='sent', done_at=%s WHERE id=%s", (now, f["id"]))
            db.log_action("followup_sent", f["thread_id"], {"followup_id": f["id"], **res}, run_id=run_id)
            results.append({**base, "status": "sent", "outbox_id": res.get("outbox_id"),
                            "provider": res.get("provider"), "delivered_to": res.get("delivered_to")})
        else:
            db.log_action("followup_send_failed", f["thread_id"], {"followup_id": f["id"], **res}, run_id=run_id)
            results.append({**base, "status": "failed", "reason": res.get("error")})
    return results


def advance(hours: float) -> dict:
    """Fast-forward the clock, stopping at each pending send_at on the way so every follow-up
    goes out (and is timestamped) at its scheduled time rather than at the end of the jump."""
    start = clock.now()
    target = start + timedelta(hours=hours)
    run_id = _new_run_id()
    results = []
    stops = db.query("SELECT DISTINCT send_at FROM followups WHERE status='pending' AND send_at > %s "
                     "AND send_at <= %s ORDER BY send_at", (start, target))
    results += run_due(run_id)  # anything already overdue (also syncs real replies once, in smtp mode)
    for s in stops:
        clock.set_now(s["send_at"])
        results += run_due(run_id, sync=False)
    clock.set_now(target)
    results += run_due(run_id, sync=False)
    db.log_action("clock_advanced", None, {"hours": hours, "from": start, "now": target}, run_id=run_id)
    return {"now": target, "results": results}


def simulate_reply(thread_id: str, body: str) -> dict:
    t = db.one("SELECT * FROM threads WHERE id=%s", (thread_id,))
    if not t:
        return {"status": "error", "error": f"thread {thread_id} not found"}
    now = clock.now()
    mid = db.execute(
        "INSERT INTO messages (thread_id,direction,sender,recipient,body,sent_at,is_followup) "
        "VALUES (%s,'inbound',%s,'me',%s,%s,0)",
        (thread_id, t["contact_email"], body, now),
    )
    db.log_action("reply_received", thread_id, {"message_id": mid, "from": t["contact_email"], "body": body})
    return {"status": "ok", "message_id": mid, "thread_id": thread_id, "sent_at": now}
