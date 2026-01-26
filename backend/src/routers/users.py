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
    UserSession
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

@router.get("/{user_id}")
def get_user(
    user_id:int,
    session: Session = Depends(get_session)
    ):
    user = session.exec(
        select(User).where(User.id == user_id)
    ).first()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")


    # TODO: How should we limit access to users?
    # Should anyone be able to see anyone?
    
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

    # Fetch existing user
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    # Cascade delete permissions
    session.exec(
        delete(Permissions).where(
        Permissions.foreign_id == str(user_id),
        Permissions.is_calling == False
        )
    )
    session.delete(db_user)
    session.commit()
    return {"detail": "User deleted successfully."}

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

