from logging import getLogger
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Field, SQLModel, Session, delete, select

from ..models import (
    ResponseSafeUser,
    RequestSafeUser,
    User,
    Permission,
    Permissions,
    UserSession,
    Calling,
    UserCalling
)
from ..db import get_session
from ..utils import (
    CallingUser,
    user_has_permission,
    hash_password,
    validate_unique_field,
    verify_password
)


logger = getLogger("aplication")

router = APIRouter(prefix="/users", tags=["user management"])

def can_manage_user_or_throw(
    target_user_id: int,
    current_user: User,
    session: Session
    ) -> None:
    """
    Dependency to check if the current user can manage the target user.
    Raises HTTPException if not permitted.
    """
    if current_user.id == target_user_id:
        return # Users can always manage themselves

    if not user_has_permission(current_user, Permission.MANAGE_USERS, session):
        raise HTTPException(status_code=403, detail="Insufficient permissions to manage users.")
@router.get("/")
def list_users(
    session: Session = Depends(get_session),
    calling_user: Optional[User] = Depends(CallingUser(allow_anonymous=True))
    ):
    """
    Lists "all" users in the system.

    If the caller is authenticated, returns all users.
    If not authenticated, returns public users only.
    """
    if calling_user is None:
        # Anonymous user, limit to public users only
        # Select all users who have at least one public calling
        statement = (
            select(User)
            .join(UserCalling)
            .join(Calling)
            .where(Calling.is_public == True)
            .distinct()
        )
    else:
        # Authenticated user, return all users
        statement = select(User)
    users = session.exec(statement).all()
    return [ResponseSafeUser.from_user(user) for user in users]

@router.get("/{user_id}")
def get_user(
    user_id:int,
    session: Session = Depends(get_session),
    calling_user: Optional[User] = Depends(CallingUser(allow_anonymous=True))
    ):
    user = session.exec(
        select(User).where(User.id == user_id)
    ).first()
    logger.debug(f"Calling User: {calling_user}")
    logger.debug(f"Calling Count: {len(calling_user.callings) if calling_user else 'N/A'}")
    logger.debug(f"User Callings: {[c.calling.name for c in calling_user.callings] if calling_user else 'N/A'}")
    if user is None or (calling_user is None and not any(c.calling.is_public for c in user.callings)):
        raise HTTPException(status_code=404, detail="User not found")
    
    return ResponseSafeUser.from_user(user)

@router.put("/{user_id}")
def update_user(
    user_id: int,
    user_update: RequestSafeUser,
    session: Session = Depends(get_session),
    calling_user: User = Depends(CallingUser())
):
    # Check permissions
    can_manage_user_or_throw(user_id, calling_user, session)

    # Fetch existing user
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found.")
    if db_user.active and not user_update.active:
        # ensure that user is not the last active user
        active_users_count = session.exec(select(User).where(User.active == True)).count()
        if active_users_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last active user.")
        
    if user_update.email != db_user.email:
        # Ensure email is unique
        validate_unique_field(
            session,
            User,
            "email",
            user_update.email,
            exclude_id=user_id
        )
        
    if user_update.phone is not None and user_update.phone != db_user.phone:
        # Ensure phone is unique
        validate_unique_field(
            session,
            User,
            "phone",
            user_update.phone,
            exclude_id=user_id
        )

    # Update fields
    for field, value in user_update.model_dump(exclude_unset=True).items():
        setattr(db_user, field, value)

    session.add(db_user)
    session.commit()
    session.refresh(db_user)

    return ResponseSafeUser.from_user(db_user)

class PasswordUpdateRequest(SQLModel):
    new_password: str = Field(min_length=8)
    old_password: Optional[str] = None
@router.patch("/{user_id}/password")
def update_user_password(
    user_id: int,
    data: PasswordUpdateRequest,
    session: Session = Depends(get_session),
    calling_user: User = Depends(CallingUser(allow_unchanged_password=True, require_fresh=True))
):
    # Check permissions
    can_manage_user_or_throw(user_id, calling_user, session)
    is_self = calling_user.id == user_id
    if not is_self and calling_user.force_password_reset:
        raise HTTPException(status_code=403, detail="Password reset required.")

    # Fetch existing user
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    if is_self:
        # Verify old password
        if not data.old_password or not verify_password(data.old_password, db_user.password_hash):
            raise HTTPException(status_code=400, detail="Incorrect current password.")
    
    # Update password
    db_user.password_hash = hash_password(data.new_password)
    db_user.force_password_reset = not is_self  # If self-reset, clear the flag

    # Let's also clear all existing sessions for this user
    session.add(db_user)
    session.exec(
        delete(UserSession).where(UserSession.user_id == user_id)
    )
    session.commit()
    session.refresh(db_user)

    return {"detail": "Password updated successfully."}
    
@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    calling_user: User = Depends(CallingUser())
):
    # Check permissions
    can_manage_user_or_throw(user_id, calling_user, session)
    # Do not delete last user
    total_users = session.exec(select(User)).count()
    if total_users <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last user in the system.")
    # Fetch existing user
    db_user = session.get(User, user_id)

    # Cascade delete permissions
    if db_user:
        session.exec(
            delete(Permissions).where(
            Permissions.foreign_id == str(user_id),
            Permissions.is_calling == False
            )
        )
        session.delete(db_user)
        session.commit()
    return None

class UserCreateRequest(RequestSafeUser):
    password: str
@router.post("/")
def create_user(
    user: UserCreateRequest,
    session: Session = Depends(get_session),
    _: User = Depends(CallingUser(permissions=[Permission.MANAGE_USERS]))
    ):
    # Ensure email is unique
    validate_unique_field(
        session,
        User,
        "email",
        user.email
    )
    # Ensure phone is unique
    validate_unique_field(
        session,
        User,
        "phone",
        user.phone
    )
    # Clean passed values
    user.force_password_reset = True

    # Create user
    db_user = User.from_request_safe_user(user, hash_password(user.password))
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return ResponseSafeUser.from_user(db_user)

