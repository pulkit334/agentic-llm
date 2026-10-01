"""Read and act on the agent's data: overview, conversations, follow-up queue, sent mail,
activity log, strategies and the sample conversation.

All business rules stay in followup/: replies go through scheduler.simulate_reply,
cancellations through tools.cancel_followup, and the guards re-check every follow-up at send
time. This module only reads rows, applies the user's edits and shapes the JSON.
"""
import threading
import time
from pathlib import Path
from typing import NoReturn

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from followup import agent, config, db, scheduler, strategies, tools

from . import serializers as S
from .deps import current_user

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)])

SAMPLE_FILE = Path(__file__).resolve().parent.parent / "samples" / "new_customer.txt"

MAX_SUBJECT = 500       # followups.subject is VARCHAR(500)
MAX_BODY = 20000
MAX_REASON = 500
MAX_ACTIVITY_LIMIT = 500
RECENT_COUNT = 8
FOLLOWUP_STATUSES = ("pending", "sent", "cancelled")
# Bookkeeping rows left out of the overview's short "recent" list (still in /api/activity).
RECENT_HIDDEN = ("agent_run_started", "agent_run_finished", "reply_sync", "batch_started", "batch_finished")
# Agent decisions and send-time checks that ended with no email going out.
SKIPPED_ACTIONS = ("decision:skipped", "decision:blocked_duplicate", "decision:closed", "followup_auto_cancelled")


# ------------------------------------------------------------------ request bodies

class ReplyRequest(BaseModel):
    body: str = Field(max_length=MAX_BODY)


class FollowupEdit(BaseModel):
    subject: str | None = Field(default=None, max_length=MAX_SUBJECT)
    body: str | None = Field(default=None, max_length=MAX_BODY)


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=MAX_REASON)


# ------------------------------------------------------------------ helpers

def _error(code: int, message: str) -> NoReturn:
    raise HTTPException(code, message)


def _marks(values) -> str:
    return ", ".join(["%s"] * len(values))


def _followup_row(followup_id: int) -> dict | None:
    return db.one(S.FOLLOWUP_SELECT + " WHERE f.id = %s", (followup_id,))


def _activity(thread_id: str | None = None, limit: int = 100, exclude=()) -> list[dict]:
    hidden = tuple(S.AUTH_ACTIONS) + tuple(exclude)
    sql = S.ACTIVITY_SELECT + f" WHERE a.action NOT IN ({_marks(hidden)})"
    args = list(hidden)
    if thread_id:
        sql += " AND a.thread_id = %s"
        args.append(thread_id)
    sql += " ORDER BY a.ts DESC, a.id DESC LIMIT %s"
    args.append(limit)
    return [S.activity(r) for r in db.query(sql, tuple(args))]


# ------------------------------------------------------------------ is Claude usable?

_LLM_OK_TTL = 600         # seconds a verdict is reused (credentials only change on restart)
_LLM_UNREACHABLE_TTL = 60  # retry sooner when the API simply could not be reached
_llm_lock = threading.Lock()
_llm_cache = {"ok": False, "until": 0.0}


def _probe_llm() -> tuple[bool, float]:
    """One cheap authenticated call (model lookup, no tokens) -> (usable, seconds to trust it)."""
    try:
        anthropic.Anthropic(timeout=4.0, max_retries=0).models.retrieve(config.CLAUDE_MODEL)
        return True, _LLM_OK_TTL
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        return False, _LLM_OK_TTL  # key rejected: llm runs will fall back to the rules agent
    except anthropic.APIStatusError:
        return True, _LLM_OK_TTL   # key accepted; any other API problem shows up as a fallback in the run
    except Exception:
        return False, _LLM_UNREACHABLE_TTL


def llm_available() -> bool:
    """True when the agent has Claude credentials that the API accepts (cached)."""
    if not agent._has_credentials():
        return False
    with _llm_lock:
        if time.monotonic() < _llm_cache["until"]:
            return _llm_cache["ok"]
        ok, ttl = _probe_llm()
        _llm_cache.update(ok=ok, until=time.monotonic() + ttl)
        return ok


# ------------------------------------------------------------------ overview

@router.get("/overview")
def overview():
    counts = db.one(
        "SELECT (SELECT COUNT(*) FROM threads) AS conversations, "
        "(SELECT COUNT(*) FROM threads WHERE status = 'open') AS open_threads, "
        "(SELECT COUNT(*) FROM followups WHERE status = 'pending') AS scheduled, "
        "(SELECT COUNT(*) FROM outbox WHERE status = 'sent') AS sent, "
        f"(SELECT COUNT(*) FROM action_log WHERE action IN ({_marks(SKIPPED_ACTIONS)})) AS skipped",
        SKIPPED_ACTIONS)
    return {
        "clock": S.clock(),
        "counts": {
            "conversations": int(counts["conversations"]),
            "open": int(counts["open_threads"]),
            "scheduled": int(counts["scheduled"]),
            "sent": int(counts["sent"]),
            "skipped": int(counts["skipped"]),
        },
        "llm_available": llm_available(),
        "email_mode": config.EMAIL_MODE,
        "recent": _activity(limit=RECENT_COUNT, exclude=RECENT_HIDDEN),
    }


# ------------------------------------------------------------------ conversations

@router.get("/conversations")
def list_conversations():
    return S.conversation_summaries()


@router.get("/conversations/{thread_id}")
def get_conversation(thread_id: str):
    summary = S.conversation_summary(thread_id)
    if not summary:
        _error(status.HTTP_404_NOT_FOUND, "Conversation not found.")
    tz = summary["contact"]["timezone"]
    messages = db.query("SELECT * FROM messages WHERE thread_id = %s ORDER BY sent_at, id", (thread_id,))
    followups = db.query(S.FOLLOWUP_SELECT + " WHERE f.thread_id = %s ORDER BY f.created_at, f.id", (thread_id,))
    return {
        **summary,
        "messages": [S.message(m, tz) for m in messages],
        "followups": [S.followup(f) for f in followups],
        "activity": _activity(thread_id=thread_id, limit=MAX_ACTIVITY_LIMIT),
        "strategy": S.strategy(summary["contact"]["type"]),
    }


@router.post("/conversations/{thread_id}/simulate-reply")
def simulate_reply(thread_id: str, payload: ReplyRequest):
    """Demo control: the contact replies now (on the simulated clock)."""
    body = payload.body.strip()
    if not body:
        _error(status.HTTP_400_BAD_REQUEST, "Write the reply text first.")
    res = scheduler.simulate_reply(thread_id, body)
    if res.get("status") != "ok":
        _error(status.HTTP_404_NOT_FOUND, "Conversation not found.")
    return {"ok": True}


# ------------------------------------------------------------------ follow-up queue

@router.get("/followups")
def list_followups(status_name: str | None = Query(default=None, alias="status")):
    wanted = (status_name or "").strip().lower() or None
    if wanted and wanted not in FOLLOWUP_STATUSES:
        _error(status.HTTP_400_BAD_REQUEST, "status must be one of: pending, sent, cancelled.")
    sql = S.FOLLOWUP_SELECT
    args = ()
    if wanted:
        sql += " WHERE f.status = %s"
        args = (wanted,)
    # Pending soonest first; finished ones most recent first.
    sql += (" ORDER BY f.status = 'pending' DESC, CASE WHEN f.status = 'pending' THEN f.send_at END ASC, "
            "COALESCE(f.done_at, f.send_at) DESC, f.id DESC")
    return [S.followup(r) for r in db.query(sql, args)]


@router.patch("/followups/{followup_id}")
def edit_followup(followup_id: int, payload: FollowupEdit, user: dict = Depends(current_user)):
    """Edit the subject and/or wording of a follow-up that has not gone out yet."""
    row = _followup_row(followup_id)
    if not row:
        _error(status.HTTP_404_NOT_FOUND, "Follow-up not found.")
    if row["status"] != "pending":
        _error(status.HTTP_409_CONFLICT, f"This follow-up was already {row['status']}, so it can't be edited.")
    changes = {}
    for field in ("subject", "body"):
        value = getattr(payload, field)
        if value is None:
            continue
        value = value.strip()
        if not value:
            _error(status.HTTP_400_BAD_REQUEST, f"The {field} can't be empty.")
        if value != row[field]:
            changes[field] = value
    if not changes:
        return S.followup(row)
    sets = ", ".join(f"{k} = %s" for k in changes)
    db.execute(f"UPDATE followups SET {sets} WHERE id = %s AND status = 'pending'",
               (*changes.values(), followup_id))
    row = _followup_row(followup_id)
    if row["status"] != "pending":  # the scheduler sent or cancelled it between our read and the update
        _error(status.HTTP_409_CONFLICT, f"This follow-up was already {row['status']}, so it can't be edited.")
    db.log_action("followup_edited", row["thread_id"],
                  {"followup_id": followup_id, "fields": sorted(changes), "by": user["name"]})
    return S.followup(row)


@router.post("/followups/{followup_id}/cancel")
def cancel_followup(followup_id: int, payload: CancelRequest | None = None, user: dict = Depends(current_user)):
    """Stop a pending follow-up from being sent. Cancelling an already cancelled one is a no-op."""
    note = ((payload.reason if payload else None) or "").strip()
    reason = f"{note} (by {user['name']})" if note else f"cancelled by {user['name']} in the web app"
    res = tools.cancel_followup(followup_id, reason)
    if res.get("status") == "error":
        _error(status.HTTP_404_NOT_FOUND, "Follow-up not found.")
    row = _followup_row(followup_id)
    if row["status"] == "sent":
        _error(status.HTTP_409_CONFLICT, "This follow-up has already been sent, so it can't be cancelled.")
    return S.followup(row)


# ------------------------------------------------------------------ sent mail, activity, strategies, samples

@router.get("/sent")
def list_sent():
    rows = db.query("SELECT o.*, c.name, c.timezone FROM outbox o LEFT JOIN contacts c ON c.email = o.to_email "
                    "ORDER BY o.sent_at DESC, o.id DESC")
    return [S.sent_email(r) for r in rows]


@router.get("/activity")
def list_activity(thread_id: str | None = None, limit: int = 100):
    if not 1 <= limit <= MAX_ACTIVITY_LIMIT:
        _error(status.HTTP_400_BAD_REQUEST, f"limit must be between 1 and {MAX_ACTIVITY_LIMIT}.")
    return _activity(thread_id=(thread_id or "").strip() or None, limit=limit)


@router.get("/strategies")
def get_strategies():
    return {
        "types": {t: S.strategy(t) for t in strategies.STRATEGIES},
        "min_gap_hours": strategies.MIN_GAP_HOURS,
        "deadline_min_gap_hours": strategies.DEADLINE_MIN_GAP_HOURS,
        "business_hours": f"Mon-Fri {strategies.WORK_START:02d}:00-{strategies.WORK_END:02d}:00 local",
    }


@router.get("/samples/new-conversation")
def sample_conversation():
    try:
        return {"text": SAMPLE_FILE.read_text(encoding="utf-8")}
    except FileNotFoundError:
        _error(status.HTTP_404_NOT_FOUND, "The sample conversation file is missing.")
