"""Shared request dependencies: who is signed in, and whether they are an admin.

The session token travels in the HttpOnly cookie COOKIE_NAME and is checked against
followup.auth on every request (sessions are stored hashed in MySQL).
"""
from fastapi import Depends, HTTPException, Request, status

from followup import auth

COOKIE_NAME = "fu_session"

NOT_SIGNED_IN = "Please sign in."
ADMIN_ONLY = "Only an admin can do this."


def public_user(user: dict) -> dict:
    """The User shape the API exposes: {id, email, name, role}."""
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


def session_token(request: Request) -> str | None:
    return request.cookies.get(COOKIE_NAME) or None


def current_user(request: Request) -> dict:
    """The signed-in User; 401 when the cookie is missing, expired or revoked."""
    user = auth.get_user(session_token(request))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, NOT_SIGNED_IN)
    return public_user(user)


def admin_user(user: dict = Depends(current_user)) -> dict:
    """The signed-in User if they are an admin; 403 otherwise."""
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, ADMIN_ONLY)
    return user
