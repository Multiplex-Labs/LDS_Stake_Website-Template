from enum import IntFlag, auto
from sqlmodel import Field, SQLModel, UniqueConstraint
from typing import Optional

from .base import BaseModel


class Permission(IntFlag):
    NONE = 0
    MANAGE_USERS = auto()
    MANAGE_CALLINGS = auto()
    MANAGE_ASSIGNMENTS = auto()
    MANAGE_SPEAKING_SCHEDULE = auto()
    SUBMIT_CALLING_PROPOSALS = auto()
    MANAGE_CALLING_PROPOSALS = auto()
    VIEW_CALLING_PROPOSALS = auto()
    DISCORD_BOT = auto()  # Special permission for the Discord bot to identify itself

class Permissions(BaseModel, table=True):
    # Composite unique constraint: Prevents User #1 and Calling #1 
    # from conflicting while ensuring User #1 can't have two rows.
    __table_args__ = (
        UniqueConstraint("foreign_id", "is_calling", name="unique_subject_permission"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    foreign_id: str = Field(index=True)
    is_calling: bool = Field(default=False)
    scopes: int = Field(default=0)

    @property
    def human_readable_scopes(self) -> list[str]:
        scopes = []
        for permission in Permission:
            if self.scopes & permission:
                scopes.append(permission.name)
        return scopes
    
    def grant_permission(self, perm: Permission) -> None:
        """Grant a specific permission to the Permissions."""
        self.scopes |= perm

    def revoke_permission(self, perm: Permission) -> None:
        """Revoke a specific permission from the Permissions."""
        self.scopes &= ~perm


class PermissionsResponse(SQLModel):
    scopes: int
    flags: list[str]


class PermissionsUpdateRequest(SQLModel):
    scopes: int


