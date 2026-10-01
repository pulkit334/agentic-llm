"""Follow-up agent: Claude manual tool-use loop (mode "llm") with a deterministic fallback (mode "rules").

run(thread_id=None, text=None, mode="llm", on_event=None) -> dict
"""
import json
import uuid

import anthropic

from . import config, db, rule_agent, tools
from .clock import now

MAX_ITERATIONS = 15
FALLBACK_BETA = "server-side-fallback-2026-07-01"

SYSTEM_PROMPT = f"""You are an autonomous email follow-up agent working on behalf of {config.SENDER_NAME}.
You analyse a conversation, decide whether a follow-up is needed, choose when to send it, draft it, and
schedule or send it with your tools. Every tool call is recorded in an action log.

Follow this workflow:

1. If you are given raw pasted text (not a thread id): extract the contact (email, name, and type -
   customer, student, employee or business - inferred from context), the subject, and every message with
   its direction (outbound = written by us / the user, inbound = written by the contact) and its UTC time
   ('YYYY-MM-DD HH:MM'). If times are missing, assume them relative to the current time given in the
   request. Then call save_conversation and use the thread_id it returns.

2. Check previous communication: call get_thread_history, and list_followups for the contact's email.

3. Decide whether a follow-up is needed. It is NOT needed if: the recipient replied and nothing is pending
   from them, the thread is resolved, they declined or opted out (consider close_thread), a follow-up is
   already pending, or the maximum number of follow-ups has been reached.
   - If they asked us a question, send a reply (kind="reply") that answers it instead of a follow-up.
   - If they promised to get back to us, follow up after a sensible wait with
     recipient_promised_update=true.

4. If a message is warranted: call get_strategy (pass deadline_utc if a deadline is mentioned) and pick
   the send time (normally the suggested time). Draft the message in that strategy's tone and length,
   referencing specific, relevant details from the thread only, with one clear call to action, signed as
   {config.SENDER_NAME}. Subject: "Re: <original subject>".

5. Use schedule_followup (or send_email_now for replies within the recipient's business hours). If a tool
   returns status "blocked", do NOT retry with workarounds - accept the block and record it.

6. Call record_decision exactly once, at the end, with key_points listing the facts you relied on.

Finish with a 2-3 sentence plain-text summary of what you did and why."""


def _trunc(s, n=600):
    return s if len(s) <= n else s[:n] + "..."


class _Ctx:
    def __init__(self, on_event, run_id):
        self.on_event = on_event
        self.run_id = run_id
        self.events = []
        self.decision = None
        self.thread_id = None
        self.use_fallbacks = True

    def emit(self, type_, text, data=None):
        ev = {"type": type_, "text": text, "data": data}
        self.events.append(ev)
        if self.on_event:
            try:
                self.on_event(ev)
            except Exception:
                pass
        return ev


def _create(client, ctx: _Ctx, **kw):
    """Call the API with server-side refusal fallback; drop it for the run if the API rejects it."""
    if ctx.use_fallbacks:
        try:
            return client.beta.messages.create(**kw, betas=[FALLBACK_BETA], fallbacks="default")
        except anthropic.BadRequestError as e:
            msg = str(e).lower()
            if "fallback" not in msg and "beta" not in msg:
                raise
            ctx.use_fallbacks = False
            ctx.emit("info", "Server-side refusal fallback not available; continuing without it.",
                     {"error": _trunc(str(e), 300)})
    return client.messages.create(**kw)


def _run_tool(ctx: _Ctx, block) -> dict:
    name, args = block.name, dict(block.input or {})
    ctx.emit("tool_call", f"{name}({_trunc(json.dumps(args, default=str), 300)})", {"name": name, "input": args})
    result = tools.execute(name, args, ctx.run_id)
    is_error = isinstance(result, dict) and ("error" in result or result.get("status") == "error")
    text = json.dumps(result, default=str)
    ctx.emit("tool_result", f"{name} -> {_trunc(text)}", {"name": name, "result": result, "is_error": is_error})
    if name == "save_conversation" and not is_error:
        ctx.thread_id = result.get("thread_id") or ctx.thread_id
    if name in ("get_thread_history", "get_strategy", "schedule_followup", "record_decision") and args.get("thread_id"):
        ctx.thread_id = ctx.thread_id or args["thread_id"]
    if name == "record_decision" and not is_error:
        ctx.decision = args.get("decision")
        ctx.emit("decision", f"{args.get('decision')}: {args.get('reason', '')}", args)
    return {"type": "tool_result", "tool_use_id": block.id, "content": text, "is_error": is_error}


def _llm_loop(ctx: _Ctx, thread_id, text) -> str:
    client = anthropic.Anthropic()
    header = f"Current time (UTC): {now().strftime('%Y-%m-%d %H:%M')}\n"
    if thread_id:
        user = header + f"Process existing thread: {thread_id}"
    else:
        user = header + f"New conversation from the user:\n{text}"
    messages = [{"role": "user", "content": user}]
    summary = ""

    for i in range(MAX_ITERATIONS):
        resp = _create(
            client, ctx,
            model=config.CLAUDE_MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            tools=tools.TOOL_SCHEMAS,
            messages=messages,
            thinking={"type": "adaptive", "display": "summarized"},
            output_config={"effort": config.CLAUDE_EFFORT},
        )
        tool_uses, texts = [], []
        for b in resp.content:
            t = getattr(b, "type", None)
            if t == "thinking":
                if (b.thinking or "").strip():
                    ctx.emit("thinking", b.thinking.strip())
            elif t == "text":
                if b.text.strip():
                    texts.append(b.text.strip())
                    ctx.emit("plan", b.text.strip())
            elif t == "tool_use":
                tool_uses.append(b)
            elif t == "fallback":
                ctx.emit("info", "Request was handed to the fallback model after a refusal.")
        if texts:
            summary = texts[-1]
        messages.append({"role": "assistant", "content": resp.content})

        stop = resp.stop_reason
        if stop == "refusal":
            details = getattr(resp, "stop_details", None)
            ctx.emit("error", "Model refused the request.", {"stop_details": str(details) if details else None})
            return summary or "Stopped: the model refused this request."
        if stop == "max_tokens":
            ctx.emit("error", "Response hit max_tokens; stopping.")
            return summary or "Stopped: response too long (max_tokens)."
        if stop == "pause_turn":
            continue
        if stop == "tool_use" or tool_uses:
            results = [_run_tool(ctx, b) for b in tool_uses]
            messages.append({"role": "user", "content": results})
            continue
        # end_turn / stop_sequence
        return summary or "Done."

    ctx.emit("error", f"Stopped after {MAX_ITERATIONS} iterations.")
    return summary or f"Stopped after {MAX_ITERATIONS} iterations without finishing."


def run(thread_id: str | None = None, text: str | None = None, mode: str = "llm", on_event=None) -> dict:
    if mode == "rules":
        return rule_agent.run(thread_id=thread_id, text=text, on_event=on_event)

    run_id = uuid.uuid4().hex[:10]
    ctx = _Ctx(on_event, run_id)
    ctx.thread_id = thread_id
    db.log_action("agent_run_started", thread_id, {"mode": "llm", "model": config.CLAUDE_MODEL,
                                                   "has_text": bool(text)}, run_id=run_id)
    used_mode = "llm"
    if not thread_id and not (text or "").strip():
        ctx.emit("error", "Nothing to process: give a thread_id or text.")
        summary = "Error: no thread_id or text given."
    else:
        ctx.emit("info", f"Starting LLM agent ({config.CLAUDE_MODEL}, effort={config.CLAUDE_EFFORT}).")
        try:
            summary = _llm_loop(ctx, thread_id, text)
        except anthropic.AnthropicError as e:
            ctx.emit("error", f"Claude API error: {type(e).__name__}: {_trunc(str(e), 300)}")
            ctx.emit("info", "Falling back to the offline rules agent.")
            used_mode = "rules"
            res = rule_agent.run(thread_id=ctx.thread_id or thread_id, text=None if ctx.thread_id else text,
                                 on_event=on_event, run_id=run_id, _events=ctx.events)
            ctx.decision = ctx.decision or res["decision"]
            ctx.thread_id = res["thread_id"] or ctx.thread_id
            summary = res["summary"]
        except Exception as e:
            ctx.emit("error", f"{type(e).__name__}: {e}")
            summary = f"Error: {type(e).__name__}: {e}"

    db.log_action("agent_run_finished", ctx.thread_id, {"mode": used_mode, "decision": ctx.decision,
                                                        "summary": summary}, run_id=run_id)
    return {"run_id": run_id, "mode": used_mode, "thread_id": ctx.thread_id, "decision": ctx.decision,
            "summary": summary, "events": ctx.events}
