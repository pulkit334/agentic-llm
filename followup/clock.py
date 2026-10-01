"""Simulated clock stored in MySQL so the demo can 'fast-forward' time.

Set CLOCK_MODE=real in .env to use the real UTC time instead.
"""
import os
from datetime import datetime, timedelta, timezone

from . import db


def now() -> datetime:
    if os.getenv("CLOCK_MODE", "sim") == "real":
        return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    v = db.get_setting("clock")
    if v:
        return datetime.fromisoformat(v)
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def set_now(dt: datetime):
    db.set_setting("clock", dt.replace(microsecond=0).isoformat())


def advance(hours: float) -> datetime:
    t = now() + timedelta(hours=hours)
    set_now(t)
    return t
