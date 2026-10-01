"""Pure UI helper tests (no database, no Streamlit)."""
from datetime import datetime

import ui_helpers as H


def _call(name, inp, res):
    return [{"type": "tool_call", "text": "", "data": {"name": name, "input": inp}},
            {"type": "tool_result", "text": "", "data": {"name": name, "result": res}}]


def test_humanize_text_converts_utc_and_local_strings_to_india_time():
    assert H.humanize_text("duplicate: follow-up #3 is already pending for 2026-10-02 04:30:00 UTC") == \
        "A follow-up is already pending for Fri 2 Oct, 10:00 AM India time"
    assert "India time" in H.humanize_text("Scheduled for Fri 02 Oct 2026 15:00 Asia/Kolkata (follow-up #4).")
    assert "#4" not in H.humanize_text("Scheduled for Fri 02 Oct 2026 15:00 Asia/Kolkata (follow-up #4).")


def test_friendly_reason_plain_language():
    assert H.friendly_reason("skipped", "Recipient replied after our last message and asked nothing open; x",
                             "Rahul Mehta") == "Rahul replied, and there's nothing you owe them right now."
    assert "already waiting" in H.friendly_reason("blocked_duplicate", "duplicate: follow-up #1 ...", "Neha Kapoor")
    assert H.friendly_reason("scheduled", "", "X") == H.DECISIONS["scheduled"][3]


def test_final_steps_are_honest():
    closed = (_call("get_thread_history", {}, {}) + _call("list_followups", {}, {"followups": []})
              + _call("close_thread", {}, {"status": "closed"})
              + [{"type": "decision", "text": "closed", "data": {}}])
    steps = dict(H.final_steps(closed, "closed"))
    assert steps["Closed the conversation"] == "done"
    assert "Wrote the email" not in steps
    assert steps["Saved the decision (nothing scheduled)"] == "done"

    failed = H.final_steps([{"type": "error", "text": "could not parse", "data": None}], None)
    assert all(state == "failed" for _, state in failed)

    sched = _call("schedule_followup", {"subject": "s", "body": "b"},
                  {"status": "scheduled", "followup_id": 1, "send_at_utc": "2026-10-02 04:30:00"})
    steps = dict(H.final_steps(sched + [{"type": "decision", "data": {}}], "scheduled"))
    assert steps["Wrote the email"] == "done" and steps["Scheduled it and saved the decision"] == "done"


def test_hard_rule_checks_and_trace_rows():
    ev = [{"type": "plan", "text": "", "data": {"verdict": {"reasons": ["duplicate: follow-up #1 pending"]}}}]
    checks = dict(H.hard_rule_checks(ev))
    assert checks["No follow-up already waiting (no duplicates)"] == "fail"
    assert checks["Conversation is still open"] == "pass"
    assert all(s == "n/a" for _, s in H.hard_rule_checks([]))

    rows = H.trace_rows(_call("list_followups", {"contact_email": "a@b.c"}, {"followups": [1, 2]}))
    assert rows[0]["Tool"] == "list_followups" and "2 follow-ups" in rows[0]["Result"]


def test_form_helpers():
    assert H.missing_form_fields({}) == ["their name", "their email", "what it's about", "what you sent them"]
    assert H.missing_form_fields({"name": "M", "email": "bad", "subject": "s", "sent_body": "b"}) == \
        ["a valid email address"]
    utc = H.local_to_utc(datetime(2026, 9, 28, 10, 0))
    assert utc == datetime(2026, 9, 28, 4, 30)
    msgs = H.build_messages("hello", utc, "thanks", utc)
    assert [m["direction"] for m in msgs] == ["outbound", "inbound"]
    assert H.plural(1, "message") == "1 message" and H.plural(2, "message") == "2 messages"


def test_activity_sentence_hides_internal_events():
    assert H.activity_sentence("agent_run_started", {}, "A", "S") is None
    assert H.activity_sentence("reply_received", {}, "Rahul Mehta", "Quote") == "Rahul Mehta replied about “Quote”"
