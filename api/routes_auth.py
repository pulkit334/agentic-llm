"""Sign-in: account status, register, login, logout and the current user.

The session token is set as an HttpOnly, SameSite=Lax cookie that lives as long as the
server-side session (auth.SESSION_HOURS). All checks (password policy, lockout, roles)
stay in followup.auth; this module only maps them onto HTTP.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from followup import auth

from .deps import COOKIE_NAME, current_user, public_user, session_token

router = APIRouter(prefix="/api")

SESSION_MAX_AGE = auth.SESSION_HOURS * 3600
_COOKIE_ATTRS = {"path": "/", "httponly": True, "samesite": "lax", "secure": False}


class RegisterRequest(BaseModel):
    name: str = Field(max_length=255)
    email: str = Field(max_length=255)
    password: str = Field(max_length=1024)


class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=1024)


def _start_session(request: Request, response: Response, token: str):
    """Set the session cookie, revoking any other session this browser was holding."""
    old = session_token(request)
    if old and old != token:
        auth.logout(old)
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_MAX_AGE, **_COOKIE_ATTRS)


@router.get("/auth/status")
def auth_status():
    """Whether any account exists yet (the UI shows 'create the first account' when not)."""
    return {"has_users": auth.has_users()}


@router.post("/auth/register")
def register(body: RegisterRequest, request: Request, response: Response):
    """Create an account and sign it in. The first account ever created becomes admin."""
    try:
        user = auth.register(body.email, body.name, body.password)
    except auth.AuthError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    _start_session(request, response, auth.create_session(user["id"]))
    return {"user": public_user(user)}


@router.post("/auth/login")
def login(body: LoginRequest, request: Request, response: Response):
    try:
        user, token = auth.login(body.email, body.password)
    except auth.AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    _start_session(request, response, token)
    return {"user": public_user(user)}


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request):
    """Revoke the session (if any) and clear the cookie. Works even when already signed out."""
    auth.logout(session_token(request))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE_NAME, **_COOKIE_ATTRS)
    return response


@router.get("/auth/me")
def me(user: dict = Depends(current_user)):
    return {"user": user}
