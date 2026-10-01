"""Email sending: mock (outbox table only) or real SMTP.

SMTP details:
  * port 465 -> implicit TLS (smtplib.SMTP_SSL); any other port -> plain SMTP upgraded with STARTTLS.
  * Every email carries Reply-To, a unique Message-ID and In-Reply-To/References pointing at a stable
    per-thread id, so Gmail/Outlook group the agent's follow-ups (and the contact's replies) in one thread.
  * The body is sent as text/plain with a simple text/html alternative.
  * SMTP_REDIRECT_TO (alias MAIL_REDIRECT_TO) is a safety net: when set, every real email goes there instead.
  * Failures never raise: the outbox row is stored with status 'failed' and a sanitized error
    (the password is never included).
"""
import base64
import hashlib
import html
import re
import smtplib
import uuid
from email.message import EmailMessage
from email.utils import formatdate, parseaddr

from . import config, db
from .clock import now

NOT_CONFIGURED = ("SMTP not configured: set MAIL_USER and MAIL_PASS (or SMTP_USER/SMTP_PASS) in .env "
                  "- for Gmail use a 16-character App Password")
SMTP_TIMEOUT = 20


# ------------------------------------------------------------------ helpers

def _domain(addr: str | None) -> str:
    _, email_addr = parseaddr(addr or "")
    if "@" in email_addr:
        dom = re.sub(r"[^A-Za-z0-9.-]", "", email_addr.rsplit("@", 1)[1]).lower()
        if dom:
            return dom
    return "followup-agent.local"


def thread_message_id(thread_id: str | None, sender: str | None = None) -> str | None:
    """Stable Message-ID-style anchor for a thread (same value for every email on that thread)."""
    if not thread_id:
        return None
    token = re.sub(r"[^A-Za-z0-9._-]", "-", str(thread_id))[:64]
    digest = hashlib.sha1(str(thread_id).encode("utf-8")).hexdigest()[:10]
    return f"<thread-{token}-{digest}@{_domain(sender)}>"


def html_body(text: str) -> str:
    """Minimal, safe HTML rendering of a plain-text body (paragraphs + line breaks)."""
    paras = [p for p in re.split(r"\n\s*\n", (text or "").strip()) if p.strip()]
    inner = "".join(
        '<p style="margin:0 0 12px 0">' + html.escape(p.strip()).replace("\n", "<br>") + "</p>" for p in paras
    )
    return ('<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;'
            f'line-height:1.5;color:#222">{inner}</body></html>')


def sanitize_error(err: str, secrets) -> str:
    """Remove secrets from an error string (also the base64 form an SMTP AUTH exchange may echo)."""
    out = err or ""
    for s in secrets or []:
        if not s:
            continue
        variants = {s, s.replace(" ", ""), base64.b64encode(s.encode("utf-8")).decode("ascii")}
        for v in variants:
            if v and len(v) >= 3:
                out = out.replace(v, "***")
    return out


def build_message(to_email: str, delivered_to: str, subject: str, body: str,
                  thread_id: str | None, settings: dict) -> EmailMessage:
    sender = settings.get("sender") or settings.get("user") or ""
    text = body
    if delivered_to.strip().lower() != to_email.strip().lower():
        text = f"[DEMO redirect - intended for {to_email}]\n\n{body}"

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = delivered_to
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=False, usegmt=True)
    msg["Reply-To"] = settings.get("reply_to") or sender
    msg["Message-ID"] = f"<fu-{uuid.uuid4().hex}@{_domain(sender)}>"
    anchor = thread_message_id(thread_id, sender)
    if anchor:
        msg["In-Reply-To"] = anchor
        msg["References"] = anchor
        msg["X-Followup-Thread"] = str(thread_id)
    msg.set_content(text)
    msg.add_alternative(html_body(text), subtype="html")
    return msg


def _smtp_send(msg: EmailMessage, s: dict) -> None:
    host, port = s["host"], int(s["port"])
    if port == 465:  # implicit TLS
        with smtplib.SMTP_SSL(host, port, timeout=SMTP_TIMEOUT) as server:
            server.login(s["user"], s["password"])
            server.send_message(msg)
    else:  # 587 (or other): upgrade with STARTTLS before logging in
        with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(s["user"], s["password"])
            server.send_message(msg)


def is_configured() -> bool:
    s = config.SMTP
    return bool((s.get("user") or "").strip() and s.get("password"))


# ------------------------------------------------------------------ main entry

def send(to_email: str, subject: str, body: str, thread_id: str | None = None) -> dict:
    mode = config.EMAIL_MODE
    delivered_to = to_email
    status, error = "sent", None

    if mode == "smtp":
        s = config.SMTP
        delivered_to = (s.get("redirect_to") or "").strip() or to_email
        if not is_configured():
            status, error = "failed", NOT_CONFIGURED
        else:
            try:
                msg = build_message(to_email, delivered_to, subject, body, thread_id, s)
                _smtp_send(msg, s)
            except Exception as e:  # keep the agent running; record the failure
                status = "failed"
                error = sanitize_error(f"{type(e).__name__}: {e}", [s.get("password", "")])

    outbox_id = db.execute(
        "INSERT INTO outbox (thread_id,to_email,delivered_to,subject,body,provider,status,error,sent_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (thread_id, to_email, delivered_to, subject, body, mode, status, error, now()),
    )
    return {"outbox_id": outbox_id, "provider": mode, "status": status, "delivered_to": delivered_to, "error": error}
