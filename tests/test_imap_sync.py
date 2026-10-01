"""imap_sync: the not-configured path (no network), login failure, and the CLI wrapper."""
import imaplib

import pytest

from followup import cli, config, imap_sync

pytestmark = pytest.mark.usefixtures("seeded_db")


@pytest.fixture
def no_creds(monkeypatch):
    monkeypatch.setattr(config, "SMTP", {**config.SMTP, "user": "", "password": "", "redirect_to": ""})
    monkeypatch.setattr(imaplib, "IMAP4_SSL", lambda *a, **k: pytest.fail("must not connect without creds"))


def test_not_configured(no_creds):
    assert imap_sync.is_configured() is False
    assert imap_sync.sync_replies(7) == {"error": imap_sync.NOT_CONFIGURED}


def test_configured_flag(monkeypatch):
    monkeypatch.setattr(config, "SMTP", {**config.SMTP, "user": "me@acme.example", "password": "x" * 16})
    assert imap_sync.is_configured() is True


def test_cli_sync_replies_not_configured(no_creds, capsys):
    rc = cli.main(["sync-replies", "--days", "3"])
    out = capsys.readouterr().out
    assert rc == 1 and "IMAP not configured" in out


def test_login_failure_is_reported_not_raised(monkeypatch):
    secret = "s3cretAppPassw0rd"
    monkeypatch.setattr(config, "SMTP", {**config.SMTP, "user": "me@acme.example", "password": secret,
                                         "redirect_to": ""})

    class FakeIMAP:
        def __init__(self, *a, **k):
            pass

        def login(self, user, password):
            raise imaplib.IMAP4.error("[AUTHENTICATIONFAILED] Invalid credentials")

        def logout(self):
            pass

    monkeypatch.setattr(imaplib, "IMAP4_SSL", FakeIMAP)
    res = imap_sync.sync_replies(7)
    assert "AUTHENTICATIONFAILED" in res["error"] and secret not in res["error"]
