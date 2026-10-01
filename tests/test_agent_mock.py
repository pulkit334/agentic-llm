"""followup.agent LLM loop against a scripted fake Anthropic client (no network, no real key)."""
from types import SimpleNamespace

import anthropic
import httpx
import pytest

from followup import agent, config, db

from .conftest import CUSTOMER

pytestmark = pytest.mark.usefixtures("seeded_db")


def blk(type_, **kw):
    return SimpleNamespace(type=type_, **kw)


def tool(id_, name, **inp):
    return blk("tool_use", id=id_, name=name, input=inp)


def text(t):
    return blk("text", text=t)


def _resp(content, stop=None):
    if stop is None:
        stop = "tool_use" if any(b.type == "tool_use" for b in content) else "end_turn"
    return SimpleNamespace(content=content, stop_reason=stop, stop_details=None)


class FakeAPI:
    """Stands in for anthropic.Anthropic: pops one scripted response per create() call."""

    def __init__(self, script, beta_error=None, error=None):
        self.script = list(script)
        self.calls = []
        self.beta_error, self.error = beta_error, error
        api = self

        class _Msgs:
            def __init__(self, beta):
                self.beta = beta

            def create(self, **kw):
                api.calls.append({"beta": self.beta, **kw, "messages": [dict(m) for m in kw["messages"]]})
                if api.error:
                    raise api.error
                if self.beta and api.beta_error:
                    raise api.beta_error
                item = api.script.pop(0)
                return item if isinstance(item, SimpleNamespace) else _resp(item)

        self.messages = _Msgs(False)
        self.beta = SimpleNamespace(messages=_Msgs(True))

    def factory(self, **kw):
        self.client_kwargs = kw
        return self


def _install(monkeypatch, fake):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-a-real-key")
    monkeypatch.setattr(agent.anthropic, "Anthropic", fake.factory)
    monkeypatch.setattr(config, "CLAUDE_EFFORT", "medium")


def _http_error(cls, status):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("error", response=httpx.Response(status, request=req), body=None)


HAPPY = [
    [blk("thinking", thinking="Check the thread first.", signature="sig"),
     text("I'll read the thread and earlier follow-ups."),
     tool("t1", "get_thread_history", thread_id="cust-waiting"),
     tool("t2", "list_followups", contact_email=CUSTOMER)],
    [tool("t3", "get_strategy", thread_id="cust-waiting")],
    [tool("t4", "schedule_followup", thread_id="cust-waiting", subject="Re: Pricing proposal",
          body="Hi Cara, did the 50-seat pricing work for you? A one-line reply is all I need.",
          send_at_utc="2026-10-01 05:35", reason="no reply for 3 days")],
    [tool("t5", "record_decision", thread_id="cust-waiting", decision="scheduled", reason="no reply",
          key_points=["we wrote last"])],
    [text("Scheduled a warm follow-up to Cara.")],
]


def test_loop_executes_tools_and_returns_decision(monkeypatch):
    fake = FakeAPI(HAPPY)
    _install(monkeypatch, fake)
    res = agent.run(thread_id="cust-waiting", mode="llm")

    assert res["mode"] == "llm"
    assert res["decision"] == "scheduled"
    assert res["thread_id"] == "cust-waiting"
    assert res["summary"] == "Scheduled a warm follow-up to Cara."
    assert set(res) >= {"run_id", "mode", "thread_id", "decision", "summary", "events"}
    assert not fake.script, "script not fully consumed"
    types = {e["type"] for e in res["events"]}
    assert {"thinking", "plan", "tool_call", "tool_result", "decision"} <= types
    pending = db.query("SELECT * FROM followups WHERE thread_id='cust-waiting' AND status='pending'")
    assert len(pending) == 1

    first = fake.calls[0]
    assert first["model"] == "claude-opus-5-5"
    assert first["thinking"] == {"type": "adaptive", "display": "summarized"}
    assert first["output_config"] == {"effort": "medium"}
    assert "tool_choice" not in first and "temperature" not in first
    assert first["beta"] and first["betas"] == [agent.FALLBACK_BETA] and first["fallbacks"] == "default"
    assert fake.client_kwargs.get("timeout")

    # both tool results of the first turn come back in ONE user message, matched by id
    last = fake.calls[1]["messages"][-1]
    assert last["role"] == "user"
    assert [r["tool_use_id"] for r in last["content"]] == ["t1", "t2"]
    assert all(r["type"] == "tool_result" for r in last["content"])


def test_invalid_effort_falls_back_to_medium(monkeypatch):
    fake = FakeAPI(HAPPY)
    _install(monkeypatch, fake)
    monkeypatch.setattr(config, "CLAUDE_EFFORT", "turbo")
    agent.run(thread_id="cust-waiting", mode="llm")
    assert fake.calls[0]["output_config"] == {"effort": "medium"}


def test_nudges_once_when_decision_not_recorded(monkeypatch):
    fake = FakeAPI([
        [tool("s1", "get_thread_history", thread_id="cust-closed")],
        [text("Thread is closed; nothing to do.")],
        [tool("s2", "record_decision", thread_id="cust-closed", decision="skipped", reason="closed")],
        [text("Skipped: the thread is closed.")],
    ])
    _install(monkeypatch, fake)
    res = agent.run(thread_id="cust-closed", mode="llm")
    assert res["decision"] == "skipped"
    assert res["summary"] == "Skipped: the thread is closed."
    assert "record_decision" in fake.calls[2]["messages"][-1]["content"]


def test_401_falls_back_to_rules_with_friendly_message(monkeypatch):
    fake = FakeAPI([], error=_http_error(anthropic.AuthenticationError, 401))
    _install(monkeypatch, fake)
    res = agent.run(thread_id="cust-waiting", mode="llm")
    assert res["mode"] == "rules"
    assert res["decision"] == "scheduled"
    infos = [e["text"] for e in res["events"] if e["type"] == "info"]
    assert agent.AUTH_FALLBACK_MSG in infos
    assert not any(e["type"] == "error" for e in res["events"])
    assert "test-not-a-real-key" not in repr(res)


def test_missing_key_falls_back_without_calling_api(monkeypatch):
    fake = FakeAPI([])
    _install(monkeypatch, fake)
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    res = agent.run(thread_id="cust-waiting", mode="llm")
    assert res["mode"] == "rules" and res["decision"] == "scheduled"
    assert agent.AUTH_FALLBACK_MSG in [e["text"] for e in res["events"]]
    assert fake.calls == []


def test_server_error_falls_back_to_rules(monkeypatch):
    fake = FakeAPI([], error=_http_error(anthropic.InternalServerError, 500))
    _install(monkeypatch, fake)
    res = agent.run(thread_id="cust-waiting", mode="llm")
    assert res["mode"] == "rules" and res["decision"] == "scheduled"
    assert any(e["type"] == "error" and "AI API error" in e["text"] for e in res["events"])


def test_rejected_fallback_param_retries_on_plain_endpoint(monkeypatch):
    fake = FakeAPI(HAPPY, beta_error=_http_error(anthropic.BadRequestError, 400))
    _install(monkeypatch, fake)
    res = agent.run(thread_id="cust-waiting", mode="llm")
    assert res["mode"] == "llm" and res["decision"] == "scheduled"
    assert fake.calls[0]["beta"] is True
    assert all(c["beta"] is False for c in fake.calls[1:])  # dropped for the rest of the run
    assert all("fallbacks" not in c and "betas" not in c for c in fake.calls[1:])


def test_stops_after_max_iterations(monkeypatch):
    fake = FakeAPI([[tool(f"x{i}", "get_thread_history", thread_id="cust-waiting")]
                    for i in range(agent.MAX_ITERATIONS + 5)])
    _install(monkeypatch, fake)
    res = agent.run(thread_id="cust-waiting", mode="llm")
    assert len(fake.calls) == agent.MAX_ITERATIONS
    assert res["decision"] is None
    assert any(e["type"] == "error" and "iterations" in e["text"] for e in res["events"])


def test_fallback_boundary_blocks_are_not_executed_or_echoed(monkeypatch):
    declined = tool("pre", "close_thread", thread_id="cust-waiting", reason="declined attempt")
    fake = FakeAPI([
        [blk("thinking", thinking="declined attempt", signature="s"), declined, blk("fallback"),
         text("Checking the thread."), tool("post", "get_thread_history", thread_id="cust-waiting")],
        [tool("d", "record_decision", thread_id="cust-waiting", decision="skipped", reason="test")],
        [text("Done.")],
    ])
    _install(monkeypatch, fake)
    res = agent.run(thread_id="cust-waiting", mode="llm")
    assert res["decision"] == "skipped"
    assert db.one("SELECT status FROM threads WHERE id='cust-waiting'")["status"] == "open"
    echoed = fake.calls[1]["messages"][1]
    assert echoed["role"] == "assistant"
    assert [b.type for b in echoed["content"]] == ["text", "tool_use"]
    assert [r["tool_use_id"] for r in fake.calls[1]["messages"][2]["content"]] == ["post"]
