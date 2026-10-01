"""Gemini tool-use loop for the follow-up agent (LLM_PROVIDER=gemini).

Same tools, safeguards, system prompt and event stream as the Claude loop in agent.py; only the model
call differs. Uses Google's OpenAI-compatible Chat Completions endpoint over httpx (no extra SDK).
"""
import copy
import json
import re
import time

import httpx

from . import config, tools
from .clock import now

BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"   # Gemini, OpenAI-compatible
INCEPTION_URL = "https://api.inceptionlabs.ai/v1"                         # Inception Mercury, OpenAI-compatible
TIMEOUT = httpx.Timeout(120.0, connect=10.0)


class GeminiAuthError(Exception):
    """The Gemini key is missing or was rejected."""


class GeminiAPIError(Exception):
    """Any other Gemini API failure (quota, bad request, network)."""


def has_credentials() -> bool:
    return bool(config.GEMINI_API_KEY or config.INCEPTION_API_KEY)


def _headers(key: str | None = None) -> dict:
    return {"Authorization": f"Bearer {key or config.GEMINI_API_KEY}", "Content-Type": "application/json"}


def _clean_schema(schema):
    """Gemini's function declarations accept an OpenAPI subset: drop keys it rejects."""
    if isinstance(schema, dict):
        return {k: _clean_schema(v) for k, v in schema.items() if k not in ("additionalProperties", "$schema")}
    if isinstance(schema, list):
        return [_clean_schema(v) for v in schema]
    return schema


TOOLS = [
    {"type": "function",
     "function": {"name": t["name"], "description": t["description"],
                  "parameters": _clean_schema(copy.deepcopy(t["input_schema"]))}}
    for t in tools.TOOL_SCHEMAS
]


def _raise_for(resp: httpx.Response):
    if resp.status_code < 400:
        return
    try:
        detail = resp.json()
        detail = detail[0] if isinstance(detail, list) and detail else detail
        msg = (detail.get("error") or {}).get("message") or resp.text
    except ValueError:
        msg = resp.text
    msg = msg[:300]
    low = msg.lower()
    if resp.status_code in (401, 403) or "api key" in low or "api_key" in low or "permission" in low:
        raise GeminiAuthError(f"Gemini rejected the key ({resp.status_code}): {msg}")
    raise GeminiAPIError(f"Gemini API error {resp.status_code}: {msg}")


def probe() -> bool:
    """Cheap authenticated call (list models) used by the UI to show whether Smart AI is available."""
    if not has_credentials():
        return False
    for url, key in ((INCEPTION_URL, config.INCEPTION_API_KEY), (BASE_URL, config.GEMINI_API_KEY)):
        if not key:
            continue
        try:
            resp = httpx.get(f"{url}/models", headers=_headers(key), timeout=6.0)
            _raise_for(resp)
            return True
        except Exception:
            continue
    return False


# Preferred order when GEMINI_MODEL is not pinned in .env. Pro models are skipped: free-tier keys have no Pro quota.
PREFERRED = ["gemini-3.5-flash", "gemini-3.8-flash"]  # main model, then one backup
_SKIP = ("image", "tts", "audio", "live", "embedding", "lite", "omni", "customtools")
_chain = None   # models to try, best first
_current = 0    # index of the model that last worked


def _version(model_id: str) -> tuple:
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", model_id)
    return (float(m.group(1)) if m else 0.0, "preview" not in model_id)


def _gemini_models() -> list:
    """GEMINI_MODEL if pinned; else the preferred Flash models this key can use."""
    if not config.GEMINI_API_KEY:
        return []
    if config.GEMINI_MODEL_PINNED:
        return [config.GEMINI_MODEL]
    try:
        resp = httpx.get(f"{BASE_URL}/models", headers=_headers(), timeout=8.0)
        _raise_for(resp)
        ids = {str(m.get("id", "")).removeprefix("models/") for m in resp.json().get("data", [])}
        flash = [i for i in ids if i.startswith("gemini-") and "-flash" in i and not any(x in i for x in _SKIP)]
        chain = [m for m in PREFERRED if m in ids]
        if not chain:  # neither preferred model on this key: newest Flash it has
            chain = sorted(flash, key=_version, reverse=True)[:1]
        return chain or ["gemini-flash-latest"]
    except Exception:
        return ["gemini-flash-latest"]


def _models() -> list:
    """Provider chain, fastest first: Inception Mercury (if key), then Gemini. Entries: (base_url, key, model)."""
    global _chain
    if _chain:
        return _chain
    chain = []
    if config.INCEPTION_API_KEY:
        chain.append((INCEPTION_URL, config.INCEPTION_API_KEY, config.INCEPTION_MODEL))
    chain += [(BASE_URL, config.GEMINI_API_KEY, m) for m in _gemini_models()]
    _chain = chain
    return chain


def resolve_model() -> str:
    models = _models()
    return models[min(_current, len(models) - 1)][2] if models else "none"


def _post(client: httpx.Client, url: str, key: str, body: dict) -> httpx.Response:
    """One retry after a short pause on a transient server error."""
    resp = client.post(f"{url}/chat/completions", headers=_headers(key), json=body)
    if resp.status_code in (500, 502, 503, 504):
        time.sleep(2)
        resp = client.post(f"{url}/chat/completions", headers=_headers(key), json=body)
    return resp


def _chat(client: httpx.Client, messages: list, ctx=None) -> dict:
    """Call the current model; if it is busy (5xx) or out of quota (429), move down the chain."""
    global _current
    models = _models()
    resp = None
    for i in range(min(_current, len(models) - 1), len(models)):
        url, key, model = models[i]
        body = {"model": model, "messages": messages, "tools": TOOLS, "tool_choice": "auto"}
        try:
            resp = _post(client, url, key, body)
        except httpx.HTTPError as e:  # network problem with this provider: try the next one
            if ctx is not None and i + 1 < len(models):
                ctx.emit("info", f"{model} unreachable ({type(e).__name__}); trying {models[i + 1][2]}.")
            continue
        # 401/403 on one provider (e.g. a rotated key) should not stop the others either
        if resp.status_code not in (401, 403, 404, 429, 500, 502, 503, 504):  # 404 = model retired for this key
            if i != _current and ctx is not None:
                ctx.emit("info", f"Using {model}.")
            _current = i
            break
        if ctx is not None and i + 1 < len(models):
            ctx.emit("info", f"{model} is busy or unavailable ({resp.status_code}); trying {models[i + 1][2]}.")
    if resp is None:
        raise GeminiAPIError("No AI provider could be reached.")
    _raise_for(resp)
    return resp.json()


class _Call:
    """Adapter so agent._run_tool can execute an OpenAI-style tool call unchanged."""

    def __init__(self, call: dict):
        fn = call.get("function") or {}
        self.id = call.get("id") or ""
        self.name = fn.get("name") or ""
        try:
            self.input = json.loads(fn.get("arguments") or "{}")
        except ValueError:
            self.input = {}


def loop(ctx, thread_id, text, system_prompt, run_tool, max_iterations) -> str:
    header = f"Current time (UTC): {now().strftime('%Y-%m-%d %H:%M')}\n"
    user = header + (f"Process existing thread: {thread_id}" if thread_id
                     else f"New conversation from the user:\n{text}")
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user}]
    summary = ""
    nudged = False

    with httpx.Client(timeout=TIMEOUT) as client:
        for _ in range(max_iterations):
            data = _chat(client, messages, ctx)
            choice = (data.get("choices") or [{}])[0]
            msg = choice.get("message") or {}
            content = (msg.get("content") or "").strip()
            calls = msg.get("tool_calls") or []

            if content:
                summary = content
                if calls:
                    ctx.emit("plan", content)
            # Echo the assistant turn back as received (keeps any thought signatures Gemini attaches).
            messages.append({k: v for k, v in msg.items() if v is not None})

            if calls:
                for call in calls:
                    result = run_tool(ctx, _Call(call))
                    messages.append({"role": "tool", "tool_call_id": result["tool_use_id"],
                                     "content": result["content"]})
                continue

            if choice.get("finish_reason") == "length":
                ctx.emit("error", "Response hit the length limit; stopping.")
                return summary or "Stopped: response too long."
            if ctx.decision is None and ctx.thread_id and not nudged:
                nudged = True
                ctx.emit("info", "Agent finished without recording a decision; asking it to call record_decision.")
                messages.append({"role": "user", "content": "You have not called record_decision yet. Call it now, "
                                                            "once, with the decision you reached, then give the "
                                                            "short summary."})
                continue
            return summary or "Done."

    ctx.emit("error", f"Stopped after {max_iterations} iterations.")
    return summary or f"Stopped after {max_iterations} iterations without finishing."
