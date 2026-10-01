"""scheduler.run_due / advance: sending, auto-cancel on reply, failures, and the IMAP reply-sync hook."""
import pytest

from followup import clock, config, db, email_tool, imap_sync, scheduler, tools

from .conftest import CUSTOMER, NOW

pytestmark = pytest.mark.usefixtures("seeded_db")

THREAD = "cust-pending"  # seeded follow-up due 2026-10-02 05:30 UTC


def followup():
    return db.one("SELECT * FROM followups WHERE thread_id=%s ORDER BY id DESC LIMIT 1", (THREAD,))


def actions(name):
    return db.query("SELECT * FROM action_log WHERE action=%s ORDER BY id", (name,))


def test_nothing_due_yet():
    assert clock.now() == NOW
    assert scheduler.run_due() == []
    assert followup()["status"] == "pending"


def test_run_due_sends_in_mock_mode():
    res = scheduler.advance(24)
    assert res["now"] > NOW
    (r,) = res["results"]
    assert r["followup_id"] == followup()["id"]
    assert r["status"] == "sent" and r["to"] == CUSTOMER and r["provider"] == "mock"
    f = followup()
    assert f["status"] == "sent" and f["done_at"] is not None
    out = db.one("SELECT * FROM outbox WHERE id=%s", (r["outbox_id"],))
    assert out["status"] == "sent" and out["thread_id"] == THREAD
    assert out["sent_at"] == f["send_at"]  # sent at its scheduled time, not the end of the jump
    last = db.one("SELECT * FROM messages WHERE thread_id=%s ORDER BY id DESC LIMIT 1", (THREAD,))
    assert last["direction"] == "outbound" and last["is_followup"] == 1
    assert actions("followup_sent")


def test_reply_auto_cancels():
    scheduler.simulate_reply(THREAD, "Yes, I could open it, thanks!")
    (r,) = scheduler.advance(24)["results"]
    assert r["status"] == "cancelled" and "replied" in r["reason"]
    assert followup()["status"] == "cancelled"
    assert not db.query("SELECT * FROM outbox WHERE thread_id=%s", (THREAD,))
    assert actions("followup_auto_cancelled")


def test_closed_thread_auto_cancels():
    db.execute("UPDATE threads SET status='closed' WHERE id=%s", (THREAD,))
    (r,) = scheduler.advance(24)["results"]
    assert r["status"] == "cancelled" and "closed" in r["reason"]


def test_send_failure_keeps_pending(monkeypatch):
    monkeypatch.setattr(email_tool, "send", lambda *a, **k: {
        "outbox_id": None, "provider": "smtp", "status": "failed", "delivered_to": CUSTOMER,
        "error": "SMTPServerDisconnected: gone"})
    results = scheduler.advance(24)["results"]  # retried at the send time and again at the end of the jump
    assert results and all(x["status"] == "failed" for x in results)
    r = results[0]
    assert r["status"] == "failed" and "gone" in r["reason"]
    assert followup()["status"] == "pending"
    assert actions("followup_send_failed")
    n = db.one("SELECT COUNT(*) AS n FROM messages WHERE thread_id=%s AND is_followup=1", (THREAD,))["n"]
    assert n == 0  # no outbound message recorded for a failed send


def test_smtp_failure_end_to_end_keeps_pending(monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MODE", "smtp")
    monkeypatch.setattr(config, "SMTP", {**config.SMTP, "user": "", "password": ""})
    results = scheduler.advance(24)["results"]  # retried at the send time and again at the end of the jump
    assert results and all(x["status"] == "failed" for x in results)
    r = results[0]
    assert r["status"] == "failed" and r["reason"] == email_tool.NOT_CONFIGURED
    assert followup()["status"] == "pending"


def test_send_exception_keeps_pending(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("tool crashed")
    monkeypatch.setattr(tools, "deliver", boom)
    results = scheduler.advance(24)["results"]  # retried at the send time and again at the end of the jump
    assert results and all(x["status"] == "failed" for x in results)
    r = results[0]
    assert r["status"] == "failed" and "tool crashed" in r["reason"]
    assert followup()["status"] == "pending"


def test_failed_followup_retried_on_next_run(monkeypatch):
    real_send = email_tool.send
    monkeypatch.setattr(email_tool, "send", lambda *a, **k: {"status": "failed", "error": "temporary"})
    scheduler.advance(24)
    assert followup()["status"] == "pending"
    monkeypatch.setattr(email_tool, "send", real_send)
    (r,) = scheduler.run_due()
    assert r["status"] == "sent" and followup()["status"] == "sent"


# ------------------------------------------------------------------ reply-sync hook

def test_no_sync_in_mock_mode(monkeypatch):
    monkeypatch.setattr(imap_sync, "is_configured", lambda: True)
    monkeypatch.setattr(imap_sync, "sync_replies", lambda **k: pytest.fail("must not sync in mock mode"))
    scheduler.run_due()
    assert not actions("reply_sync")


def test_no_sync_without_imap_creds(monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MODE", "smtp")
    monkeypatch.setattr(imap_sync, "is_configured", lambda: False)
    monkeypatch.setattr(imap_sync, "sync_replies", lambda **k: pytest.fail("must not sync without creds"))
    assert scheduler.run_due() == []
    assert not actions("reply_sync")


def test_synced_reply_cancels_before_sending(monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MODE", "smtp")
    monkeypatch.setattr(imap_sync, "is_configured", lambda: True)
    monkeypatch.setattr(email_tool, "is_configured", lambda: True)
    sent = []
    monkeypatch.setattr(email_tool, "_smtp_send", lambda msg, s: sent.append(msg))
    calls = []

    def fake_sync(since_days=7):
        calls.append(since_days)
        scheduler.simulate_reply(THREAD, "Got it, thanks - all good.")  # a real reply arriving over IMAP
        return {"checked": 1, "added": 1, "duplicates": 0, "threads": [{"thread_id": THREAD}], "skipped": []}

    monkeypatch.setattr(imap_sync, "sync_replies", fake_sync)
    clock.set_now(followup()["send_at"])
    (r,) = scheduler.run_due()
    assert calls == [7]
    assert r["status"] == "cancelled" and sent == []
    (log,) = actions("reply_sync")
    assert '"added": 1' in log["details"] and THREAD in log["details"]


def test_advance_syncs_once(monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MODE", "smtp")
    monkeypatch.setattr(imap_sync, "is_configured", lambda: True)
    monkeypatch.setattr(email_tool, "is_configured", lambda: True)
    monkeypatch.setattr(email_tool, "_smtp_send", lambda msg, s: None)
    calls = []
    monkeypatch.setattr(imap_sync, "sync_replies",
                        lambda since_days=7: calls.append(1) or {"checked": 0, "added": 0})
    res = scheduler.advance(72)
    assert len(calls) == 1
    assert [r["status"] for r in res["results"]] == ["sent"]


def test_sync_exception_does_not_block_sending(monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MODE", "smtp")
    monkeypatch.setattr(imap_sync, "is_configured", lambda: True)
    monkeypatch.setattr(email_tool, "is_configured", lambda: True)
    monkeypatch.setattr(email_tool, "_smtp_send", lambda msg, s: None)

    def broken(since_days=7):
        raise RuntimeError("imap exploded")

    monkeypatch.setattr(imap_sync, "sync_replies", broken)
    clock.set_now(followup()["send_at"])
    (r,) = scheduler.run_due()
    assert r["status"] == "sent"
    (log,) = actions("reply_sync")
    assert "imap exploded" in log["details"]


def test_sync_error_result_is_logged(monkeypatch):
    monkeypatch.setattr(config, "EMAIL_MODE", "smtp")
    monkeypatch.setattr(imap_sync, "is_configured", lambda: True)
    monkeypatch.setattr(imap_sync, "sync_replies", lambda since_days=7: {"error": "IMAP error: login failed"})
    scheduler.run_due()
    (log,) = actions("reply_sync")
    assert "login failed" in log["details"]
