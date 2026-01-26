import secrets
import os
from fastapi import APIRouter, Depends, HTTPException, Response, Request, Cookie
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select, SQLModel, Field, delete
from datetime import timedelta, datetime, timezone
from logging import getLogger
from ..models import User, ResponseSafeUser, UserSession
from ..utils import (
    CallingUser,
    verify_password, 
    create_access_token,
    hash_password,
    get_current_user_session,
    format_datetime_http
                    )
from ..db import get_session

logger = getLogger("application")

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Simple endpoint to get current user info
@router.get("/me")
def read_own_data(
    current_user: ResponseSafeUser = Depends(CallingUser(
        api_safe=True,
        allow_unchanged_password=True
        ))
    ):
    return current_user

@router.post("/login")
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session)
):
    # Find user by email
    user = session.exec(
        select(User).where(User.email == form_data.username)
    ).first()
    # Ensure user exists, user is active, and password is correct
    if not user or not user.active or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    
    # Create tokens
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "fresh": True
            },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    # Encode user id into refresh token for faster database operation on refresh
    refresh_token = f"{user.id}_{secrets.token_urlsafe(32)}"

    # Save refresh token to database
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    logger.debug(f"Expires at timezone:{expires_at.tzinfo}")
    db_session = UserSession(
        user_id=user.id,
        token_hash=hash_password(refresh_token),
        ip_address=request.client.host,
        user_agent=request.headers.get("User-Agent"),
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    )
    session.add(db_session)
    session.commit()

    # Set refresh token as HttpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        expires=format_datetime_http(db_session.expires_at),
        samesite="lax",
        secure=os.getenv("SSL_ENABLED", "true").lower() == "true"
    )

    return {"access_token": access_token, "token_type": "bearer", "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60}

@router.get("/refresh")
def refresh_token(
    request: Request,
    response: Response,
    userSession: UserSession = Depends(get_current_user_session),
    session: Session = Depends(get_session)
):
    user_id = userSession.user_id    
    # Create new access token
    access_token = create_access_token(
        data={
            "sub": str(user_id),
            "fresh":False
            },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # Update cookie with new refresh token
    new_refresh_token = f"{user_id}_{secrets.token_urlsafe(32)}"
    new_expires = userSession.expires_at.astimezone(timezone.utc) - datetime.now(timezone.utc)
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        max_age=new_expires.total_seconds(),
        expires=format_datetime_http(userSession.expires_at),
        samesite="lax",
        secure=os.getenv("SSL_ENABLED", "true").lower() == "true"
    )

    # Update session in database
    userSession.token_hash = hash_password(new_refresh_token)
    userSession.last_active_at = datetime.now(timezone.utc)
    userSession.ip_address = request.client.host
    userSession.user_agent = request.headers.get("User-Agent")
    session.add(userSession)
    session.commit()
    res_body = {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "error": None
    }

    return res_body
class LogoutRequest(SQLModel):
    all_devices: bool = Field(default=False)
@router.post("/logout")
def logout(response: Response,
           logout_request: LogoutRequest,
           userSession: UserSession = Depends(get_current_user_session),
           session: Session = Depends(get_session),
          ):
    if logout_request.all_devices:
        # Revoke all sessions for this user
        statement = delete(UserSession).where(UserSession.user_id == userSession.user_id)
        message = "Logged out from all devices."
    else:
        # Revoke only the current session
        statement = delete(UserSession).where(UserSession.id == userSession.id)
        message = "Logged out from current device."
    
    session.exec(statement)
    session.commit()

    # Clear the refresh token cookie
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        samesite="lax",
        secure=os.getenv("SSL_ENABLED", "true").lower() == "true"
    )

    return {"message":message}