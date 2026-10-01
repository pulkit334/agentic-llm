"""Follow-up strategy per recipient type, plus business-hours timing helpers."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

STRATEGIES = {
    "customer": {
        "delay_hours": 48,
        "max_followups": 3,
        "tone": "warm, helpful, low-pressure",
        "focus": "remind them of the value, answer likely objections, make the next step a one-line reply",
        "length": "60-110 words",
    },
    "student": {
        "delay_hours": 24,
        "max_followups": 2,
        "tone": "clear, encouraging, supportive",
        "focus": "the deadline and the exact action needed; offer help if they are stuck",
        "length": "50-90 words",
        "deadline_lead_hours": 24,
    },
    "employee": {
        "delay_hours": 24,
        "max_followups": 2,
        "tone": "direct, polite, brief",
        "focus": "the task, the owner, and the due date; ask for a status update or blocker",
        "length": "30-70 words",
        "deadline_lead_hours": 24,
    },
    "business": {
        "delay_hours": 96,
        "max_followups": 2,
        "tone": "formal and professional",
        "focus": "the proposal or meeting; offer two concrete time slots or a clear next step",
        "length": "70-120 words",
    },
}

WORK_START, WORK_END = 9, 18  # recipient local business hours
MIN_GAP_HOURS = 24            # minimum time between two of our messages in a thread


def get(contact_type: str) -> dict:
    return STRATEGIES.get(contact_type, STRATEGIES["customer"])


def next_business_slot(utc_dt: datetime, tz: str) -> datetime:
    """Move a naive-UTC time forward into the recipient's Mon-Fri 9:00-18:00 window."""
    zone = ZoneInfo(tz)
    local = utc_dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(zone)
    for _ in range(14):
        if local.weekday() >= 5:
            local = (local + timedelta(days=7 - local.weekday())).replace(hour=WORK_START, minute=0, second=0)
            continue
        if local.hour < WORK_START:
            local = local.replace(hour=WORK_START, minute=0, second=0)
        elif local.hour >= WORK_END:
            local = (local + timedelta(days=1)).replace(hour=WORK_START, minute=0, second=0)
            continue
        break
    return local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None, microsecond=0)


def in_business_hours(utc_dt: datetime, tz: str) -> bool:
    return next_business_slot(utc_dt, tz) == utc_dt.replace(microsecond=0)


def suggest_send_at(contact_type: str, last_outbound: datetime | None, now: datetime, tz: str,
                    deadline: datetime | None = None) -> datetime:
    """Default timing: strategy delay after our last message, pulled earlier for deadlines,
    never sooner than now, always inside business hours."""
    s = get(contact_type)
    base = (last_outbound or now) + timedelta(hours=s["delay_hours"])
    if deadline and s.get("deadline_lead_hours"):
        base = min(base, deadline - timedelta(hours=s["deadline_lead_hours"]))
    if last_outbound:
        base = max(base, last_outbound + timedelta(hours=MIN_GAP_HOURS))
    base = max(base, now + timedelta(minutes=5))
    return next_business_slot(base, tz)


def local_str(utc_dt: datetime, tz: str) -> str:
    local = utc_dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo(tz))
    return local.strftime("%a %d %b %Y %H:%M ") + tz
