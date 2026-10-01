"""Run the follow-up agent and stream every step to the browser as Server-Sent Events.

POST /api/agent/run {thread_id | text, mode} answers with text/event-stream:

    event: step
    data: {"type": ..., "text": ..., "data": ..., "step": ...}     one per agent event, in order

    event: result
    data: {RunResult}                                              exactly once, last

followup.agent.run does the work in a worker thread and hands each event to a queue.Queue that
the response drains. While the agent is busy (for example waiting on Claude) a ": ping" comment
goes out every HEARTBEAT_SECONDS so proxies keep the connection open. If the browser goes away
the stream stops, but the run itself finishes: its actions and decision still land in the
action log, exactly as if someone had watched it.
"""
import json
import logging
import queue
import threading
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

import anyio
import pymysql
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from followup import agent, db

from . import serializers
from .deps import current_user

log = logging.getLogger("api.agent")

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)])

HEARTBEAT_SECONDS = 10
MAX_TEXT_CHARS = 50_000

# The workflow step (read -> history -> decide -> timing -> draft -> act -> record) each agent event belongs to.
TOOL_STEPS = {
    "save_conversation": "read",
    "get_contact": "read",
    "get_thread_history": "history",
    "list_followups": "history",
    "lookup_faq": "decide",
    "get_strategy": "timing",
    "schedule_followup": "act",
    "send_email_now": "act",
    "cancel_followup": "act",
    "close_thread": "act",
    "record_decision": "record",
}
TYPE_STEPS = {"plan": "decide", "thinking": "decide", "decision": "record"}
# A "draft" step is announced just before the agent hands an email to one of these tools.
DRAFT_TOOLS = ("schedule_followup", "send_email_now")
DRAFT_TEXT = "Writing the email"

BUSY = "The agent is already working on this conversation. Wait for that run to finish."
NOT_FOUND = "Conversation not found."
DB_DOWN = "The database is unavailable or busy. Please try again in a moment."
RUN_FAILED = "The agent stopped because of a server error. Please try again."

# Threads with a run in progress: two simultaneous runs on one thread could both pass the duplicate
# guard before either has saved its follow-up, so a second run on the same thread is refused (409).
_active_threads: set[str] = set()
_active_lock = threading.Lock()


class RunRequest(BaseModel):
    thread_id: str | None = Field(default=None, max_length=64)
    text: str | None = Field(default=None, max_length=MAX_TEXT_CHARS)
    mode: Literal["llm", "rules"] = "llm"


# ------------------------------------------------------------------ events

def step_of(event: dict) -> str | None:
    """The workflow step an agent event belongs to (None for general info and errors)."""
    if event.get("type") in ("tool_call", "tool_result"):
        return TOOL_STEPS.get((event.get("data") or {}).get("name"))
    return TYPE_STEPS.get(event.get("type"))


def _json_default(o):
    if isinstance(o, datetime):
        return serializers.iso(o)
    if isinstance(o, date):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (set, frozenset, tuple)):
        return list(o)
    return str(o)


def _sse(event: str, payload: dict) -> str:
    # json.dumps escapes newlines inside strings, so the payload is always a single data: line.
    return f"event: {event}\ndata: {json.dumps(payload, default=_json_default, ensure_ascii=False)}\n\n"


# ------------------------------------------------------------------ run result

def _followup_row(where: str, args: tuple) -> dict | None:
    return db.one(f"{serializers.FOLLOWUP_SELECT} WHERE {where} ORDER BY f.send_at, f.id LIMIT 1", args)


def _outcome(res: dict) -> tuple[dict | None, dict | None]:
    """(follow-up, email) for the RunResult.

    follow-up: the one this run scheduled, or, when the run was blocked as a duplicate, the pending
    follow-up that blocked it. email: what this run sent (outbox) or queued (its follow-up).
    """
    scheduled_id = outbox_id = None
    for ev in res.get("events") or []:
        data = ev.get("data") if ev.get("type") == "tool_result" else None
        out = (data or {}).get("result")
        if not isinstance(out, dict):
            continue
        if data.get("name") == "schedule_followup" and out.get("status") == "scheduled":
            scheduled_id = out.get("followup_id")
        elif data.get("name") == "send_email_now" and out.get("status") == "sent":
            outbox_id = out.get("outbox_id")

    row = None
    if scheduled_id:
        row = _followup_row("f.id = %s", (scheduled_id,))
    elif res.get("decision") == "blocked_duplicate" and res.get("thread_id"):
        row = _followup_row("f.thread_id = %s AND f.status = 'pending'", (res["thread_id"],))
    followup = serializers.followup(row) if row else None

    email = None
    sent = db.one("SELECT to_email, subject, body FROM outbox WHERE id = %s", (outbox_id,)) if outbox_id else None
    if sent:
        email = {"subject": sent["subject"], "body": sent["body"], "to": sent["to_email"]}
    elif scheduled_id and row:
        email = {"subject": row["subject"], "body": row["body"], "to": row["contact_email"]}
    return followup, email


def _run_result(res: dict, requested_mode: str) -> dict:
    try:
        followup, email = _outcome(res)
    except Exception:  # the run itself is done and recorded; only the summary card loses its details
        log.exception("Could not load the follow-up / email of agent run %s", res.get("run_id"))
        followup = email = None
    return {
        "run_id": res.get("run_id"),
        "mode": res.get("mode") or requested_mode,
        "thread_id": res.get("thread_id"),
        "decision": res.get("decision"),
        "summary": res.get("summary") or "",
        "followup": followup,
        "email": email,
        "fallback_used": requested_mode == "llm" and res.get("mode") == "rules",
    }


# ------------------------------------------------------------------ worker + stream

class _Run:
    """One streamed agent run: the worker thread fills `queue`, the response drains it."""

    def __init__(self, thread_id: str | None, text: str | None, mode: str):
        self.thread_id = thread_id
        self.text = text
        self.mode = mode
        self.queue: queue.Queue = queue.Queue()
        self.listening = True  # False once the client has gone; the run still completes
        self._last_draft = None

    def _put(self, kind: str, payload: dict):
        if self.listening:
            self.queue.put((kind, payload))

    def on_event(self, ev: dict):
        """agent.run callback (worker thread): forward the event with its workflow step."""
        data = ev.get("data") if isinstance(ev.get("data"), dict) else {}
        if ev.get("type") == "tool_call" and data.get("name") in DRAFT_TOOLS:
            args = data.get("input") or {}
            draft = (args.get("subject"), args.get("body"))
            if draft != self._last_draft:  # the same email re-queued (e.g. a reply moved to business hours)
                self._last_draft = draft
                self._put("step", {"type": "info", "text": DRAFT_TEXT, "step": "draft",
                                   "data": {"subject": draft[0], "body": draft[1]}})
        self._put("step", {"type": ev.get("type"), "text": ev.get("text"), "data": ev.get("data"),
                           "step": step_of(ev)})

    def _failed(self, message: str) -> dict:
        return {"run_id": None, "mode": self.mode, "thread_id": self.thread_id, "decision": None,
                "summary": message, "followup": None, "email": None, "fallback_used": False}

    def work(self):
        """Worker thread: run the agent to the end (even if nobody is listening any more), then post the result."""
        result = None
        try:
            res = agent.run(thread_id=self.thread_id, text=self.text, mode=self.mode, on_event=self.on_event)
            result = _run_result(res, self.mode)
        except Exception as e:
            log.exception("Agent run failed (thread_id=%s, mode=%s)", self.thread_id, self.mode)
            message = DB_DOWN if isinstance(e, pymysql.err.OperationalError) else RUN_FAILED
            self._put("step", {"type": "error", "text": message, "data": None, "step": None})
            result = self._failed(message)
        finally:
            if self.thread_id:
                with _active_lock:
                    _active_threads.discard(self.thread_id)
            self._put("result", result or self._failed(RUN_FAILED))

    async def stream(self):
        """Response body: drain the queue as SSE, with a heartbeat comment while the agent is busy."""
        try:
            while True:
                try:
                    kind, payload = await anyio.to_thread.run_sync(
                        self.queue.get, True, HEARTBEAT_SECONDS, abandon_on_cancel=True)
                except queue.Empty:
                    yield ": ping\n\n"
                    continue
                yield _sse(kind, payload)
                if kind == "result":
                    return
        finally:
            self.listening = False


# ------------------------------------------------------------------ route

@router.post(
    "/agent/run",
    response_class=StreamingResponse,
    responses={200: {"description": "Server-Sent Events: one 'step' event per agent event, then one "
                                    "'result' event with the RunResult.",
                     "content": {"text/event-stream": {}}}},
)
def run_agent(body: RunRequest):
    """Run the agent on a stored conversation (thread_id) or on pasted text, streaming its steps."""
    thread_id = (body.thread_id or "").strip() or None
    text = (body.text or "").strip() or None
    if thread_id and text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Give either a conversation or pasted text, not both.")
    if not thread_id and not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Choose a conversation or paste one for the agent to analyze.")
    if thread_id:
        if not db.one("SELECT id FROM threads WHERE id = %s", (thread_id,)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
        with _active_lock:
            if thread_id in _active_threads:
                raise HTTPException(status.HTTP_409_CONFLICT, BUSY)
            _active_threads.add(thread_id)

    run = _Run(thread_id, text, body.mode)
    try:
        threading.Thread(target=run.work, name=f"agent-run-{thread_id or 'pasted'}", daemon=True).start()
    except Exception:
        if thread_id:
            with _active_lock:
                _active_threads.discard(thread_id)
        raise
    return StreamingResponse(run.stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
