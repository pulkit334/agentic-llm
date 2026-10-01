"""Timing rules: business hours per recipient timezone and the default follow-up delay per contact type."""
from datetime import datetime, timedelta

import pytest

from followup import strategies

IST = "Asia/Kolkata"   # UTC+05:30, no DST
NY = "America/New_York"  # UTC-04:00 in October 2026
NOW = datetime(2026, 10, 1, 5, 30)  # Thu 11:00 IST


# ------------------------------------------------------------------ next_business_slot

@pytest.mark.parametrize("utc_in, expected, why", [
    (datetime(2026, 10, 1, 5, 30), datetime(2026, 10, 1, 5, 30), "Thu 11:00 IST - inside hours, unchanged"),
    (datetime(2026, 10, 1, 3, 30), datetime(2026, 10, 1, 3, 30), "Thu 09:00 IST - opening minute is inside"),
    (datetime(2026, 10, 1, 12, 29), datetime(2026, 10, 1, 12, 29), "Thu 17:59 IST - still inside"),
    (datetime(2026, 10, 1, 2, 0), datetime(2026, 10, 1, 3, 30), "Thu 07:30 IST - same day 09:00"),
    (datetime(2026, 10, 1, 12, 30), datetime(2026, 10, 2, 3, 30), "Thu 18:00 IST - next day 09:00"),
    (datetime(2026, 10, 1, 15, 0), datetime(2026, 10, 2, 3, 30), "Thu 20:30 IST - next day 09:00"),
    (datetime(2026, 10, 1, 19, 0), datetime(2026, 10, 2, 3, 30), "Fri 00:30 IST - same local day 09:00"),
    (datetime(2026, 10, 2, 13, 0), datetime(2026, 10, 5, 3, 30), "Fri 18:30 IST - skips weekend to Mon 09:00"),
    (datetime(2026, 10, 3, 5, 30), datetime(2026, 10, 5, 3, 30), "Sat 11:00 IST - Mon 09:00"),
    (datetime(2026, 10, 4, 10, 0), datetime(2026, 10, 5, 3, 30), "Sun 15:30 IST - Mon 09:00"),
    (datetime(2026, 10, 4, 20, 0), datetime(2026, 10, 5, 3, 30), "Mon 01:30 IST - Mon 09:00"),
])
def test_next_business_slot_ist(utc_in, expected, why):
    assert strategies.next_business_slot(utc_in, IST) == expected, why


def test_next_business_slot_uses_recipient_timezone():
    # 05:30 UTC is 11:00 in India but 01:30 in New York -> 09:00 EDT = 13:00 UTC.
    assert strategies.next_business_slot(NOW, NY) == datetime(2026, 10, 1, 13, 0)
    # Saturday afternoon in New York -> Monday 09:00 EDT.
    assert strategies.next_business_slot(datetime(2026, 10, 3, 18, 0), NY) == datetime(2026, 10, 5, 13, 0)


def test_next_business_slot_returns_naive_utc_without_microseconds():
    out = strategies.next_business_slot(datetime(2026, 10, 1, 5, 30, 12, 345678), IST)
    assert out.tzinfo is None
    assert out == datetime(2026, 10, 1, 5, 30, 12)


@pytest.mark.parametrize("utc_dt, inside", [
    (datetime(2026, 10, 1, 5, 30), True),
    (datetime(2026, 10, 1, 13, 0), False),
    (datetime(2026, 10, 3, 5, 30), False),
])
def test_in_business_hours(utc_dt, inside):
    assert strategies.in_business_hours(utc_dt, IST) is inside


def test_unknown_contact_type_falls_back_to_customer():
    assert strategies.get("alien") is strategies.STRATEGIES["customer"]


# ------------------------------------------------------------------ suggest_send_at

MON_11_IST = datetime(2026, 9, 28, 5, 30)  # Mon 11:00 IST


@pytest.mark.parametrize("ctype, expected", [
    ("student", MON_11_IST + timedelta(hours=24)),   # Tue 11:00 IST
    ("employee", MON_11_IST + timedelta(hours=24)),  # Tue 11:00 IST
    ("customer", MON_11_IST + timedelta(hours=48)),  # Wed 11:00 IST
    ("business", MON_11_IST + timedelta(hours=96)),  # Fri 11:00 IST
])
def test_suggest_send_at_uses_delay_per_type(ctype, expected):
    got = strategies.suggest_send_at(ctype, MON_11_IST, MON_11_IST, IST)
    assert got == expected
    assert got - MON_11_IST == timedelta(hours=strategies.get(ctype)["delay_hours"])


def test_suggest_send_at_delay_landing_on_weekend_moves_to_monday():
    # Customer, last message Thu 11:00 IST -> +48h = Sat 11:00 IST -> Mon 09:00 IST.
    assert strategies.suggest_send_at("customer", NOW, NOW, IST) == datetime(2026, 10, 5, 3, 30)


def test_suggest_send_at_without_previous_message_counts_from_now():
    assert strategies.suggest_send_at("student", None, NOW, IST) == NOW + timedelta(hours=24)


def test_deadline_pulls_send_time_earlier_for_deadline_types():
    deadline = datetime(2026, 10, 2, 10, 30)  # Fri 16:00 IST
    # student/employee: deadline - 24h lead = Thu 16:00 IST, earlier than the 24h default delay.
    for ctype in ("student", "employee"):
        got = strategies.suggest_send_at(ctype, None, NOW, IST, deadline=deadline)
        assert got == datetime(2026, 10, 1, 10, 30), ctype
        assert got < strategies.suggest_send_at(ctype, None, NOW, IST)


def test_deadline_ignored_for_types_without_deadline_lead():
    deadline = datetime(2026, 10, 2, 10, 30)
    assert strategies.suggest_send_at("customer", None, NOW, IST, deadline=deadline) == \
        strategies.suggest_send_at("customer", None, NOW, IST)


def test_never_before_now():
    # Deadline lead time already in the past -> as soon as possible, not in the past.
    got = strategies.suggest_send_at("student", None, NOW, IST, deadline=NOW + timedelta(hours=2))
    assert got == NOW + timedelta(minutes=5)
    # Last message long ago -> the delay expired weeks ago, still not in the past.
    got = strategies.suggest_send_at("customer", datetime(2026, 9, 1, 5, 30), NOW, IST)
    assert got == NOW + timedelta(minutes=5)


def test_never_before_now_then_business_hours():
    late_evening = datetime(2026, 10, 1, 14, 0)  # Thu 19:30 IST
    got = strategies.suggest_send_at("customer", datetime(2026, 9, 1), late_evening, IST)
    assert got == datetime(2026, 10, 2, 3, 30)  # Fri 09:00 IST
    assert got >= late_evening


def test_min_gap_beats_deadline():
    last = datetime(2026, 10, 1, 4, 30)       # we wrote 1h before NOW
    deadline = datetime(2026, 10, 2, 6, 30)   # deadline - 24h = Thu 12:00 IST, only 2h after our message
    got = strategies.suggest_send_at("student", last, NOW, IST, deadline=deadline)
    assert got == last + timedelta(hours=strategies.MIN_GAP_HOURS)  # Fri 10:00 IST
    assert got - last >= timedelta(hours=24)


@pytest.mark.parametrize("ctype", ["customer", "student", "employee", "business"])
def test_suggestion_is_always_in_business_hours_and_after_gap(ctype):
    last = datetime(2026, 10, 2, 12, 0)  # Fri 17:30 IST
    for tz in (IST, NY):
        got = strategies.suggest_send_at(ctype, last, last, tz, deadline=last + timedelta(hours=30))
        assert strategies.in_business_hours(got, tz)
        assert got - last >= timedelta(hours=strategies.MIN_GAP_HOURS)


def test_local_str():
    assert strategies.local_str(NOW, IST) == "Thu 01 Oct 2026 11:00 Asia/Kolkata"
