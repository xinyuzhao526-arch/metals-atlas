from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request, Response, status
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User


password_hash = PasswordHash.recommended()
ALGORITHM = "HS256"
COOKIE_NAME = "atlas_session"
CSRF_COOKIE = "atlas_csrf"
REVOKED_SESSIONS: set[str] = set()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def issue_session(response: Response, user: User) -> str:
    settings = get_settings()
    csrf = token_urlsafe(24)
    payload = {
        "sub": user.id,
        "csrf": csrf,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    token = jwt.encode(payload, settings.session_secret, algorithm=ALGORITHM)
    common = {"secure": settings.session_cookie_secure, "samesite": "lax", "path": "/"}
    response.set_cookie(COOKIE_NAME, token, httponly=True, max_age=43200, **common)
    response.set_cookie(CSRF_COOKIE, csrf, httponly=False, max_age=43200, **common)
    return csrf


def revoke_session(session_token: str | None) -> None:
    if session_token:
        REVOKED_SESSIONS.add(sha256(session_token.encode()).hexdigest())


def clear_session(response: Response) -> None:
    settings = get_settings()
    common = {
        "secure": settings.session_cookie_secure,
        "samesite": "lax",
        "path": "/",
    }
    response.delete_cookie(COOKIE_NAME, httponly=True, **common)
    response.delete_cookie(CSRF_COOKIE, httponly=False, **common)


def current_user(
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if sha256(session_token.encode()).hexdigest() in REVOKED_SESSIONS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    try:
        payload = jwt.decode(session_token, get_settings().session_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user


def admin_write(
    request: Request,
    user: User = Depends(current_user),
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    csrf_cookie: str | None = Cookie(default=None, alias=CSRF_COOKIE),
    csrf_header: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> User:
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        try:
            payload = jwt.decode(session_token or "", get_settings().session_secret, algorithms=[ALGORITHM])
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail="Invalid session") from exc
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header or payload.get("csrf") != csrf_header:
            raise HTTPException(status_code=403, detail="CSRF validation failed")
    return user


def ensure_single_admin(db: Session, email: str, password: str) -> User:
    users = list(db.scalars(select(User)))
    if len(users) > 1:
        raise RuntimeError("Phase 1A supports exactly one administrator")
    user = users[0] if users else User(email=email.lower(), display_name="Administrator", password_hash="")
    user.email = email.lower()
    user.password_hash = hash_password(password)
    user.is_active = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
