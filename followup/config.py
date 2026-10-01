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
    """First non-empty value among names (SMTP_* or the MAIL_* aliases)."""
    for n in names:
        v = os.getenv(n)
        if v:
            return v
    return default


EMAIL_MODE = os.getenv("EMAIL_MODE", "mock").lower()
SMTP = {
    "host": _env("SMTP_HOST", "MAIL_HOST", default="smtp.gmail.com"),
    "port": int(_env("SMTP_PORT", "MAIL_PORT", default="587")),
    "user": _env("SMTP_USER", "MAIL_USER"),
    "password": _env("SMTP_PASS", "MAIL_PASS").replace(" ", ""),  # Google shows app passwords with spaces
    "sender": _env("SMTP_FROM", "MAIL_FROM", "SMTP_USER", "MAIL_USER"),
    "redirect_to": _env("SMTP_REDIRECT_TO", "MAIL_REDIRECT_TO"),
    # Where replies should go (defaults to the sender address).
    "reply_to": _env("SMTP_REPLY_TO", "MAIL_REPLY_TO"),
}

# Name the agent signs follow-ups with.
SENDER_NAME = os.getenv("SENDER_NAME", "Alex from Acme Solutions")
