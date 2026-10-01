"""User accounts, password hashing and login sessions.

- Passwords: scrypt (stdlib hashlib) with a random 16-byte salt per user,
  stored as "scrypt$n$r$p$salt_hex$hash_hex"; compared in constant time.
- Sessions: random 32-byte URL-safe token given to the client; only its
  SHA-256 is stored, so a leaked sessions table cannot be replayed.
- Brute force: after MAX_FAILED wrong passwords the account locks for
  LOCK_MINUTES. Unknown emails and wrong passwords return the same error.
- Roles: 'admin' (manage users, reset demo data, time travel) and 'member'.
  The first account created becomes admin.

Session expiry and lockout use real wall-clock UTC, not the simulated demo clock.
"""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from . import db

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2 ** 14, 8, 1
MIN_PASSWORD_LEN = 8
MAX_FAILED = 5
LOCK_MINUTES = 15
SESSION_HOURS = 12
ROLES = ("admin", "member")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

LOGIN_FAILED = "Incorrect email or password."


class AuthError(Exception):
    """Message is safe to show to the user."""


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


# ------------------------------------------------------------------ hashing

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_hex, hash_hex = stored.split("$")
        if algo != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex),
                                n=int(n), r=int(r), p=int(p), dklen=len(hash_hex) // 2)
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


# Spent on unknown emails so response time does not reveal which emails exist.
_DUMMY_HASH = hash_password(secrets.token_hex(8))


def validate_password(password: str):
    if len(password) < MIN_PASSWORD_LEN:
        raise AuthError(f"Password must be at least {MIN_PASSWORD_LEN} characters.")
    if password.isdigit() or password.isalpha():
        raise AuthError("Password must mix letters with numbers or symbols.")


def _public(user: dict) -> dict:
    return {k: user[k] for k in ("id", "email", "name", "role", "is_active", "created_at", "last_login_at")}


# ------------------------------------------------------------------ accounts

def has_users() -> bool:
    return bool(db.one("SELECT COUNT(*) n FROM users")["n"])


def _clean_password(password: str | None) -> str:
    """Drop leading/trailing whitespace (pasted passwords often carry a stray space or line break).
    Applied on register, login and change, so stored and typed passwords always compare the same way."""
    return (password or "").strip()


def register(email: str, name: str, password: str, role: str | None = None) -> dict:
    """Create an account. The very first account is always admin."""
    email = (email or "").strip().lower()
    name = (name or "").strip()
    password = _clean_password(password)
    if not EMAIL_RE.match(email):
        raise AuthError("Enter a valid email address.")
    if not name:
        raise AuthError("Enter your name.")
    validate_password(password)
    if db.one("SELECT id FROM users WHERE email=%s", (email,)):
        raise AuthError("An account with this email already exists.")
    role = "admin" if not has_users() else (role if role in ROLES else "member")
    uid = db.execute(
        "INSERT INTO users (email,name,password_hash,role,created_at) VALUES (%s,%s,%s,%s,%s)",
        (email, name, hash_password(password), role, _utcnow()),
    )
    db.log_action("user_registered", details={"user_id": uid, "email": email, "role": role})
    return _public(db.one("SELECT * FROM users WHERE id=%s", (uid,)))


def login(email: str, password: str) -> tuple[dict, str]:
    """Check credentials; return (user, session_token). Raises AuthError."""
    email = (email or "").strip().lower()
    password = _clean_password(password)
    user = db.one("SELECT * FROM users WHERE email=%s", (email,))
    now = _utcnow()
    if not user:
        verify_password(password or "", _DUMMY_HASH)
        db.log_action("login_failed", details={"email": email, "reason": "unknown email"})
        raise AuthError(LOGIN_FAILED)
    if not user["is_active"]:
        raise AuthError("This account is disabled. Ask an admin.")
    if user["locked_until"] and user["locked_until"] > now:
        mins = max(1, int((user["locked_until"] - now).total_seconds() // 60) + 1)
        raise AuthError(f"Too many failed attempts. Try again in {mins} minute(s).")
    if not verify_password(password or "", user["password_hash"]):
        failed = user["failed_logins"] + 1
        locked = now + timedelta(minutes=LOCK_MINUTES) if failed >= MAX_FAILED else None
        db.execute("UPDATE users SET failed_logins=%s, locked_until=%s WHERE id=%s",
                   (0 if locked else failed, locked, user["id"]))
        db.log_action("login_failed", details={"user_id": user["id"], "locked": bool(locked)})
        if locked:
            raise AuthError(f"Too many failed attempts. Account locked for {LOCK_MINUTES} minutes.")
        raise AuthError(LOGIN_FAILED)
    db.execute("UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=%s WHERE id=%s",
               (now, user["id"]))
    db.log_action("login_success", details={"user_id": user["id"]})
    return _public({**user, "last_login_at": now}), create_session(user["id"])


# ------------------------------------------------------------------ sessions

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user_id: int, hours: int = SESSION_HOURS) -> str:
    token = secrets.token_urlsafe(32)
    now = _utcnow()
    db.execute("INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (%s,%s,%s,%s)",
               (_token_hash(token), user_id, now, now + timedelta(hours=hours)))
    db.execute("DELETE FROM sessions WHERE expires_at < %s", (now,))  # housekeeping
    return token


def get_user(token: str | None) -> dict | None:
    """User for a valid, unexpired session token on an active account, else None."""
    if not token:
        return None
    row = db.one(
        "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id "
        "WHERE s.token_hash=%s AND s.expires_at > %s AND u.is_active=1",
        (_token_hash(token), _utcnow()),
    )
    return _public(row) if row else None


def logout(token: str | None):
    if token:
        db.execute("DELETE FROM sessions WHERE token_hash=%s", (_token_hash(token),))


def logout_everywhere(user_id: int):
    db.execute("DELETE FROM sessions WHERE user_id=%s", (user_id,))


def change_password(user_id: int, old_password: str, new_password: str):
    old_password, new_password = _clean_password(old_password), _clean_password(new_password)
    user = db.one("SELECT * FROM users WHERE id=%s", (user_id,))
    if not user or not verify_password(old_password, user["password_hash"]):
        raise AuthError("Current password is incorrect.")
    validate_password(new_password)
    db.execute("UPDATE users SET password_hash=%s WHERE id=%s", (hash_password(new_password), user_id))
    logout_everywhere(user_id)
    db.log_action("password_changed", details={"user_id": user_id})


# ------------------------------------------------------------------ admin

def require_role(user: dict | None, role: str = "admin"):
    if not user:
        raise AuthError("Please sign in.")
    if role == "admin" and user["role"] != "admin":
        raise AuthError("Only an admin can do this.")


def list_users() -> list[dict]:
    return [_public(u) for u in db.query("SELECT * FROM users ORDER BY created_at")]


def set_role(admin: dict, user_id: int, role: str):
    require_role(admin)
    if role not in ROLES:
        raise AuthError("Unknown role.")
    if user_id == admin["id"] and role != "admin":
        raise AuthError("You cannot remove your own admin role.")
    db.execute("UPDATE users SET role=%s WHERE id=%s", (role, user_id))
    db.log_action("user_role_changed", details={"by": admin["id"], "user_id": user_id, "role": role})


def set_active(admin: dict, user_id: int, active: bool):
    require_role(admin)
    if user_id == admin["id"]:
        raise AuthError("You cannot disable your own account.")
    db.execute("UPDATE users SET is_active=%s WHERE id=%s", (int(active), user_id))
    if not active:
        logout_everywhere(user_id)
    db.log_action("user_active_changed", details={"by": admin["id"], "user_id": user_id, "active": active})
