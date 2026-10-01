"""Settings loaded from .env (see .env.example)."""
import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)

# Claude credentials written in .env must win over whatever the parent shell exported (load_dotenv never
# overrides). Otherwise a stale/foreign ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in the environment would be
# used instead of the key the user put in .env. Process-local only; .env itself is never modified.
_file_env = dotenv_values(_ENV_FILE) if _ENV_FILE.exists() else {}
if _file_env.get("ANTHROPIC_API_KEY"):
    for _k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"):
        if _file_env.get(_k):
            os.environ[_k] = _file_env[_k]
        elif _k != "ANTHROPIC_API_KEY":
            os.environ.pop(_k, None)

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
CLAUDE_EFFORT = os.getenv("CLAUDE_EFFORT", "medium")

MYSQL = {
    "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "followup_agent"),
}
# Idle MySQL connections kept open for reuse (db.ConnectionPool).
MYSQL_POOL_SIZE = int(os.getenv("MYSQL_POOL_SIZE", "8"))

def _env(*names, default=""):
    """First non-empty value among names (SMTP_* or the MAIL_* / EMAIL_* aliases)."""
    for n in names:
        v = os.getenv(n)
        if v:
            return v
    return default


def _truthy(v: str) -> bool:
    return (v or "").strip().lower() in ("1", "true", "yes", "on")


# --- LLM provider: "claude" or "gemini". Default: gemini when a Gemini key is set, otherwise claude.
GEMINI_API_KEY = _env("GEMINI_API_KEY", "GOOGLE_API_KEY").strip()
# Empty GEMINI_MODEL = auto-pick the newest Pro model the key can use (gemini_agent.resolve_model).
GEMINI_MODEL_PINNED = bool(os.getenv("GEMINI_MODEL", "").strip())
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "").strip() or "gemini-flash-latest"
# Inception Labs (Mercury) - fast diffusion LLM, OpenAI-compatible; tried first when its key is set.
INCEPTION_API_KEY = _env("INCEPTION_API_KEY").strip()
INCEPTION_MODEL = os.getenv("INCEPTION_MODEL", "mercury-2.5").strip() or "mercury-2.5"
# "gemini" = the OpenAI-compatible chain (Inception -> Gemini) in gemini_agent.py; "claude" = Anthropic.
LLM_PROVIDER = (os.getenv("LLM_PROVIDER")
                or ("gemini" if (GEMINI_API_KEY or INCEPTION_API_KEY) else "claude")).strip().lower()

# --- Email. EMAIL_ENABLED=true switches to real SMTP unless EMAIL_MODE says otherwise.
EMAIL_MODE = (os.getenv("EMAIL_MODE") or ("smtp" if _truthy(os.getenv("EMAIL_ENABLED", "")) else "mock")).lower()
_smtp_user = _env("SMTP_USER", "MAIL_USER", "EMAIL_USER").strip()
SMTP = {
    "host": _env("SMTP_HOST", "MAIL_HOST", "EMAIL_HOST", default="smtp.gmail.com"),
    "port": int(_env("SMTP_PORT", "MAIL_PORT", "EMAIL_PORT", default="587")),
    # EMAIL_SECURE=true -> implicit TLS (port 465 style); otherwise STARTTLS.
    "secure": _truthy(_env("SMTP_SECURE", "MAIL_SECURE", "EMAIL_SECURE")),
    "user": _smtp_user,
    "password": _env("SMTP_PASS", "MAIL_PASS", "EMAIL_PASS").replace(" ", ""),  # Google shows app passwords with spaces
    "sender": _env("SMTP_FROM", "MAIL_FROM", "EMAIL_FROM") or _smtp_user,
    # Safety net: unless real recipients are explicitly allowed, every real email goes to this address
    # (default: the sending account itself), so demo contacts never receive mail by accident.
    "redirect_to": _env("SMTP_REDIRECT_TO", "MAIL_REDIRECT_TO", "EMAIL_REDIRECT_TO")
                   or ("" if _truthy(os.getenv("EMAIL_ALLOW_REAL_RECIPIENTS", "")) else _smtp_user),
    # Where replies should go (defaults to the sender address).
    "reply_to": _env("SMTP_REPLY_TO", "MAIL_REPLY_TO", "EMAIL_REPLY_TO"),
}

# Name the agent signs follow-ups with.
SENDER_NAME = os.getenv("SENDER_NAME", "Alex from Acme Solutions")
