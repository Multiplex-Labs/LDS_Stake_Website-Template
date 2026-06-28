import os
import re
import time
import secrets
import mimetypes

from logging import getLogger
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import field_validator
from sqlmodel import Field, SQLModel, Session, delete, func, select


from ..models import (
    ResponseSafeUser,
    RequestSafeUser,
    User,
    Permission,
    Permissions,
    PermissionsResponse,
    PermissionsUpdateRequest,
    UserSession,
    Calling,
    UserCalling
)
from ..db import get_session
from ..utils import (
    CallingUser,
    user_has_permission,
    get_user_effective_permissions,
    build_permissions_response,
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
    if current_user.id == target_user_id:
        return
    if not user_has_permission(current_user, Permission.MANAGE_USERS, session):
        raise HTTPException(status_code=403, detail="Insufficient permissions to manage users.")

def _assert_not_last_active_user(user_id: int, session: Session, action: str = "remove") -> None:
    count = session.exec(select(func.count(User.id)).where(User.active == True)).one()
    if count <= 1:
        raise HTTPException(status_code=400, detail=f"Cannot {action} the last active user.")
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
        if user_id == calling_user.id:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own account.")
        _assert_not_last_active_user(user_id, session, action="deactivate")
        
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

    for field, value in user_update.model_dump(exclude_unset=True).items():
        setattr(db_user, field, value)

    session.add(db_user)
    session.commit()
    session.refresh(db_user)

    return ResponseSafeUser.from_user(db_user)


def _check_password_complexity(v: str) -> str:
    errors = []
    if not any(c.isupper() for c in v):
        errors.append("one uppercase letter")
    if not any(c.isdigit() for c in v):
        errors.append("one digit")
    if not re.search(r"[^a-zA-Z0-9]", v):
        errors.append("one special character")
    if errors:
        raise ValueError(f"Password must contain at least: {', '.join(errors)}")
    return v


class PasswordUpdateRequest(SQLModel):
    new_password: str = Field(min_length=8, max_length=128)
    old_password: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


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

    # Invalidate all active sessions so the old password cannot be used
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
    can_manage_user_or_throw(user_id, calling_user, session)
    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user_id == calling_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    _assert_not_last_active_user(user_id, session, action="delete")
    session.exec(
        delete(Permissions).where(
            Permissions.foreign_id == str(user_id),
            Permissions.is_calling == False
        )
    )
    session.delete(db_user)
    session.commit()
    return None


@router.get("/{user_id}/permissions")
def get_user_permissions(
    user_id: int,
    session: Session = Depends(get_session),
    calling_user: User = Depends(CallingUser())
) -> PermissionsResponse:
    can_manage_user_or_throw(user_id, calling_user, session)

    row = session.exec(
        select(Permissions).where(
            Permissions.foreign_id == str(user_id),
            Permissions.is_calling == False
        )
    ).first()

    if row is None:
        return PermissionsResponse(scopes=0, flags=[])

    return build_permissions_response(row.scopes)


@router.put("/{user_id}/permissions")
def update_user_permissions(
    user_id: int,
    data: PermissionsUpdateRequest,
    session: Session = Depends(get_session),
    calling_user: User = Depends(CallingUser())
) -> PermissionsResponse:
    if not user_has_permission(calling_user, Permission.MANAGE_USERS, session):
        raise HTTPException(status_code=403, detail="Insufficient permissions to manage users.")

    db_user = session.get(User, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found.")

    clean_scopes = data.scopes & get_user_effective_permissions(calling_user, session)

    row = session.exec(
        select(Permissions).where(
            Permissions.foreign_id == str(user_id),
            Permissions.is_calling == False
        )
    ).first()

    if row is None:
        row = Permissions(
            foreign_id=str(user_id),
            is_calling=False,
            scopes=clean_scopes
        )
    else:
        row.scopes = clean_scopes

    session.add(row)
    session.commit()
    session.refresh(row)

    return build_permissions_response(row.scopes)


class DiscordUserEmailResponse(SQLModel):
    email: str
    callings: List[str]
    name: str

@router.get("/email/{email}")
def get_user_by_email(
    email: str,
    session: Session = Depends(get_session),
    _: User = Depends(CallingUser())
):
    user = DiscordUserEmailResponse(
        email=email,
        callings=[],
        name=""
    )
    db_user = session.exec(select(User).where(User.email == email)).first()
    if not db_user:
        logger.warning(f"get_user_by_email: No user found with email {email}")
        raise HTTPException(status_code=404, detail=f"User {email} not found.")
    callings = [uc.calling.name for uc in db_user.callings]
    user.callings = callings
    user.name = db_user.fname + " " + db_user.lname
    return user


class UserCreateRequest(RequestSafeUser):
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


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

@router.post("/photo")
async def upload_user_photo(
    file: UploadFile = File(...),
    user_id: int | None = Query(default=None),
    current_user: User = Depends(CallingUser()),
    session: Session = Depends(get_session),
):
    """
    Endpoint to upload a photo for a user.

    Accepts a single image file upload, validates the content-type, saves the
    file under the backend static/profile_images directory and updates the
    user's `profile_image` to the proxied URL (`/api/static/profile_images/<file>`).

    If `user_id` is provided, uploads for that user (requires MANAGE_USERS permission
    unless uploading for self). If omitted, uploads for the authenticated user.
    """
    target_id = user_id or current_user.id
    can_manage_user_or_throw(target_id, current_user, session)

    # Basic validation
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    # Determine extension
    _, ext = os.path.splitext(file.filename or "")
    if not ext:
        ext = mimetypes.guess_extension(file.content_type) or ".bin"
    if ext.lower() not in [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"]:
        raise HTTPException(status_code=400, detail="Unsupported image format.")

    # Storage directory (mirror of app mount)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "static", "profile_images"))
    os.makedirs(base_dir, exist_ok=True)

    # Unique filename
    fname = f"{target_id}_{int(time.time())}_{secrets.token_hex(8)}{ext}"
    dest_path = os.path.join(base_dir, fname)

    # Save file
    contents = await file.read()

    # Ensure file size is reasonable (e.g. <5MB)
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 5MB limit.")
    try:
        with open(dest_path, "wb") as fh:
            fh.write(contents)
    except OSError:
        raise HTTPException(status_code=500, detail="Failed to save uploaded file.")

    # Update user profile_image to a proxied path so frontend can request via /api
    public_path = f"/api/static/profile_images/{fname}"
    db_user = session.get(User, target_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    db_user.profile_image = public_path
    session.add(db_user)
    session.commit()
    session.refresh(db_user)

    return ResponseSafeUser.from_user(db_user)
    
