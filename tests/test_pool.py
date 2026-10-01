"""Connection pool: reuse, thread safety, cap, and recovery from dead connections."""
import threading

import pymysql
import pytest
from pymysql.cursors import DictCursor

from followup import config, db


@pytest.fixture
def real_pool(seeded_db, monkeypatch):
    """A fresh pool over real per-call connections (the suite's shared one is single-threaded)."""
    def connect(with_db=True):
        cfg = dict(config.MYSQL)
        if not with_db:
            cfg.pop("database")
        return pymysql.connect(**cfg, cursorclass=DictCursor, autocommit=True, charset="utf8mb4")

    monkeypatch.setattr(db, "_connect", connect)
    pool = db.ConnectionPool(max_idle=3)
    monkeypatch.setattr(db, "pool", pool)
    yield pool
    pool.close_all()


def test_connections_are_reused(real_pool):
    for _ in range(20):
        assert db.one("SELECT 1 AS x")["x"] == 1
    s = real_pool.stats()
    assert s["created"] == 1
    assert s["reused"] == 19


def test_parallel_threads_never_share_a_connection(real_pool):
    errors, in_use, lock = [], set(), threading.Lock()

    def worker():
        try:
            for _ in range(25):
                with db.cursor() as cur:
                    cid = id(cur.connection)
                    with lock:
                        assert cid not in in_use, "connection borrowed twice at once"
                        in_use.add(cid)
                    cur.execute("SELECT SLEEP(0.001) AS s, CONNECTION_ID() AS c")
                    cur.fetchall()
                    with lock:
                        in_use.discard(cid)
        except Exception as e:  # surfaced below
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert real_pool.stats()["idle"] <= 3  # cap respected


def test_dead_connection_is_replaced(real_pool):
    db.one("SELECT 1")
    _, conn = real_pool._idle[0]
    conn.close()  # simulate MySQL dropping it
    assert db.one("SELECT 2 AS x")["x"] == 2


def test_swapped_factory_never_gets_stale_connection(real_pool, monkeypatch):
    db.one("SELECT 1")
    calls = []
    real = db._connect

    def other(with_db=True):
        calls.append(1)
        return real(with_db)

    monkeypatch.setattr(db, "_connect", other)
    db.one("SELECT 1")
    assert calls, "pool handed out a connection made by the old factory"
