"""Email sending: mock (outbox table only) or real SMTP."""
import smtplib
from email.message import EmailMessage

from . import config, db
from .clock import now


def send(to_email: str, subject: str, body: str, thread_id: str | None = None) -> dict:
    mode = config.EMAIL_MODE
    delivered_to = to_email
    status, error = "sent", None

    if mode == "smtp":
        s = config.SMTP
        delivered_to = s["redirect_to"] or to_email
        try:
            msg = EmailMessage()
            msg["From"] = s["sender"]
            msg["To"] = delivered_to
            msg["Subject"] = subject
            text = body
            if delivered_to != to_email:
                text = f"[DEMO redirect - intended for {to_email}]\n\n{body}"
            msg.set_content(text)
            with smtplib.SMTP(s["host"], s["port"], timeout=20) as server:
                server.starttls()
                server.login(s["user"], s["password"])
                server.send_message(msg)
        except Exception as e:  # keep the agent running; record the failure
            status, error = "failed", f"{type(e).__name__}: {e}"

    outbox_id = db.execute(
        "INSERT INTO outbox (thread_id,to_email,delivered_to,subject,body,provider,status,error,sent_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (thread_id, to_email, delivered_to, subject, body, mode, status, error, now()),
    )
    return {"outbox_id": outbox_id, "provider": mode, "status": status, "delivered_to": delivered_to, "error": error}
