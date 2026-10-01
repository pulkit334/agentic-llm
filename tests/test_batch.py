"""Parallel batch runs: every open thread gets exactly one decision, no duplicates."""
import json
from pathlib import Path

import pymysql
import pytest
from pymysql.cursors import DictCursor

from followup import batch, config, db

SEED_JSON = Path(__file__).resolve().parent.parent / "seed.json"


@pytest.fixture
def seeded(seeded_db, monkeypatch):
    """Real seed.json with one fresh connection per query: the suite's shared
    connection is not thread-safe, and batch runs agents on worker threads."""
    def connect(with_db=True):
        cfg = dict(config.MYSQL)
        if not with_db:
            cfg.pop("database")
        return pymysql.connect(**cfg, cursorclass=DictCursor, autocommit=True, charset="utf8mb4")

    monkeypatch.setattr(db, "_connect", connect)
    with db.cursor() as cur:
        for t in db.TABLES_DROP_ORDER:
            cur.execute(f"DELETE FROM {t}")
    db.load_seed(json.loads(SEED_JSON.read_text(encoding="utf-8")))
    return db


def test_batch_runs_all_open_threads_in_parallel(seeded):
    ids = batch.open_thread_ids()
    seen = []
    out = batch.run_all(ids, mode="rules", workers=4, on_event=lambda tid, e: seen.append(tid))

    assert not out["errors"]
    assert set(out["results"]) == set(ids)
    assert all(r["decision"] for r in out["results"].values())
    assert set(seen) <= set(ids)
    # at most one pending follow-up per thread even with concurrent runs
    rows = db.query("SELECT thread_id, COUNT(*) n FROM followups WHERE status='pending' GROUP BY thread_id")
    assert all(r["n"] == 1 for r in rows)


def test_batch_reports_errors_without_stopping(seeded, monkeypatch):
    from followup import agent

    real_run = agent.run

    def flaky(thread_id=None, **kw):
        if thread_id == "quote-rahul":
            raise RuntimeError("boom")
        return real_run(thread_id=thread_id, **kw)

    monkeypatch.setattr(agent, "run", flaky)
    db.execute("INSERT INTO threads (id,subject,contact_email,status,created_at) "
               "SELECT 'quote-rahul-2', CONCAT(subject,' (2)'), contact_email, status, created_at FROM threads WHERE id='quote-rahul'")
    db.execute("INSERT INTO messages (thread_id,direction,sender,recipient,body,sent_at,is_followup) "
               "SELECT 'quote-rahul-2',direction,sender,recipient,body,sent_at,is_followup FROM messages WHERE thread_id='quote-rahul'")
    out = batch.run_all(["quote-rahul", "quote-rahul-2"], mode="rules", workers=2)
    assert "quote-rahul" in out["errors"]
    assert "quote-rahul-2" in out["results"]
