import os
import jwt
from passlib.context import CryptContext
from datetime import timedelta, datetime, timezone
from sqlmodel import Session, select
from fastapi import Depends, HTTPException, status, Cookie
from fastapi.security import OAuth2PasswordBearer
from ..db import get_session
from ..models import User, APISafeUser, UserSession


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if SECRET_KEY is None:
    raise ValueError("JWT_SECRET_KEY environment variable must be set for security purposes.")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

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

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    session: Session = Depends(get_session)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401)
    
    user = session.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(status_code=401)
    return user

async def get_current_api_safe_user(
        user: User = Depends(get_current_user)
):
    return APISafeUser.from_user(user)

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