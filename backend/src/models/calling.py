from typing import List, Optional
from sqlmodel import Field, Relationship

from .base import BaseModel

class Calling(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    max_slots: int = Field(default=1)
    is_public: bool = Field(default=False)
    system_defined: bool = Field(default=False)
    display_group: Optional[str] = Field(default=None, nullable=True)
    display_order: Optional[int] = Field(default=None, nullable=True)
    group_order: Optional[int] = Field(default=None, nullable=True)
    lock_slots: bool = Field(default=False)

    # Relationship to assignments
    assignments: List["UserCalling"] = Relationship(
        back_populates="calling",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class UserCalling(BaseModel, table=True):
    """
    A junction table to represent the many-to-many relationship 
    between Users and Callings.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, nullable=True)
    calling_id: int = Field(foreign_key="calling.id", index=True)
    slot_number: int = Field(default=1)

    # Relationships
    user: "User" = Relationship(back_populates="callings") # type: ignore
    calling: Calling = Relationship(back_populates="assignments")