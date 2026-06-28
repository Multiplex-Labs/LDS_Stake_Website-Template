import os
from typing import List, Optional
import jwt
from passlib.context import CryptContext
from datetime import timedelta, datetime, timezone
from sqlmodel import Session, select
from fastapi import Depends, HTTPException, status, Cookie
from fastapi.security import OAuth2PasswordBearer

from .permissions import user_has_permission

from ..db import get_session
from ..models import User, ResponseSafeUser, UserSession, Permission, Permissions


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if SECRET_KEY is None:
    raise ValueError("JWT_SECRET_KEY environment variable must be set for security purposes.")

_KNOWN_BAD_JWT_KEYS = {
    "your_secret_key_here",
    "your-secret-key",
    "secret",
    "changeme",
    "password",
    "jwt_secret",
    "jwt-secret",
    "supersecret",
}

_MIN_JWT_KEY_LENGTH = 64

def _validate_jwt_secret(key: str) -> None:
    if key.lower() in _KNOWN_BAD_JWT_KEYS or len(key) < _MIN_JWT_KEY_LENGTH:
        raise ValueError(
            f"JWT_SECRET_KEY is too weak or uses a known placeholder value. "
            f"Generate a secure key with: openssl rand -hex 32 (produces {_MIN_JWT_KEY_LENGTH} characters)"
        )

_validate_jwt_secret(SECRET_KEY)

ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth/login", 
    auto_error=False, 
    refreshUrl="auth/refresh"
    )

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta) -> str:
    """Creates a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

class CallingUser:
    def __init__(
            self,
            require_fresh:bool = False,
            api_safe:bool = False,
            permissions:List[Permission] = [],
            allow_unchanged_password:bool = False,
            allow_anonymous:bool = False
            ):
        self.require_fresh = require_fresh
        self.api_safe_user = api_safe
        self.permissions = permissions
        self.allow_unchanged_password = allow_unchanged_password
        self.allow_anonymous = allow_anonymous


    async def __call__(
            self,
            token: Optional[str] = Depends(oauth2_scheme),
            session: Session = Depends(get_session)
    ) -> User|ResponseSafeUser:
        if token is None:
            if self.allow_anonymous:
                return None
            raise HTTPException(status_code=401)
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id: int = payload.get("sub")
            fresh: bool = payload.get("fresh", False)
            if user_id is None:
                raise HTTPException(status_code=401)
            if (self.require_fresh and not fresh):
                raise HTTPException(status_code=401, detail="Action requires fresh token. Reauthenticate.")

        except jwt.PyJWTError:
            raise HTTPException(status_code=401)
        
        user = session.get(User, user_id)
        if not user or not user.active:
            raise HTTPException(status_code=401)
        
        # Validate permissions if any are required
        if self.permissions and not user_has_permission(user, self.permissions, session):
                raise HTTPException(status_code=403, detail="Insufficient permissions.")
        # Do not allow users who must reset their password unless explicitly allowed
        if user.force_password_reset and not self.allow_unchanged_password:
            raise HTTPException(status_code=403, detail="Password reset required.")
        if self.api_safe_user:
            return ResponseSafeUser.from_user(user)
        else:
            return user

async def get_current_user_session(
    refresh_token: str = Cookie(default=None),
    session: Session = Depends(get_session)
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")
    id_str, _ = refresh_token.split('_', 1)
    # Find session by matching token hash
    db_session = session.exec(
        select(UserSession).where(UserSession.user_id == id_str, UserSession.expires_at > datetime.now(timezone.utc))
    ).all()
    
    matched_session = None
    for s in db_session:
        if verify_password(refresh_token, s.token_hash):
            matched_session = s
            break

    if not matched_session:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")
    
    user = session.get(User, matched_session.user_id)
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    return matched_session

