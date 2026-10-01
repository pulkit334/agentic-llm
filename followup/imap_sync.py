"""Real-inbox reply detection for "real email" mode.

Logs into the mailbox over IMAP (stdlib imaplib), looks for messages from known
contacts received in the last N days, and records each new reply as an inbound
message on the matching thread so the agent sees "they replied" and stops chasing.

Env (read here directly; .env is loaded by followup.config):
    IMAP_HOST  default imap.gmail.com
    IMAP_PORT  default 993
    SMTP_USER / SMTP_PASS  reused as the IMAP login (a Gmail App Password works for IMAP too)
    SMTP_REDIRECT_TO  optional; when set, replies coming back from that demo inbox are
                      matched to the contact named in the "[DEMO redirect - intended for X]" line
                      (or by subject) so the redirect demo still closes the loop.

CLI:  python -m followup.imap_sync [--days N]
"""
import argparse
import email
import html
import imaplib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email import policy
from email.utils import parseaddr, parsedate_to_datetime

from . import config  # noqa: F401  (loads .env into os.environ)
from . import db

NOT_CONFIGURED = "IMAP not configured: set MAIL_USER/MAIL_PASS (or SMTP_USER/SMTP_PASS)"
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_REDIRECT_MARK = re.compile(r"\[DEMO redirect - intended for\s+([^\]\s]+)\s*\]", re.I)
_SUBJECT_PREFIX = re.compile(r"^\s*(?:(?:re|fwd?|aw|sv)\s*(?:\[\d+\])?\s*:\s*)+", re.I)


# ------------------------------------------------------------------ settings

def _settings() -> dict:
    try:
        port = int(os.getenv("IMAP_PORT", "993") or 993)
    except ValueError:
        port = 993
    return {
        "host": os.getenv("IMAP_HOST", "imap.gmail.com").strip() or "imap.gmail.com",
        "port": port,
        # Same login as sending; config resolves SMTP_* or the MAIL_* aliases.
        "user": config.SMTP["user"].strip(),
        "password": config.SMTP["password"],
        "redirect_to": config.SMTP["redirect_to"].strip().lower(),
    }


def is_configured() -> bool:
    """True when an IMAP login (MAIL_USER/MAIL_PASS or SMTP_USER/SMTP_PASS) is available."""
    s = _settings()
    return bool(s["user"] and s["password"])


# ------------------------------------------------------------------ parsing helpers

def normalize_subject(subject: str | None) -> str:
    """'RE: Fwd: Re[2]:  Proposal  Q3' -> 'proposal q3' (prefixes stripped, case/whitespace folded)."""
    s = _SUBJECT_PREFIX.sub("", subject or "")
    return re.sub(r"\s+", " ", s).strip().lower()


def strip_quoted(text: str | None) -> str:
    """Keep only the new part of a reply.

    Drops lines starting with '>' and everything from an attribution line
    ("On <date>, <name> wrote:", possibly wrapped over 2-3 lines) or an
    Outlook-style "-----Original Message-----" / "From: ... Sent: ..." header onward.
    """
    lines = (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    kept = []
    for i, line in enumerate(lines):
        s = line.strip()
        if re.match(r"^On\s", s):
            window = lines[i:i + 3]
            for j in range(len(window)):
                if window[j].rstrip().endswith("wrote:"):
                    if len(" ".join(w.strip() for w in window[:j + 1])) <= 400:
                        return _tidy(kept)
                    break
        if re.match(r"^-{2,}\s*Original Message\s*-{2,}$", s, re.I):
            return _tidy(kept)
        if re.match(r"^From:\s", s) and any(re.match(r"^\s*Sent:\s", n) for n in lines[i + 1:i + 3]):
            return _tidy(kept)
        if s.startswith(">"):
            continue
        kept.append(line.rstrip())
    return _tidy(kept)


def _tidy(lines: list[str]) -> str:
    text = "\n".join(lines).strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def _html_to_text(markup: str) -> str:
    cut = re.search(r"<(?:div|blockquote)[^>]*class=\"[^\"]*gmail_quote", markup, re.I)
    if cut:
        markup = markup[:cut.start()]
    markup = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", markup)
    markup = re.sub(r"(?is)<blockquote[^>]*>.*?</blockquote>", "", markup)
    markup = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", markup)
    return html.unescape(re.sub(r"<[^>]+>", "", markup))


def extract_text(msg: email.message.EmailMessage) -> str:
    """Plain-text body of a parsed message (text/plain preferred, HTML stripped as fallback)."""
    part = msg.get_body(preferencelist=("plain", "html")) if hasattr(msg, "get_body") else None
    if part is None:
        return ""
    try:
        content = part.get_content()
    except Exception:  # unknown charset etc.
        payload = part.get_payload(decode=True) or b""
        content = payload.decode("utf-8", errors="replace")
    if part.get_content_type() == "text/html":
        content = _html_to_text(content)
    return content


def to_naive_utc(date_header: str | None) -> datetime:
    """RFC 2822 Date header -> naive UTC datetime (falls back to the current real UTC time)."""
    try:
        dt = parsedate_to_datetime(date_header) if date_header else None
    except (TypeError, ValueError, IndexError):
        dt = None
    if dt is None:
        return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(microsecond=0)


def parse_message(raw: bytes) -> dict:
    """Raw RFC 822 bytes -> {from_email, from_name, subject, sent_at, body, raw_text, message_id, auto}."""
    msg = email.message_from_bytes(raw, policy=policy.default)
    name, addr = parseaddr(str(msg.get("From", "")))
    raw_text = extract_text(msg)
    auto = str(msg.get("Auto-Submitted", "no")).strip().lower()
    return {
        "from_email": addr.strip().lower(),
        "from_name": name,
        "subject": str(msg.get("Subject", "") or ""),
        "sent_at": to_naive_utc(msg.get("Date")),
        "body": strip_quoted(raw_text),
        "raw_text": raw_text,
        "message_id": str(msg.get("Message-ID", "") or "").strip(),
        "auto": auto not in ("", "no"),
    }


def imap_date(dt: datetime) -> str:
    """IMAP SEARCH date (dd-Mon-yyyy) without depending on the OS locale."""
    return f"{dt.day:02d}-{_MONTHS[dt.month - 1]}-{dt.year}"


# ------------------------------------------------------------------ thread matching

def _threads_for(contact_email: str) -> list[dict]:
    """Threads of a contact, open first, then most recent activity first."""
    return db.query(
        "SELECT t.id, t.subject, t.status, t.contact_email, "
        "COALESCE(MAX(m.sent_at), t.created_at) AS last_at "
        "FROM threads t LEFT JOIN messages m ON m.thread_id = t.id "
        "WHERE t.contact_email = %s GROUP BY t.id, t.subject, t.status, t.contact_email, t.created_at "
        "ORDER BY (t.status = 'open') DESC, last_at DESC",
        (contact_email,),
    )


def match_thread(contact_email: str, subject: str) -> dict | None:
    """Same contact + same normalized subject, else the contact's most recent open thread."""
    threads = _threads_for(contact_email)
    norm = normalize_subject(subject)
    if norm:
        for t in threads:
            if normalize_subject(t["subject"]) == norm:
                return t
    return next((t for t in threads if t["status"] == "open"), None)


def _match_redirected(parsed: dict, contacts: set[str]) -> tuple[str | None, dict | None]:
    """Reply that came back from the SMTP_REDIRECT_TO demo inbox: find the intended contact."""
    m = _REDIRECT_MARK.search(parsed["raw_text"] or "")
    if m and m.group(1).strip().lower() in contacts:
        contact = m.group(1).strip().lower()
        return contact, match_thread(contact, parsed["subject"])
    norm = normalize_subject(parsed["subject"])
    if not norm:
        return None, None
    rows = db.query(
        "SELECT t.id, t.subject, t.status, t.contact_email, "
        "COALESCE(MAX(m.sent_at), t.created_at) AS last_at "
        "FROM threads t LEFT JOIN messages m ON m.thread_id = t.id "
        "GROUP BY t.id, t.subject, t.status, t.contact_email, t.created_at "
        "ORDER BY (t.status = 'open') DESC, last_at DESC"
    )
    for t in rows:
        if normalize_subject(t["subject"]) == norm:
            return t["contact_email"], t
    return None, None


# ------------------------------------------------------------------ IMAP

def _search_uids(conn: imaplib.IMAP4, since: str, sender: str) -> list[bytes]:
    typ, data = conn.uid("SEARCH", None, "SINCE", since, "FROM", f'"{sender}"')
    if typ != "OK" or not data or not data[0]:
        return []
    return data[0].split()


def _fetch_raw(conn: imaplib.IMAP4, uid: bytes) -> bytes | None:
    typ, data = conn.uid("FETCH", uid, "(BODY.PEEK[])")  # PEEK: do not mark as read
    if typ != "OK" or not data:
        return None
    for item in data:
        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], (bytes, bytearray)):
            return bytes(item[1])
    return None


# ------------------------------------------------------------------ main entry

def sync_replies(since_days: int = 7) -> dict:
    """Pull replies from the real inbox into the messages table. Never raises."""
    s = _settings()
    if not s["user"] or not s["password"]:
        return {"error": NOT_CONFIGURED}
    try:
        since_days = max(int(since_days), 0)
    except (TypeError, ValueError):
        since_days = 7

    try:
        contacts = {r["email"].strip().lower() for r in db.query("SELECT email FROM contacts")}
    except Exception as e:
        return {"error": f"database error: {type(e).__name__}: {e}"}
    since = imap_date(datetime.now(timezone.utc) - timedelta(days=since_days))
    result = {"checked": 0, "added": 0, "threads": [], "duplicates": 0, "skipped": [], "since": since}
    if not contacts:
        return result

    senders = sorted(contacts)
    redirect = s["redirect_to"]
    if redirect and redirect not in contacts:
        senders.append(redirect)

    conn = None
    try:
        conn = imaplib.IMAP4_SSL(s["host"], s["port"], timeout=30)
        conn.login(s["user"], s["password"])
        typ, _ = conn.select("INBOX", readonly=True)
        if typ != "OK":
            return {"error": "could not open INBOX"}

        seen_uids = set()
        for sender in senders:
            for uid in _search_uids(conn, since, sender):
                if uid in seen_uids:
                    continue
                seen_uids.add(uid)
                raw = _fetch_raw(conn, uid)
                if raw is None:
                    continue
                result["checked"] += 1
                _ingest(parse_message(raw), sender, contacts, redirect, result)
    except (imaplib.IMAP4.error, OSError) as e:
        return {"error": f"IMAP error ({s['host']}:{s['port']}): {type(e).__name__}: {e}",
                "checked": result["checked"], "added": result["added"], "threads": result["threads"]}
    except Exception as e:
        return {"error": f"sync failed: {type(e).__name__}: {e}",
                "checked": result["checked"], "added": result["added"], "threads": result["threads"]}
    finally:
        if conn is not None:
            try:
                conn.logout()
            except Exception:
                pass
    return result


def _ingest(p: dict, sender: str, contacts: set[str], redirect: str, result: dict) -> None:
    def skip(reason):
        result["skipped"].append({"from": p["from_email"], "subject": p["subject"], "reason": reason})

    # IMAP FROM is a substring match - confirm the actual address.
    if p["from_email"] != sender:
        return skip("sender address did not match exactly")
    if p["auto"]:
        return skip("auto-generated message (out-of-office / bounce)")
    if not p["body"]:
        return skip("empty body after removing quoted text")

    via_redirect = None
    if sender in contacts:
        contact, thread = sender, match_thread(sender, p["subject"])
    else:  # reply from the SMTP_REDIRECT_TO demo inbox
        via_redirect = sender
        contact, thread = _match_redirected(p, contacts)
    if not thread:
        return skip("no matching thread")

    dup = db.one(
        "SELECT id FROM messages WHERE thread_id=%s AND direction='inbound' AND body=%s",
        (thread["id"], p["body"]),
    )
    if dup:
        result["duplicates"] += 1
        return

    msg_id = db.execute(
        "INSERT INTO messages (thread_id,direction,sender,recipient,body,sent_at,is_followup) "
        "VALUES (%s,'inbound',%s,'me',%s,%s,0)",
        (thread["id"], contact, p["body"], p["sent_at"]),
    )
    details = {
        "message_row_id": msg_id, "from": contact, "subject": p["subject"],
        "sent_at": p["sent_at"].isoformat(sep=" "), "message_id": p["message_id"],
        "preview": p["body"][:160],
    }
    if via_redirect:
        details["via_redirect"] = via_redirect
    db.log_action("reply_synced", thread["id"], details)
    result["added"] += 1
    result["threads"].append({
        "thread_id": thread["id"], "thread_subject": thread["subject"], "from": contact,
        "sent_at": details["sent_at"], "preview": p["body"][:160],
    })


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m followup.imap_sync",
                                 description="Pull replies from the real inbox (IMAP) into the follow-up DB.")
    ap.add_argument("--days", type=int, default=7, help="look back this many days (default 7)")
    args = ap.parse_args(argv)
    res = sync_replies(args.days)
    print(json.dumps(res, indent=2, default=str))
    return 1 if "error" in res else 0


if __name__ == "__main__":
    sys.exit(main())
