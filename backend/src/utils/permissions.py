from typing import List
from sqlmodel import Session, col, select
from ..models import Permissions, Permission, PermissionsResponse, User

def build_permissions_response(stored_scopes: int) -> PermissionsResponse:
    flags = [
        perm.name
        for perm in Permission
        if perm is not Permission.DISCORD_BOT and (stored_scopes & perm)
    ]
    return PermissionsResponse(scopes=stored_scopes, flags=flags)


def user_has_permission(
        user: User,
        permissions: List[Permission]|Permission,
        session: Session
    ) -> bool:
    """Check if a user has a specific permission."""

    # Combine required permissions into a single mask
    required_permissions = Permission.NONE
    if isinstance(permissions, Permission):
        permissions = [permissions]
    elif not isinstance(permissions, list):
        raise ValueError("permissions must be a Permission or a list of Permissions")
    for perm in permissions:
        required_permissions |= perm

    # Gather all relevant Permissions objects
    callings = [str(calling.calling_id) for calling in user.callings]
    if not callings:
        callings = ["-1"]  # Dummy value to prevent SQL errors
    permissions_objects = session.exec(
        select(Permissions).where(
           # User-Specific Permissions:
            (
                (Permissions.foreign_id == str(user.id)) &
                (Permissions.is_calling == False)
            ) |
            # Calling-Specific Permissions:
            (
                (col(Permissions.foreign_id).in_(callings)) &
                (Permissions.is_calling == True)
            )
        )
    ).all()

    # Combine all permissions from the gathered Permissions objects into one mask
    combined_permissions = Permission.NONE
    if not permissions_objects:
        return False
    for perm in permissions_objects:
        combined_permissions |= perm.scopes
    
    return (required_permissions & combined_permissions) == required_permissions


def get_user_effective_permissions(user: User, session: Session) -> int:
    callings = [str(calling.calling_id) for calling in user.callings]
    if not callings:
        callings = ["-1"]
    perm_rows = session.exec(
        select(Permissions).where(
            (
                (Permissions.foreign_id == str(user.id)) &
                (Permissions.is_calling == False)
            ) |
            (
                (col(Permissions.foreign_id).in_(callings)) &
                (Permissions.is_calling == True)
            )
        )
    ).all()
    combined = Permission.NONE
    for p in perm_rows:
        combined |= p.scopes
    return int(combined)