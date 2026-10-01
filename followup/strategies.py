"""Follow-up strategy per recipient type, plus business-hours timing helpers."""
import re
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
# A deadline reminder may break the normal gap (down to this) when 24h would only land after the deadline.
# Applies to types with a deadline lead (student / employee) only.
DEADLINE_MIN_GAP_HOURS = 12


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


def effective_min_gap(contact_type: str, last_contact: datetime | None, now: datetime, tz: str,
                      deadline: datetime | None = None) -> int:
    """Minimum hours between our last message and the next one.

    Normally MIN_GAP_HOURS. For deadline-driven types (student / employee) with a known future deadline,
    if the normal gap would push the reminder (after business-hours adjustment) to or past the deadline,
    the gap shrinks to DEADLINE_MIN_GAP_HOURS - but only when that actually lands before the deadline.
    Shared by suggest_send_at and guards.check so the suggestion and the hard rule always agree."""
    if not (deadline and last_contact and get(contact_type).get("deadline_lead_hours")):
        return MIN_GAP_HOURS
    floor = now + timedelta(minutes=5)
    normal = next_business_slot(max(last_contact + timedelta(hours=MIN_GAP_HOURS), floor), tz)
    if normal < deadline:
        return MIN_GAP_HOURS
    short = next_business_slot(max(last_contact + timedelta(hours=DEADLINE_MIN_GAP_HOURS), floor), tz)
    if short < deadline:
        return DEADLINE_MIN_GAP_HOURS
    return MIN_GAP_HOURS


def suggest_send_at(contact_type: str, last_outbound: datetime | None, now: datetime, tz: str,
                    deadline: datetime | None = None) -> datetime:
    """Default timing: strategy delay after our last message, pulled earlier for deadlines,
    never sooner than now, always inside business hours.

    The minimum gap since our last message is 24h, shortened to 12h for a student/employee deadline
    reminder when that is the only way to land before the deadline (see effective_min_gap)."""
    s = get(contact_type)
    base = (last_outbound or now) + timedelta(hours=s["delay_hours"])
    if deadline and s.get("deadline_lead_hours"):
        base = min(base, deadline - timedelta(hours=s["deadline_lead_hours"]))
    if last_outbound:
        gap = effective_min_gap(contact_type, last_outbound, now, tz, deadline)
        base = max(base, last_outbound + timedelta(hours=gap))
    base = max(base, now + timedelta(minutes=5))
    return next_business_slot(base, tz)


# ---------------------------------------------------------------- deadlines mentioned in a thread

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
DEADLINE_RE = re.compile(
    r"\b(?:due|deadline|by|before)\b[^.?!\n]{0,40}?\b(\d{1,2})(?:st|nd|rd|th)?\s+"
    r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?"
    r"(?:[^.?!\n\d]{0,10}?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b)?", re.I)


def find_deadline(texts, tz: str, current: datetime) -> datetime | None:
    """First future deadline like 'due Saturday 3 Oct, 11:59 PM' / 'by Friday, 2 October' -> naive UTC.
    A date without a time means the end of the recipient's business day (18:00 local)."""
    for text in texts:
        for m in DEADLINE_RE.finditer(text or ""):
            day, mon, year, hh, mm, ampm = m.groups()
            try:
                hour = WORK_END if hh is None else int(hh) % 12 + (12 if ampm.lower() == "pm" else 0)
                local = datetime(int(year or current.year), MONTHS.index(mon[:3].lower()) + 1, int(day),
                                 hour, int(mm or 0), tzinfo=ZoneInfo(tz))
            except (ValueError, TypeError):
                continue
            utc = local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
            if utc > current:
                return utc
    return None


def thread_deadline(subject: str, messages: list[dict], tz: str, current: datetime) -> datetime | None:
    """Deadline stated by us in the thread (subject first, then our messages, newest first)."""
    outbound = [m.get("body") for m in reversed(messages or []) if m.get("direction") == "outbound"]
    return find_deadline([subject or ""] + outbound, tz, current)


def local_str(utc_dt: datetime, tz: str) -> str:
    local = utc_dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo(tz))
    return local.strftime("%a %d %b %Y %H:%M ") + tz
