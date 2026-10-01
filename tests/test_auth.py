"""Accounts, password hashing, sessions, lockout and roles."""
from datetime import timedelta

import pytest

from followup import auth, db

# Test-only values for this local app.
PW = "demo-pass-123"


@pytest.fixture
def users(seeded_db):
    with db.cursor() as cur:
        cur.execute("DELETE FROM sessions")
        cur.execute("DELETE FROM users")
    return auth


def test_hash_is_salted_and_verifies():
    a, b = auth.hash_password(PW), auth.hash_password(PW)
    assert a != b and a.startswith("scrypt$")
    assert auth.verify_password(PW, a)
    assert not auth.verify_password("wrong-pass-1", a)
    assert not auth.verify_password(PW, "garbage")


def test_first_user_is_admin_then_members(users):
    assert not auth.has_users()
    first = auth.register("Owner@Example.com", "Owner", PW)
    second = auth.register("staff@example.com", "Staff", PW, role="admin")
    assert first["role"] == "admin" and first["email"] == "owner@example.com"
    assert second["role"] == "admin"  # explicit role honoured after the first
    third = auth.register("x@example.com", "X", PW)
    assert third["role"] == "member"
    assert "password_hash" not in first


@pytest.mark.parametrize("email,name,pw,msg", [
    ("bad-email", "N", PW, "valid email"),
    ("a@b.co", "", PW, "name"),
    ("a@b.co", "N", "short1", "at least"),
    ("a@b.co", "N", "lettersonly", "mix"),
    ("a@b.co", "N", "1234567890", "mix"),
])
def test_register_validation(users, email, name, pw, msg):
    with pytest.raises(auth.AuthError, match=msg):
        auth.register(email, name, pw)


def test_duplicate_email_rejected(users):
    auth.register("a@example.com", "A", PW)
    with pytest.raises(auth.AuthError, match="already exists"):
        auth.register("A@EXAMPLE.COM", "A2", PW)


def test_login_session_and_logout(users):
    auth.register("a@example.com", "A", PW)
    user, token = auth.login("a@example.com", PW)
    assert auth.get_user(token)["id"] == user["id"]
    # only the hash of the token is stored
    assert not db.one("SELECT 1 x FROM sessions WHERE token_hash=%s", (token,))
    auth.logout(token)
    assert auth.get_user(token) is None
    assert auth.get_user(None) is None and auth.get_user("nope") is None


def test_wrong_password_and_unknown_email_same_message(users):
    auth.register("a@example.com", "A", PW)
    with pytest.raises(auth.AuthError) as e1:
        auth.login("a@example.com", "wrong-pass-1")
    with pytest.raises(auth.AuthError) as e2:
        auth.login("nobody@example.com", "wrong-pass-1")
    assert str(e1.value) == str(e2.value) == auth.LOGIN_FAILED


def test_lockout_after_max_failures(users):
    auth.register("a@example.com", "A", PW)
    for _ in range(auth.MAX_FAILED - 1):
        with pytest.raises(auth.AuthError, match="Incorrect"):
            auth.login("a@example.com", "wrong-pass-1")
    with pytest.raises(auth.AuthError, match="locked"):
        auth.login("a@example.com", "wrong-pass-1")
    with pytest.raises(auth.AuthError, match="Try again"):
        auth.login("a@example.com", PW)  # even the right password is refused while locked
    db.execute("UPDATE users SET locked_until=%s", (auth._utcnow() - timedelta(minutes=1),))
    assert auth.login("a@example.com", PW)[0]["email"] == "a@example.com"


def test_expired_session_rejected(users):
    auth.register("a@example.com", "A", PW)
    _, token = auth.login("a@example.com", PW)
    db.execute("UPDATE sessions SET expires_at=%s", (auth._utcnow() - timedelta(seconds=1),))
    assert auth.get_user(token) is None


def test_change_password_revokes_sessions(users):
    u = auth.register("a@example.com", "A", PW)
    _, token = auth.login("a@example.com", PW)
    with pytest.raises(auth.AuthError, match="incorrect"):
        auth.change_password(u["id"], "wrong-pass-1", "new-pass-456")
    auth.change_password(u["id"], PW, "new-pass-456")
    assert auth.get_user(token) is None
    with pytest.raises(auth.AuthError):
        auth.login("a@example.com", PW)
    assert auth.login("a@example.com", "new-pass-456")


def test_admin_controls(users):
    admin = auth.register("admin@example.com", "Admin", PW)
    member = auth.register("m@example.com", "Member", PW)
    with pytest.raises(auth.AuthError, match="Only an admin"):
        auth.set_role(member, admin["id"], "member")
    with pytest.raises(auth.AuthError, match="own admin"):
        auth.set_role(admin, admin["id"], "member")
    with pytest.raises(auth.AuthError, match="own account"):
        auth.set_active(admin, admin["id"], False)

    _, token = auth.login("m@example.com", PW)
    auth.set_active(admin, member["id"], False)
    assert auth.get_user(token) is None
    with pytest.raises(auth.AuthError, match="disabled"):
        auth.login("m@example.com", PW)
    auth.set_role(admin, member["id"], "admin")
    assert {u["email"]: u["role"] for u in auth.list_users()}["m@example.com"] == "admin"


def test_demo_reset_keeps_accounts(users):
    auth.register("a@example.com", "A", PW)
    assert "users" not in db.TABLES_DROP_ORDER and "sessions" not in db.TABLES_DROP_ORDER
