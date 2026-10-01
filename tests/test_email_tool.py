"""email_tool: mock path and the SMTP path with smtplib replaced by a fake server."""
import base64
import smtplib

import pytest

from followup import config, db, email_tool

from .conftest import CUSTOMER

pytestmark = pytest.mark.usefixtures("seeded_db")

PASSWORD = "abcdefghijklmnop"


class FakeSMTP:
    """Records what the email tool does with the connection."""
    instances = []
    fail_on = None  # name of the step that should raise

    def __init__(self, host, port, timeout=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.calls, self.sent = [], []
        self.ssl = False
        self.login_args = None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def _step(self, name):
        self.calls.append(name)
        if FakeSMTP.fail_on == name:
            # Some servers echo what they received - make sure it is scrubbed.
            raise smtplib.SMTPAuthenticationError(535, f"5.7.8 not accepted {PASSWORD}".encode())

    def ehlo(self):
        self._step("ehlo")

    def starttls(self):
        self._step("starttls")

    def login(self, user, password):
        self._step("login")
        self.login_args = (user, password)

    def send_message(self, msg):
        self._step("send_message")
        self.sent.append(msg)


class FakeSMTPSSL(FakeSMTP):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.ssl = True


@pytest.fixture
def smtp(monkeypatch):
    FakeSMTP.instances = []
    FakeSMTP.fail_on = None
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTPSSL)
    monkeypatch.setattr(config, "EMAIL_MODE", "smtp")
    settings = {"host": "smtp.example.com", "port": 587, "user": "agent@acme.example", "password": PASSWORD,
                "sender": "agent@acme.example", "redirect_to": "", "reply_to": ""}
    monkeypatch.setattr(config, "SMTP", settings)
    return settings


def outbox(outbox_id):
    return db.one("SELECT * FROM outbox WHERE id=%s", (outbox_id,))


def test_mock_mode_only_writes_outbox(monkeypatch):
    monkeypatch.setattr(smtplib, "SMTP", lambda *a, **k: pytest.fail("mock mode must not open SMTP"))
    res = email_tool.send(CUSTOMER, "Hello", "Body", "cust-waiting")
    assert res["status"] == "sent" and res["provider"] == "mock"
    row = outbox(res["outbox_id"])
    assert row["status"] == "sent" and row["delivered_to"] == CUSTOMER and row["provider"] == "mock"


def test_starttls_on_587(smtp):
    res = email_tool.send(CUSTOMER, "Pricing", "Hi Cara,\n\nAny questions?", "cust-waiting")
    assert res["status"] == "sent", res
    (server,) = FakeSMTP.instances
    assert not server.ssl and server.port == 587
    assert server.calls.index("starttls") < server.calls.index("login") < server.calls.index("send_message")
    assert server.login_args == ("agent@acme.example", PASSWORD)


def test_ssl_on_465(smtp):
    smtp["port"] = 465
    res = email_tool.send(CUSTOMER, "Pricing", "Body", "cust-waiting")
    assert res["status"] == "sent", res
    (server,) = FakeSMTP.instances
    assert server.ssl and server.port == 465
    assert server.calls == ["login", "send_message"]  # no STARTTLS on an implicit-TLS connection


def test_headers_and_alternatives(smtp):
    email_tool.send(CUSTOMER, "Re: Pricing proposal", "Hi Cara,\n\nLine two <b>&", "cust-waiting")
    email_tool.send(CUSTOMER, "Re: Pricing proposal", "Second follow-up", "cust-waiting")
    m1, m2 = FakeSMTP.instances[0].sent[0], FakeSMTP.instances[1].sent[0]
    assert m1["To"] == CUSTOMER and m1["From"] == "agent@acme.example"
    assert m1["Reply-To"] == "agent@acme.example"
    # Unique Message-ID per email, same per-thread anchor so Gmail groups them.
    assert m1["Message-ID"] and m1["Message-ID"] != m2["Message-ID"]
    assert m1["In-Reply-To"] == m2["In-Reply-To"] == m1["References"]
    assert m1["In-Reply-To"] == email_tool.thread_message_id("cust-waiting", "agent@acme.example")
    assert m1["In-Reply-To"].startswith("<") and m1["In-Reply-To"].endswith("@acme.example>")
    assert m1.get_content_type() == "multipart/alternative"
    plain = m1.get_body(preferencelist=("plain",)).get_content()
    rich = m1.get_body(preferencelist=("html",)).get_content()
    assert "Line two <b>&" in plain
    assert "Line two &lt;b&gt;&amp;" in rich and "<p" in rich


def test_other_thread_gets_other_anchor():
    a = email_tool.thread_message_id("cust-waiting", "agent@acme.example")
    b = email_tool.thread_message_id("cust-pending", "agent@acme.example")
    assert a != b and email_tool.thread_message_id(None) is None


def test_custom_reply_to(smtp):
    smtp["reply_to"] = "team@acme.example"
    email_tool.send(CUSTOMER, "Hi", "Body", "cust-waiting")
    assert FakeSMTP.instances[0].sent[0]["Reply-To"] == "team@acme.example"


def test_no_thread_id_has_no_reference_headers(smtp):
    email_tool.send(CUSTOMER, "Hi", "Body", None)
    msg = FakeSMTP.instances[0].sent[0]
    assert msg["Message-ID"] and msg["In-Reply-To"] is None and msg["References"] is None


def test_redirect_safety_net(smtp):
    smtp["redirect_to"] = "demo-inbox@acme.example"
    res = email_tool.send(CUSTOMER, "Pricing", "Original body", "cust-waiting")
    assert res["status"] == "sent" and res["delivered_to"] == "demo-inbox@acme.example"
    msg = FakeSMTP.instances[0].sent[0]
    assert msg["To"] == "demo-inbox@acme.example"
    assert f"[DEMO redirect - intended for {CUSTOMER}]" in msg.get_body(preferencelist=("plain",)).get_content()
    row = outbox(res["outbox_id"])
    assert row["to_email"] == CUSTOMER and row["delivered_to"] == "demo-inbox@acme.example"
    assert row["body"] == "Original body"


@pytest.mark.parametrize("step", ["starttls", "login", "send_message"])
def test_failure_is_recorded_without_password(smtp, step):
    FakeSMTP.fail_on = step
    res = email_tool.send(CUSTOMER, "Pricing", "Body", "cust-waiting")  # must not raise
    assert res["status"] == "failed"
    assert "SMTPAuthenticationError" in res["error"] and PASSWORD not in res["error"]
    row = outbox(res["outbox_id"])
    assert row["status"] == "failed" and PASSWORD not in (row["error"] or "")


def test_connection_error_is_recorded(smtp, monkeypatch):
    def boom(*a, **k):
        raise OSError("connection refused")
    monkeypatch.setattr(smtplib, "SMTP", boom)
    res = email_tool.send(CUSTOMER, "Pricing", "Body", "cust-waiting")
    assert res["status"] == "failed" and "connection refused" in res["error"]


def test_missing_credentials_fail_gracefully(smtp):
    smtp["user"], smtp["password"] = "", ""
    res = email_tool.send(CUSTOMER, "Pricing", "Body", "cust-waiting")
    assert res["status"] == "failed" and res["error"] == email_tool.NOT_CONFIGURED
    assert FakeSMTP.instances == []  # never tried to connect
    assert outbox(res["outbox_id"])["status"] == "failed"


def test_sanitize_error_strips_base64_password():
    b64 = base64.b64encode(PASSWORD.encode()).decode()
    out = email_tool.sanitize_error(f"auth failed {PASSWORD} / {b64}", [PASSWORD])
    assert PASSWORD not in out and b64 not in out and "***" in out


def test_cli_test_email_mock(capsys):
    from followup import cli
    rc = cli.main(["test-email", "--to", "me@example.com"])
    out = capsys.readouterr().out
    assert rc == 0 and "OK:" in out and "me@example.com" in out


def test_cli_test_email_smtp_without_creds(smtp, capsys):
    from followup import cli
    smtp["user"], smtp["password"] = "", ""
    rc = cli.main(["test-email", "--to", "me@example.com"])
    out = capsys.readouterr().out
    assert rc == 1 and "FAILED: SMTP not configured" in out


def test_cli_test_email_never_prints_password(smtp, capsys):
    from followup import cli
    FakeSMTP.fail_on = "login"
    rc = cli.main(["test-email"])
    out = capsys.readouterr().out
    assert rc == 1 and PASSWORD not in out
