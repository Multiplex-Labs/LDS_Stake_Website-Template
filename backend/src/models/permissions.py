import functools
import operator
from enum import IntFlag
from sqlmodel import Field, SQLModel, UniqueConstraint
from typing import Optional
from pydantic import field_validator

from .base import BaseModel


class Permission(IntFlag):
    NONE = 0
    MANAGE_USERS = 1
    MANAGE_CALLINGS = 2
    MANAGE_ASSIGNMENTS = 4
    MANAGE_SPEAKING_SCHEDULE = 8
    SUBMIT_CALLING_PROPOSALS = 16
    MANAGE_CALLING_PROPOSALS = 32
    VIEW_CALLING_PROPOSALS = 64
    DISCORD_BOT = 128  # Special permission for the Discord bot to identify itself
    MANAGE_WARDS = 256

# All assignable flags; DISCORD_BOT excluded so the validator rejects it explicitly.
MAX_VALID_SCOPES = int(functools.reduce(operator.or_, Permission)) & ~int(Permission.DISCORD_BOT)

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

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, v: int) -> int:
        if v < 0:
            raise ValueError("scopes must be a non-negative integer")
        if v & ~MAX_VALID_SCOPES:
            raise ValueError("scopes contains unknown or reserved permission bits")
        return v


