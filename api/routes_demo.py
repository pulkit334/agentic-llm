"""Demo controls: the simulated clock, delivering due follow-ups, and resetting demo data.

Time travel goes through followup.scheduler, so every pending follow-up is re-checked by
the guards and sent at its own scheduled time on the way. Clock-changing calls are
serialised so two people pressing "advance" at once cannot interleave their jumps.
"""
import threading
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from followup import db, scheduler

from . import serializers
from .deps import admin_user, current_user

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)])

MAX_ADVANCE_HOURS = 24 * 365

_clock_lock = threading.Lock()


class AdvanceRequest(BaseModel):
    hours: float = Field(gt=0, le=MAX_ADVANCE_HOURS, allow_inf_nan=False)


def _results(rows: list[dict]) -> list[dict]:
    """Scheduler results with datetimes as ISO UTC strings."""
    return [{k: serializers.iso(v) if isinstance(v, datetime) else v for k, v in r.items()} for r in rows]


@router.get("/demo/clock")
def get_clock():
    return serializers.clock()


@router.post("/demo/advance")
def advance(body: AdvanceRequest):
    """Fast-forward the simulated clock, sending (or auto-cancelling) follow-ups that fall due."""
    with _clock_lock:
        res = scheduler.advance(body.hours)
    return {"clock": serializers.clock(), "results": _results(res["results"])}


@router.post("/demo/run-due")
def run_due():
    """Send every pending follow-up whose time has come, without moving the clock."""
    with _clock_lock:
        res = scheduler.run_due()
    return {"results": _results(res)}


@router.post("/demo/reset", dependencies=[Depends(admin_user)])
def reset():
    """Restore the seeded demo data and clock. Accounts and sessions are kept."""
    with _clock_lock:
        db.reset()
    return {"ok": True}
