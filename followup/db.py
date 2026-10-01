"""MySQL storage: contacts, threads, messages, follow-ups, outbox, action log, clock.

All datetimes are stored as naive UTC.
"""
import json
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

from . import config

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS contacts (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type ENUM('customer','student','employee','business') NOT NULL,
        company VARCHAR(255),
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
        notes TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS threads (
        id VARCHAR(64) PRIMARY KEY,
        subject VARCHAR(500) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        status ENUM('open','closed') NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL,
        FOREIGN KEY (contact_email) REFERENCES contacts(email)
    )""",
    """CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        thread_id VARCHAR(64) NOT NULL,
        direction ENUM('inbound','outbound') NOT NULL,
        sender VARCHAR(255) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        sent_at DATETIME NOT NULL,
        is_followup TINYINT(1) NOT NULL DEFAULT 0,
        FOREIGN KEY (thread_id) REFERENCES threads(id)
    )""",
    """CREATE TABLE IF NOT EXISTS followups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        thread_id VARCHAR(64) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        send_at DATETIME NOT NULL,
        status ENUM('pending','sent','cancelled') NOT NULL DEFAULT 'pending',
        strategy VARCHAR(64),
        reason TEXT,
        created_at DATETIME NOT NULL,
        done_at DATETIME,
        FOREIGN KEY (thread_id) REFERENCES threads(id)
    )""",
    """CREATE TABLE IF NOT EXISTS outbox (
        id INT AUTO_INCREMENT PRIMARY KEY,
        thread_id VARCHAR(64),
        to_email VARCHAR(255) NOT NULL,
        delivered_to VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        provider VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL,
        error TEXT,
        sent_at DATETIME NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS action_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ts DATETIME NOT NULL,
        run_id VARCHAR(32),
        thread_id VARCHAR(64),
        action VARCHAR(64) NOT NULL,
        details TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS settings (
        k VARCHAR(64) PRIMARY KEY,
        v VARCHAR(255) NOT NULL
    )""",
    # Accounts (see auth.py). Not in TABLES_DROP_ORDER: resetting demo data keeps users.
    """CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','member') NOT NULL DEFAULT 'member',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        failed_logins INT NOT NULL DEFAULT 0,
        locked_until DATETIME NULL,
        created_at DATETIME NOT NULL,
        last_login_at DATETIME NULL
    )""",
    """CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )""",
]

TABLES_DROP_ORDER = ["action_log", "outbox", "followups", "messages", "threads", "contacts", "settings"]


def _connect(with_db=True):
    cfg = dict(config.MYSQL)
    if not with_db:
        cfg.pop("database")
    return pymysql.connect(**cfg, cursorclass=DictCursor, autocommit=True, charset="utf8mb4")


class ConnectionPool:
    """Thread-safe pool of autocommit connections.

    Opening a MySQL connection costs ~40 ms on Windows, and every query used to
    open one. A pooled connection is borrowed by one thread at a time, pinged
    (a dead one is replaced) and returned afterwards; at most max_idle
    are kept open. Connections are tagged with the factory that made them, so a
    swapped db._connect (tests) never receives a stale connection.
    """

    def __init__(self, max_idle=8):
        self.max_idle = max_idle
        self._idle = []  # [(factory, conn)]
        self._lock = threading.Lock()
        self.created = 0
        self.reused = 0

    def acquire(self):
        factory = _connect
        while True:
            with self._lock:
                if not self._idle:
                    break
                made_by, conn = self._idle.pop()
            if made_by is not factory:
                _close_quietly(conn)
                continue
            try:
                conn.ping(reconnect=False)  # dead -> dropped below, a fresh one is made
            except Exception:
                _close_quietly(conn)
                continue
            self.reused += 1
            return factory, conn
        self.created += 1
        return factory, factory()

    def release(self, factory, conn, broken=False):
        if not broken:
            with self._lock:
                if len(self._idle) < self.max_idle:
                    self._idle.append((factory, conn))
                    return
        _close_quietly(conn)

    def close_all(self):
        with self._lock:
            idle, self._idle = self._idle, []
        for _, conn in idle:
            _close_quietly(conn)

    def stats(self):
        with self._lock:
            return {"idle": len(self._idle), "max_idle": self.max_idle,
                    "created": self.created, "reused": self.reused}


def _close_quietly(conn):
    try:
        conn.close()
    except Exception:
        pass


pool = ConnectionPool(max_idle=int(config.MYSQL_POOL_SIZE))


@contextmanager
def cursor():
    factory, conn = pool.acquire()
    broken = False
    try:
        with conn.cursor() as cur:
            yield cur
    except pymysql.err.OperationalError:
        broken = True  # lost connection etc. - don't hand it to the next caller
        raise
    finally:
        pool.release(factory, conn, broken)


def query(sql, args=None):
    with cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchall()


def one(sql, args=None):
    rows = query(sql, args)
    return rows[0] if rows else None


def execute(sql, args=None):
    with cursor() as cur:
        cur.execute(sql, args)
        return cur.lastrowid


def init_schema():
    conn = _connect(with_db=False)
    with conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{config.MYSQL['database']}` CHARACTER SET utf8mb4")
    conn.close()
    with cursor() as cur:
        for stmt in SCHEMA:
            cur.execute(stmt)


def reset(seed_file=None):
    """Drop everything, recreate tables and load demo data."""
    init_schema()
    with cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS=0")
        for t in TABLES_DROP_ORDER:
            cur.execute(f"DROP TABLE IF EXISTS {t}")
        cur.execute("SET FOREIGN_KEY_CHECKS=1")
    init_schema()
    seed_file = seed_file or Path(__file__).resolve().parent.parent / "seed.json"
    load_seed(json.loads(Path(seed_file).read_text(encoding="utf-8")))


def _ts(s):
    return datetime.fromisoformat(s.replace("Z", ""))


def load_seed(data):
    set_setting("clock", data["clock"])
    for c in data["contacts"]:
        execute(
            "INSERT INTO contacts (email,name,type,company,timezone,notes) VALUES (%s,%s,%s,%s,%s,%s)",
            (c["email"], c["name"], c["type"], c.get("company"), c.get("timezone", "Asia/Kolkata"), c.get("notes")),
        )
    for t in data["threads"]:
        execute(
            "INSERT INTO threads (id,subject,contact_email,status,created_at) VALUES (%s,%s,%s,%s,%s)",
            (t["id"], t["subject"], t["contact_email"], t.get("status", "open"), _ts(t["messages"][0]["sent_at"])),
        )
        for m in t["messages"]:
            outbound = m["direction"] == "outbound"
            execute(
                "INSERT INTO messages (thread_id,direction,sender,recipient,body,sent_at,is_followup) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (
                    t["id"], m["direction"],
                    "me" if outbound else t["contact_email"],
                    t["contact_email"] if outbound else "me",
                    m["body"], _ts(m["sent_at"]), int(m.get("is_followup", False)),
                ),
            )
        for f in t.get("followups", []):
            execute(
                "INSERT INTO followups (thread_id,contact_email,subject,body,send_at,status,strategy,reason,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (t["id"], t["contact_email"], f["subject"], f["body"], _ts(f["send_at"]), f.get("status", "pending"),
                 f.get("strategy"), f.get("reason"), _ts(f["created_at"])),
            )


def get_setting(k, default=None):
    row = one("SELECT v FROM settings WHERE k=%s", (k,))
    return row["v"] if row else default


def set_setting(k, v):
    execute("INSERT INTO settings (k,v) VALUES (%s,%s) ON DUPLICATE KEY UPDATE v=VALUES(v)", (k, str(v)))


def log_action(action, thread_id=None, details=None, run_id=None, ts=None):
    from .clock import now
    execute(
        "INSERT INTO action_log (ts,run_id,thread_id,action,details) VALUES (%s,%s,%s,%s,%s)",
        (ts or now(), run_id, thread_id, action, json.dumps(details, default=str) if details is not None else None),
    )
