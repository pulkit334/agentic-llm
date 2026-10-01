"""Hard safety rules in followup.guards: every rule must block on its own, and timing is adjusted safely."""
from datetime import datetime, timedelta

import pytest

from followup import db, guards, strategies

from .conftest import BUSINESS, CONTACT_BY_TYPE, CUSTOMER, NOW, WAITING_BODY, add_thread

pytestmark = pytest.mark.usefixtures("seeded_db")

FRI_11_IST = datetime(2026, 10, 2, 5, 30)  # a time that needs no adjustment
NEW_BODY = "Hi Cara, did the proposal answer your questions? Happy to walk you through it."


def check(thread_id, send_at=FRI_11_IST, body=NEW_BODY, **kw):
    return guards.check(thread_id, send_at, body, NOW, **kw)


def assert_blocked_only_by(verdict, fragment):
    assert verdict["allowed"] is False
    assert len(verdict["reasons"]) == 1, verdict["reasons"]
    assert fragment in verdict["reasons"][0]


# ------------------------------------------------------------------ baseline

def test_clean_thread_is_allowed_unchanged():
    v = check("cust-waiting")
    assert v == {"allowed": True, "reasons": [], "send_at": FRI_11_IST, "adjustments": []}


def test_unknown_thread_is_refused():
    v = check("does-not-exist")
    assert v["allowed"] is False
    assert "not found" in v["reasons"][0]


def test_thread_state_summary():
    st = guards.thread_state("cust-replied")
    assert st["last_outbound"] == datetime(2026, 9, 28, 5, 30)
    assert st["last_inbound"] == datetime(2026, 9, 30, 6, 0)
    assert st["sent_followups"] == 0
    assert list(st["pending"]) == []
    assert st["thread"]["contact_type"] == "customer"
    assert guards.thread_state("nope") == {}


# ------------------------------------------------------------------ each blocking rule

def test_pending_followup_blocks_duplicate():
    v = check("cust-pending")
    assert_blocked_only_by(v, "duplicate: follow-up #")
    assert "already pending" in v["reasons"][0]


def test_pending_followup_can_be_ignored_when_rescheduling_itself():
    pending_id = guards.thread_state("cust-pending")["pending"][0]["id"]
    assert check("cust-pending", ignore_followup_id=pending_id)["allowed"] is True


def test_recipient_replied_blocks_chasing():
    assert_blocked_only_by(check("cust-replied"), "recipient already replied")


def test_recipient_promised_update_allows_followup():
    v = check("cust-replied", recipient_promised_update=True)
    assert v["allowed"] is True, v["reasons"]
    assert v["send_at"] == FRI_11_IST


def test_recipient_promised_update_gap_counts_from_their_reply():
    # Their reply was Wed 06:00 UTC; asking for "now" (Thu 05:30) is < 24h after it.
    v = check("cust-replied", send_at=NOW, recipient_promised_update=True)
    assert v["allowed"] is True
    assert v["send_at"] == datetime(2026, 10, 1, 6, 0)
    assert any("minimum gap" in a for a in v["adjustments"])


@pytest.mark.parametrize("phrase", guards.CLOSING_PHRASES)
def test_every_opt_out_phrase_blocks(phrase):
    add_thread("optout-phrase", CUSTOMER, [
        {"direction": "outbound", "sent_at": "2026-09-25T05:30:00", "body": "Checking in on the quote."},
        {"direction": "inbound", "sent_at": "2026-09-26T05:30:00", "body": f"Hi. {phrase.upper()}, thanks."},
        {"direction": "outbound", "sent_at": "2026-09-27T05:30:00", "body": "Noted, thank you."},
    ])
    assert_blocked_only_by(check("optout-phrase"), "opted out")


def test_opt_out_in_seed_thread_blocks():
    assert_blocked_only_by(check("cust-optout"), "opted out")


def test_closed_thread_blocks():
    assert_blocked_only_by(check("cust-closed"), "thread is closed")


@pytest.mark.parametrize("ctype", ["customer", "student", "employee", "business"])
def test_max_followups_per_type(ctype):
    limit = strategies.get(ctype)["max_followups"]
    email = CONTACT_BY_TYPE[ctype]
    sent_at = datetime(2026, 9, 1, 5, 30)

    def msgs(n_followups):
        out = [{"direction": "outbound", "sent_at": sent_at.isoformat(), "body": "Original message."}]
        for i in range(n_followups):
            out.append({"direction": "outbound", "sent_at": (sent_at + timedelta(days=3 * (i + 1))).isoformat(),
                        "body": f"Follow-up number {i + 1}.", "is_followup": True})
        return out

    add_thread(f"{ctype}-under", email, msgs(limit - 1))
    add_thread(f"{ctype}-at", email, msgs(limit))
    tz = "America/New_York" if ctype == "business" else "Asia/Kolkata"
    send_at = strategies.next_business_slot(datetime(2026, 10, 2, 14, 0), tz)  # a slot needing no adjustment

    assert check(f"{ctype}-under", send_at=send_at)["allowed"] is True
    v = check(f"{ctype}-at", send_at=send_at)
    assert_blocked_only_by(v, f"max follow-ups reached ({limit}/{limit} for {ctype})")


def test_customer_and_student_limits_differ():
    assert strategies.get("customer")["max_followups"] == 3
    assert strategies.get("student")["max_followups"] == 2


def test_identical_body_blocks_even_with_different_case_and_whitespace():
    body = "  " + WAITING_BODY.upper().replace(" ", "  \n ", 3) + "\n"
    assert_blocked_only_by(check("cust-waiting", body=body), "identical message")


def test_inbound_text_does_not_count_as_identical():
    # Only *our* previous messages count: quoting their message back is not a duplicate send.
    st = guards.thread_state("cust-replied")
    their_text = next(m["body"] for m in st["messages"] if m["direction"] == "inbound")
    v = check("cust-replied", body=their_text, recipient_promised_update=True)
    assert v["allowed"] is True


def test_multiple_reasons_are_all_reported():
    v = check("cust-pending", body="Hi Cara, here is the demo recording link.")
    assert v["allowed"] is False
    assert len(v["reasons"]) == 2
    assert any("duplicate" in r for r in v["reasons"])
    assert any("identical" in r for r in v["reasons"])


# ------------------------------------------------------------------ kind="reply"

def test_reply_allowed_when_they_wrote_last():
    v = check("cust-replied", send_at=NOW, kind="reply", body="Onboarding takes two weeks from signing.")
    assert v["allowed"] is True, v["reasons"]
    assert v["send_at"] == NOW            # replies skip the 24h gap
    assert v["adjustments"] == []


def test_reply_blocked_when_we_wrote_last():
    assert_blocked_only_by(check("cust-waiting", send_at=NOW, kind="reply"), "nothing to reply to")


def test_reply_not_blocked_by_pending_followup_or_max_count():
    add_thread("stud-question", CONTACT_BY_TYPE["student"], [
        {"direction": "outbound", "sent_at": "2026-09-20T05:30:00", "body": "Please submit assignment 3."},
        {"direction": "outbound", "sent_at": "2026-09-22T05:30:00", "body": "Reminder 1.", "is_followup": True},
        {"direction": "outbound", "sent_at": "2026-09-24T05:30:00", "body": "Reminder 2.", "is_followup": True},
        {"direction": "inbound", "sent_at": "2026-09-30T05:30:00", "body": "Can I get an extension?"},
    ])
    db.execute("INSERT INTO followups (thread_id,contact_email,subject,body,send_at,status,created_at) "
               "VALUES ('stud-question',%s,'Re: x','queued',%s,'pending',%s)",
               (CONTACT_BY_TYPE["student"], FRI_11_IST, NOW))
    assert check("stud-question", send_at=NOW, kind="reply", body="Yes, until Friday.")["allowed"] is True
    v = check("stud-question", send_at=FRI_11_IST, recipient_promised_update=True)
    assert v["allowed"] is False
    assert any("duplicate" in r for r in v["reasons"])
    assert any("max follow-ups" in r for r in v["reasons"])


def test_reply_still_moved_into_business_hours():
    saturday = datetime(2026, 10, 3, 5, 30)
    v = check("cust-replied", send_at=saturday, kind="reply", body="Onboarding takes two weeks.")
    assert v["allowed"] is True
    assert v["send_at"] == datetime(2026, 10, 5, 3, 30)
    assert any("business hours" in a for a in v["adjustments"])


# ------------------------------------------------------------------ time adjustments

def test_send_time_in_the_past_is_raised_to_now():
    v = check("cust-waiting", send_at=NOW - timedelta(days=2))
    assert v["allowed"] is True
    assert v["send_at"] == NOW


def test_weekend_moved_to_monday_morning_local():
    v = check("cust-waiting", send_at=datetime(2026, 10, 3, 5, 30))  # Sat 11:00 IST
    assert v["allowed"] is True
    assert v["send_at"] == datetime(2026, 10, 5, 3, 30)               # Mon 09:00 IST
    assert v["adjustments"] == ["moved into recipient's business hours (Mon-Fri 09:00-18:00 local)"]


def test_after_hours_moved_to_next_morning_local():
    v = check("cust-waiting", send_at=datetime(2026, 10, 1, 13, 0))  # Thu 18:30 IST
    assert v["send_at"] == datetime(2026, 10, 2, 3, 30)               # Fri 09:00 IST
    assert len(v["adjustments"]) == 1


def test_business_hours_use_recipient_timezone():
    v = check("biz-ny", send_at=NOW)  # 01:30 in New York
    assert v["allowed"] is True, v["reasons"]
    assert v["send_at"] == datetime(2026, 10, 1, 13, 0)  # 09:00 EDT
    assert any("business hours" in a for a in v["adjustments"])


def test_min_gap_since_our_last_message():
    v = check("emp-recent", send_at=NOW, body="Hi Eve, any update on the Q3 report?")
    assert v["allowed"] is True
    assert v["send_at"] == datetime(2026, 10, 2, 4, 30)  # 24h after our 04:30 message, Fri 10:00 IST
    assert v["adjustments"] == [f"moved to respect {strategies.MIN_GAP_HOURS}h minimum gap since our last message"]


def test_min_gap_then_business_hours():
    # Our last message was Fri 17:30 IST: +24h lands on Saturday -> Monday 09:00 IST.
    add_thread("late-friday", CUSTOMER, [
        {"direction": "outbound", "sent_at": "2026-10-02T12:00:00", "body": "Sending the invoice now."}])
    v = guards.check("late-friday", datetime(2026, 10, 2, 12, 30), "Did the invoice arrive?",
                     datetime(2026, 10, 2, 12, 30))
    assert v["allowed"] is True
    assert v["send_at"] == datetime(2026, 10, 5, 3, 30)
    assert len(v["adjustments"]) == 2


def test_adjusted_time_is_never_inside_the_gap_or_outside_hours():
    for hours in range(0, 24 * 7, 5):
        v = check("emp-recent", send_at=NOW + timedelta(hours=hours), body="Hi Eve, any update?")
        assert v["send_at"] >= datetime(2026, 10, 2, 4, 30)
        assert strategies.in_business_hours(v["send_at"], "Asia/Kolkata")


def test_business_contact_constant():
    # sanity: the NY contact really is the business-type contact used above
    assert db.one("SELECT type FROM contacts WHERE email=%s", (BUSINESS,))["type"] == "business"
