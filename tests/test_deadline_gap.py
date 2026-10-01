"""A deadline reminder may shorten the 24h minimum gap to 12h - strategies and guards must agree."""
from datetime import datetime, timedelta

import pytest

from followup import guards, strategies, tools

from .conftest import EMPLOYEE, NOW, STUDENT, add_thread

IST = "Asia/Kolkata"
THU_1030_IST = datetime(2026, 10, 1, 5, 0)    # our message, 30 min before NOW
FRI_1000_IST = datetime(2026, 10, 2, 4, 30)   # deadline
FRI_0900_IST = datetime(2026, 10, 2, 3, 30)   # first business slot after a 12h gap


# ------------------------------------------------------------------ pure timing

def test_effective_gap_is_24h_when_it_still_lands_before_the_deadline():
    deadline = datetime(2026, 10, 2, 12, 30)  # Fri 18:00 IST
    assert strategies.effective_min_gap("employee", THU_1030_IST, NOW, IST, deadline) == strategies.MIN_GAP_HOURS


def test_effective_gap_shrinks_when_24h_would_miss_the_deadline():
    for ctype in ("student", "employee"):
        assert strategies.effective_min_gap(ctype, THU_1030_IST, NOW, IST, FRI_1000_IST) == \
            strategies.DEADLINE_MIN_GAP_HOURS


@pytest.mark.parametrize("ctype", ["customer", "business"])
def test_effective_gap_never_shrinks_for_types_without_deadline_lead(ctype):
    assert strategies.effective_min_gap(ctype, THU_1030_IST, NOW, IST, FRI_1000_IST) == strategies.MIN_GAP_HOURS


def test_effective_gap_stays_24h_when_12h_cannot_make_it_either():
    # Our message Fri 10:00 IST, deadline Sat 23:59 IST: 12h -> Fri 22:00 -> Mon, still too late.
    last, deadline = datetime(2026, 10, 2, 4, 30), datetime(2026, 10, 3, 18, 29)
    assert strategies.effective_min_gap("student", last, last, IST, deadline) == strategies.MIN_GAP_HOURS


def test_suggest_send_at_lands_before_deadline_with_short_gap():
    got = strategies.suggest_send_at("employee", THU_1030_IST, NOW, IST, deadline=FRI_1000_IST)
    assert got == FRI_0900_IST
    assert got < FRI_1000_IST
    assert got - THU_1030_IST >= timedelta(hours=strategies.DEADLINE_MIN_GAP_HOURS)
    assert strategies.in_business_hours(got, IST)


def test_suggest_send_at_without_deadline_keeps_24h_gap():
    got = strategies.suggest_send_at("employee", THU_1030_IST, NOW, IST)
    assert got == THU_1030_IST + timedelta(hours=24)


def test_find_deadline_variants():
    assert strategies.find_deadline(["Please send it by 2 Oct 10:00 AM."], IST, NOW) == FRI_1000_IST
    assert strategies.find_deadline(["due on Saturday, 3 October 2026 at 11:59 PM IST"], IST, NOW) == \
        datetime(2026, 10, 3, 18, 29)
    assert strategies.find_deadline(["by Friday, 2 October"], IST, NOW) == datetime(2026, 10, 2, 12, 30)
    assert strategies.find_deadline(["nothing here"], IST, NOW) is None


# ------------------------------------------------------------------ guards + tools agree

@pytest.fixture
def deadline_thread(seeded_db):
    return add_thread("deck-eve", EMPLOYEE, [
        {"direction": "outbound", "sent_at": "2026-10-01T05:00:00",
         "body": "Hi Eve, please send the board deck by 2 Oct 10:00 AM."}], subject="Board deck")


def test_guard_allows_short_gap_for_thread_deadline(deadline_thread):
    v = guards.check(deadline_thread, NOW, "Hi Eve, how is the deck going?", NOW)
    assert v["allowed"] is True
    assert v["send_at"] == FRI_0900_IST
    assert any("12h minimum gap" in a and "deadline" in a for a in v["adjustments"])


def test_guard_explicit_min_gap_override(deadline_thread):
    v = guards.check(deadline_thread, NOW, "Hi Eve, how is the deck going?", NOW, min_gap_hours=24)
    assert v["send_at"] >= THU_1030_IST + timedelta(hours=24)


def test_guard_without_deadline_keeps_24h(seeded_db):
    v = guards.check("emp-recent", NOW, "Hi Eve, any update?", NOW)
    assert v["send_at"] == datetime(2026, 10, 2, 4, 30)
    assert v["adjustments"] == [f"moved to respect {strategies.MIN_GAP_HOURS}h minimum gap since our last message"]


def test_tools_suggestion_is_not_moved_by_the_guard(deadline_thread):
    strat = tools.get_strategy(deadline_thread, deadline_utc="2026-10-02 04:30")
    assert strat["suggested_send_at_utc"] == "2026-10-02 03:30:00"
    res = tools.schedule_followup(deadline_thread, "Re: Board deck", "Hi Eve, quick check on the deck?",
                                  strat["suggested_send_at_utc"], "deadline reminder")
    assert res["status"] == "scheduled"
    assert res["send_at_utc"] == "2026-10-02 03:30:00"
    assert res["adjustments"] == []


def test_student_seed_style_deadline_still_uses_normal_gap(seeded_db):
    add_thread("capstone-sam", STUDENT, [
        {"direction": "outbound", "sent_at": "2026-09-30T10:30:00",
         "body": "Your report is due on Saturday, 3 October 2026 at 11:59 PM IST."}], subject="Capstone")
    strat = tools.get_strategy("capstone-sam", deadline_utc="2026-10-03 18:29")
    assert strat["suggested_send_at_utc"] == "2026-10-01 10:30:00"  # Thu 16:00 IST, 24h after our message
