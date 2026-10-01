"""Settings loaded from .env (see .env.example)."""
import os

from dotenv import load_dotenv

load_dotenv()

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
CLAUDE_EFFORT = os.getenv("CLAUDE_EFFORT", "medium")

MYSQL = {
    "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "followup_agent"),
}

EMAIL_MODE = os.getenv("EMAIL_MODE", "mock").lower()
SMTP = {
    "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
    "port": int(os.getenv("SMTP_PORT", "587")),
    "user": os.getenv("SMTP_USER", ""),
    "password": os.getenv("SMTP_PASS", ""),
    "sender": os.getenv("SMTP_FROM") or os.getenv("SMTP_USER", ""),
    "redirect_to": os.getenv("SMTP_REDIRECT_TO", ""),
}

# Name the agent signs follow-ups with.
SENDER_NAME = os.getenv("SENDER_NAME", "Alex from Acme Solutions")
