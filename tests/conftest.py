"""Shared fixtures.

The environment is pinned BEFORE `followup` is imported: config reads env vars at import time and
load_dotenv() never overrides variables that already exist, so the suite always runs against the
throw-away database `followup_agent_test`, the simulated clock and the mock email provider.
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

os.environ["MYSQL_DATABASE"] = "followup_agent_test"
os.environ["CLOCK_MODE"] = "sim"
os.environ["EMAIL_MODE"] = "mock"

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402

from followup import config, db  # noqa: E402

TEST_DB = "followup_agent_test"
if config.MYSQL["database"] != TEST_DB:  # followup.config was imported before this file - refuse to run
    raise RuntimeError(f"tests must run against {TEST_DB}, got {config.MYSQL['database']!r}")

# Thursday 2026-10-01 05:30 UTC == 11:00 IST (inside Mon-Fri 09:00-18:00 Asia/Kolkata).
NOW = datetime(2026, 10, 1, 5, 30)

CUSTOMER = "cara@example.com"
STUDENT = "sam@example.edu"
EMPLOYEE = "eve@example.com"
BUSINESS = "bob@partner.example"

CONTACT_BY_TYPE = {"customer": CUSTOMER, "student": STUDENT, "employee": EMPLOYEE, "business": BUSINESS}

PENDING_BODY = "Hi Cara, just checking you could open the demo recording."
WAITING_BODY = "Hi Cara, sharing the pricing proposal for 50 seats. Let me know if you have questions."


def _out(at, body, followup=False):
    return {"direction": "outbound", "sent_at": at, "body": body, "is_followup": followup}


def _in(at, body):
    return {"direction": "inbound", "sent_at": at, "body": body}


SEED = {
    "clock": NOW.isoformat(),
    "contacts": [
        {"email": CUSTOMER, "name": "Cara Customer", "type": "customer", "company": "Cara Co",
         "timezone": "Asia/Kolkata"},
        {"email": STUDENT, "name": "Sam Student", "type": "student", "timezone": "Asia/Kolkata"},
        {"email": EMPLOYEE, "name": "Eve Employee", "type": "employee", "timezone": "Asia/Kolkata"},
        {"email": BUSINESS, "name": "Bob Business", "type": "business", "company": "Partner Inc",
         "timezone": "America/New_York"},
    ],
    "threads": [
        # We wrote last, 3 days ago, nothing pending -> a follow-up is allowed.
        {"id": "cust-waiting", "subject": "Pricing proposal", "contact_email": CUSTOMER,
         "messages": [_out("2026-09-28T05:30:00", WAITING_BODY)]},
        # A follow-up is already queued.
        {"id": "cust-pending", "subject": "Demo recording", "contact_email": CUSTOMER,
         "messages": [_out("2026-09-28T06:00:00", "Hi Cara, here is the demo recording link.")],
         "followups": [{"subject": "Re: Demo recording", "body": PENDING_BODY, "send_at": "2026-10-02T05:30:00",
                        "status": "pending", "strategy": "customer", "reason": "no reply",
                        "created_at": "2026-09-28T06:05:00"}]},
        # They replied after our message and promised an update (and asked a question).
        {"id": "cust-replied", "subject": "Contract review", "contact_email": CUSTOMER,
         "messages": [_out("2026-09-28T05:30:00", "Did you get a chance to review the contract?"),
                      _in("2026-09-30T06:00:00", "Reviewing it with my team, I'll get back to you by Friday. "
                                                 "Can you confirm the onboarding timeline?")]},
        # Opt-out phrase in their last message; we acknowledged afterwards, so we wrote last.
        {"id": "cust-optout", "subject": "Renewal", "contact_email": CUSTOMER,
         "messages": [_out("2026-09-25T05:30:00", "Your renewal is coming up next month."),
                      _in("2026-09-27T05:30:00", "Thanks, but we are not interested in renewing."),
                      _out("2026-09-28T05:30:00", "Understood, thank you for letting us know.")]},
        {"id": "cust-closed", "subject": "Support ticket", "contact_email": CUSTOMER, "status": "closed",
         "messages": [_out("2026-09-25T05:30:00", "Glad we could resolve the ticket.")]},
        # We messaged an hour ago -> the 24h minimum gap applies.
        {"id": "emp-recent", "subject": "Q3 report", "contact_email": EMPLOYEE,
         "messages": [_out("2026-10-01T04:30:00", "Hi Eve, can you share the Q3 report status by Friday?")]},
        # New York recipient: 05:30 UTC is 01:30 EDT, outside business hours.
        {"id": "biz-ny", "subject": "Partnership proposal", "contact_email": BUSINESS,
         "messages": [_out("2026-09-24T14:00:00", "Following our call, attached is the partnership proposal.")]},
    ],
}


def add_thread(thread_id, contact_email, messages, status="open", subject=None):
    """Insert an extra thread straight into the test DB (messages use the seed's dict shape)."""
    db.execute("INSERT INTO threads (id,subject,contact_email,status,created_at) VALUES (%s,%s,%s,%s,%s)",
               (thread_id, subject or thread_id, contact_email, status, db._ts(messages[0]["sent_at"])))
    for m in messages:
        out = m["direction"] == "outbound"
        db.execute("INSERT INTO messages (thread_id,direction,sender,recipient,body,sent_at,is_followup) "
                   "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                   (thread_id, m["direction"], "me" if out else contact_email, contact_email if out else "me",
                    m["body"], db._ts(m["sent_at"]), int(m.get("is_followup", False))))
    return thread_id


@pytest.fixture(scope="session")
def _schema(tmp_path_factory):
    """Build the test database once through db.reset() with the inline seed."""
    assert config.MYSQL["database"] == TEST_DB
    seed_file = tmp_path_factory.mktemp("seed") / "seed.json"
    seed_file.write_text(json.dumps(SEED), encoding="utf-8")
    db.reset(seed_file)
    return seed_file


@pytest.fixture
def seeded_db(_schema, monkeypatch):
    """Fresh copy of SEED for every test: wipe rows (cheaper than DROP/CREATE) and reload."""
    assert config.MYSQL["database"] == TEST_DB
    monkeypatch.setattr(config, "EMAIL_MODE", "mock")
    with db.cursor() as cur:
        for t in db.TABLES_DROP_ORDER:  # children first, so foreign keys are satisfied
            cur.execute(f"DELETE FROM {t}")
    db.load_seed(SEED)
    return db


@pytest.fixture
def now():
    return NOW
