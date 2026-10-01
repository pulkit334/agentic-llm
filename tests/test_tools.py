"""Agent tool implementations (followup.tools) against the test database with the mock email provider."""
import json
from datetime import datetime

import pytest

from followup import clock, db, tools

from .conftest import CUSTOMER, NOW, PENDING_BODY

pytestmark = pytest.mark.usefixtures("seeded_db")

FOLLOWUP_BODY = "Hi Cara, did the proposal answer your questions? Happy to walk you through it."


def log_rows(action=None, thread_id=None):
    sql, args = "SELECT * FROM action_log WHERE 1=1", []
    if action:
        sql += " AND action=%s"
        args.append(action)
    if thread_id:
        sql += " AND thread_id=%s"
        args.append(thread_id)
    return db.query(sql + " ORDER BY id", args)


def pending(thread_id):
    return db.query("SELECT * FROM followups WHERE thread_id=%s AND status='pending'", (thread_id,))


# ------------------------------------------------------------------ save_conversation

CONVO = {
    "contact": {"email": "  Priya@NewCo.example ", "name": "Priya Shah", "type": "business",
                "company": "NewCo", "timezone": "Europe/London"},
    "subject": "Reseller agreement",
    "messages": [
        {"direction": "inbound", "body": "Could you send the reseller terms?", "sent_at": "2026-09-29 09:00"},
        {"direction": "outbound", "body": "Attached are the reseller terms.", "sent_at": "2026-09-29 11:30"},
    ],
}


def test_save_conversation_creates_contact_and_thread():
    r = tools.save_conversation(**CONVO)
    assert r == {"thread_id": "reseller-agreement-priya", "new_thread": True, "messages_added": 2,
                 "messages_skipped_as_duplicates": 0}

    c = db.one("SELECT * FROM contacts WHERE email='priya@newco.example'")
    assert (c["name"], c["type"], c["company"], c["timezone"]) == \
        ("Priya Shah", "business", "NewCo", "Europe/London")
    t = db.one("SELECT * FROM threads WHERE id=%s", (r["thread_id"],))
    assert t["status"] == "open" and t["contact_email"] == "priya@newco.example"
    assert t["created_at"] == datetime(2026, 9, 29, 9, 0)

    msgs = db.query("SELECT * FROM messages WHERE thread_id=%s ORDER BY sent_at", (r["thread_id"],))
    assert [(m["direction"], m["sender"], m["recipient"]) for m in msgs] == [
        ("inbound", "priya@newco.example", "me"), ("outbound", "me", "priya@newco.example")]


def test_save_conversation_second_call_skips_duplicates():
    first = tools.save_conversation(**CONVO)
    again = tools.save_conversation(**CONVO)
    assert again == {"thread_id": first["thread_id"], "new_thread": False, "messages_added": 0,
                     "messages_skipped_as_duplicates": 2}
    assert db.one("SELECT COUNT(*) n FROM messages WHERE thread_id=%s", (first["thread_id"],))["n"] == 2
    assert db.one("SELECT COUNT(*) n FROM contacts WHERE email='priya@newco.example'")["n"] == 1

    # A longer paste of the same conversation only adds the new message, found by subject (any case).
    more = dict(CONVO, subject="RESELLER AGREEMENT", messages=CONVO["messages"] + [
        {"direction": "inbound", "body": "Thanks, we will review.", "sent_at": "2026-09-30 10:00"}])
    r = tools.save_conversation(**more)
    assert (r["thread_id"], r["new_thread"], r["messages_added"], r["messages_skipped_as_duplicates"]) == \
        (first["thread_id"], False, 1, 2)


def test_save_conversation_into_existing_seed_thread_and_type_update():
    r = tools.save_conversation({"email": CUSTOMER, "name": "Cara", "type": "business"}, "ignored",
                                [{"direction": "inbound", "body": "Yes, send the invoice.",
                                  "sent_at": "2026-09-30T08:00:00Z"}], thread_id="cust-waiting")
    assert r["thread_id"] == "cust-waiting" and r["new_thread"] is False and r["messages_added"] == 1
    assert db.one("SELECT type FROM contacts WHERE email=%s", (CUSTOMER,))["type"] == "business"


def test_save_conversation_does_not_merge_threads_of_different_contacts():
    """Same subject + same mailbox name at two companies must give two separate threads."""
    a = tools.save_conversation({"email": "info@alpha.example", "name": "Alpha", "type": "customer"},
                                "Quote request", [{"direction": "inbound", "body": "Need a quote for 10 seats.",
                                                   "sent_at": "2026-09-29 09:00"}])
    b = tools.save_conversation({"email": "info@beta.example", "name": "Beta", "type": "customer"},
                                "Quote request", [{"direction": "inbound", "body": "Need a quote for 99 seats.",
                                                   "sent_at": "2026-09-29 10:00"}])
    assert a["thread_id"] != b["thread_id"]
    assert b["new_thread"] is True
    owners = {r["id"]: r["contact_email"] for r in db.query("SELECT id, contact_email FROM threads")}
    assert owners[a["thread_id"]] == "info@alpha.example"
    assert owners[b["thread_id"]] == "info@beta.example"
    # and a re-paste for beta lands on beta's thread, not alpha's
    again = tools.save_conversation({"email": "info@beta.example", "name": "Beta", "type": "customer"},
                                    "Quote request", [{"direction": "inbound", "body": "Need a quote for 99 seats.",
                                                       "sent_at": "2026-09-29 10:00"}])
    assert again["thread_id"] == b["thread_id"] and again["messages_added"] == 0


@pytest.mark.parametrize("text, expected", [
    ("2026-10-02 05:30", datetime(2026, 10, 2, 5, 30)),
    ("2026-10-02T05:30:00Z", datetime(2026, 10, 2, 5, 30)),
    ("2026-10-02 05:30 UTC", datetime(2026, 10, 2, 5, 30)),
    ("2026-10-02T05:30:00+00:00", datetime(2026, 10, 2, 5, 30)),
    ("2026-10-02T11:00:00+05:30", datetime(2026, 10, 2, 5, 30)),   # converted, not just stripped
    ("2026-10-02T01:30:00-04:00", datetime(2026, 10, 2, 5, 30)),
])
def test_parse_dt_returns_naive_utc(text, expected):
    assert tools._parse_dt(text) == expected


# ------------------------------------------------------------------ read tools

def test_get_thread_history_summary():
    h = tools.get_thread_history("cust-pending")
    assert h["contact"]["type"] == "customer"
    assert h["now_utc"] == "2026-10-01 05:30:00"
    assert h["summary"]["recipient_wrote_last"] is False
    assert [p["body"] for p in h["summary"]["pending_followups"]] == [PENDING_BODY]
    assert tools.get_thread_history("cust-replied")["summary"]["recipient_wrote_last"] is True
    assert "error" in tools.get_thread_history("nope")


def test_get_strategy_suggests_business_hours_slot():
    s = tools.get_strategy("biz-ny")
    assert s["contact_type"] == "business" and s["delay_hours"] == 96
    # last outbound + 96h is long past -> as soon as possible -> 09:00 New York time
    assert s["suggested_send_at_utc"] == "2026-10-01 13:00:00"
    assert s["suggested_send_at_local"].endswith("09:00 America/New_York")


def test_get_contact_and_list_followups():
    c = tools.get_contact(CUSTOMER.upper())
    assert c["type"] == "customer" and len(c["threads"]) == 5
    assert "error" in tools.get_contact("ghost@example.com")
    fl = tools.list_followups(CUSTOMER)["followups"]
    assert [(f["thread_id"], f["status"]) for f in fl] == [("cust-pending", "pending")]


# ------------------------------------------------------------------ schedule / cancel / close

def test_schedule_followup_then_duplicate_is_blocked():
    r = tools.schedule_followup("cust-waiting", "Re: Pricing proposal", FOLLOWUP_BODY, "2026-10-02 05:30",
                                "no reply for 3 days", _run_id="run-1")
    assert r["status"] == "scheduled", r
    assert r["send_at_utc"] == "2026-10-02 05:30:00"
    assert r["send_at_local"] == "Fri 02 Oct 2026 11:00 Asia/Kolkata"
    row = db.one("SELECT * FROM followups WHERE id=%s", (r["followup_id"],))
    assert (row["status"], row["strategy"], row["contact_email"]) == ("pending", "customer", CUSTOMER)
    assert row["created_at"] == NOW
    logged = log_rows("followup_scheduled", "cust-waiting")
    assert len(logged) == 1 and logged[0]["run_id"] == "run-1" and logged[0]["ts"] == NOW

    second = tools.schedule_followup("cust-waiting", "Re: Pricing proposal", "A different nudge.",
                                     "2026-10-05 05:30", "try again")
    assert second["status"] == "blocked"
    assert any(f"duplicate: follow-up #{r['followup_id']}" in reason for reason in second["reasons"])
    assert len(pending("cust-waiting")) == 1
    blocked = log_rows("followup_blocked", "cust-waiting")
    assert len(blocked) == 1 and "duplicate" in json.loads(blocked[0]["details"])["reasons"][0]


def test_schedule_followup_reports_time_adjustments():
    r = tools.schedule_followup("cust-waiting", "Re: Pricing proposal", FOLLOWUP_BODY, "2026-10-03 05:30", "weekend")
    assert r["status"] == "scheduled"
    assert r["send_at_utc"] == "2026-10-05 03:30:00"
    assert r["adjustments"]


def test_schedule_followup_unknown_thread():
    assert tools.schedule_followup("nope", "s", "b", "2026-10-02 05:30", "r")["status"] == "error"


def test_cancel_followup():
    fid = pending("cust-pending")[0]["id"]
    assert tools.cancel_followup(fid, "customer replied by phone", _run_id="r2") == \
        {"status": "cancelled", "followup_id": fid}
    row = db.one("SELECT * FROM followups WHERE id=%s", (fid,))
    assert row["status"] == "cancelled" and row["done_at"] == NOW
    assert row["reason"] == "no reply | cancelled: customer replied by phone"
    assert log_rows("followup_cancelled", "cust-pending")[0]["run_id"] == "r2"

    assert tools.cancel_followup(fid, "again")["status"] == "noop"
    assert tools.cancel_followup(999999, "missing")["status"] == "error"
    # with nothing pending, a new follow-up can be scheduled
    assert tools.schedule_followup("cust-pending", "Re: Demo", "Any thoughts on the demo?", "2026-10-02 05:30",
                                   "replacement")["status"] == "scheduled"


def test_close_thread_cancels_pending_followups():
    r = tools.close_thread("cust-pending", "customer signed", _run_id="r3")
    assert r == {"status": "closed", "thread_id": "cust-pending"}
    assert db.one("SELECT status FROM threads WHERE id='cust-pending'")["status"] == "closed"
    assert list(pending("cust-pending")) == []
    assert db.one("SELECT status FROM followups WHERE thread_id='cust-pending'")["status"] == "cancelled"
    actions = [row["action"] for row in log_rows(thread_id="cust-pending")]
    assert actions == ["followup_cancelled", "thread_closed"]

    blocked = tools.schedule_followup("cust-pending", "Re: Demo", "Still there?", "2026-10-02 05:30", "r")
    assert blocked["status"] == "blocked" and "thread is closed" in blocked["reasons"]


def test_record_decision_writes_action_log():
    assert tools.record_decision("cust-replied", "skipped", "they will reply by Friday",
                                 key_points=["promised update"], _run_id="r4") == {"status": "recorded"}
    row = log_rows("decision:skipped", "cust-replied")[0]
    assert row["run_id"] == "r4" and row["ts"] == NOW
    assert json.loads(row["details"]) == {"reason": "they will reply by Friday", "key_points": ["promised update"]}


def test_execute_dispatch_passes_run_id_and_catches_errors():
    assert tools.execute("record_decision", {"thread_id": "cust-waiting", "decision": "skipped", "reason": "x"},
                         run_id="r5") == {"status": "recorded"}
    assert log_rows("decision:skipped", "cust-waiting")[0]["run_id"] == "r5"
    assert "unknown tool" in tools.execute("nope", {})["error"]
    assert "TypeError" in tools.execute("get_contact", {"wrong": 1})["error"]


# ------------------------------------------------------------------ send_email_now (mock provider)

def test_send_email_now_reply_in_mock_mode():
    r = tools.send_email_now("cust-replied", "Re: Contract review", "Onboarding takes two weeks from signing.",
                             "answer their question", _run_id="r6")
    assert r["status"] == "sent" and r["provider"] == "mock" and r["delivered_to"] == CUSTOMER

    box = db.one("SELECT * FROM outbox WHERE id=%s", (r["outbox_id"],))
    assert (box["thread_id"], box["to_email"], box["provider"], box["status"], box["sent_at"]) == \
        ("cust-replied", CUSTOMER, "mock", "sent", NOW)
    assert box["subject"] == "Re: Contract review"

    last = db.one("SELECT * FROM messages WHERE thread_id='cust-replied' ORDER BY sent_at DESC, id DESC LIMIT 1")
    assert (last["direction"], last["body"], last["sent_at"], last["is_followup"]) == \
        ("outbound", "Onboarding takes two weeks from signing.", NOW, 0)
    sent_log = log_rows("email_sent", "cust-replied")
    assert len(sent_log) == 1 and sent_log[0]["run_id"] == "r6"

    # we now wrote last, so a second "reply" has nothing to answer
    again = tools.send_email_now("cust-replied", "Re: Contract review", "Another answer.", "x")
    assert again["status"] == "blocked" and any("nothing to reply to" in x for x in again["reasons"])
    assert db.one("SELECT COUNT(*) n FROM outbox")["n"] == 1


def test_send_email_now_followup_is_flagged_and_counted():
    r = tools.send_email_now("cust-waiting", "Re: Pricing proposal", FOLLOWUP_BODY, "chase", kind="followup")
    assert r["status"] == "sent"
    last = db.one("SELECT * FROM messages WHERE thread_id='cust-waiting' ORDER BY id DESC LIMIT 1")
    assert last["is_followup"] == 1
    assert tools.get_thread_history("cust-waiting")["summary"]["followups_already_sent"] == 1


def test_send_email_now_refuses_outside_business_hours():
    clock.set_now(datetime(2026, 10, 3, 5, 30))  # Saturday
    r = tools.send_email_now("cust-replied", "Re: Contract review", "Answer.", "answer")
    assert r["status"] == "not_sent"
    assert "2026-10-05 03:30:00" in r["hint"]
    assert db.one("SELECT COUNT(*) n FROM outbox")["n"] == 0


def test_send_email_now_blocked_rules_write_no_outbox():
    r = tools.send_email_now("cust-optout", "Re: Renewal", "One more offer!", "x", kind="followup")
    assert r["status"] == "blocked"
    assert db.one("SELECT COUNT(*) n FROM outbox")["n"] == 0
    assert log_rows("send_blocked", "cust-optout")
