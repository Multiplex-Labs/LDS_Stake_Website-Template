from typing import Optional
from sqlmodel import Field

from .base import BaseModel


class PresidencyAssignment(BaseModel, table=True):
    """Represents per-role data for a Stake Presidency calling.

    - `id`: primary key (int)
    - `calling_id`: unique FK to `calling.id` with CASCADE delete
    - `responsibilities`: nullable comma-separated text
    - `wards_overseen`: nullable JSON-encoded list[int] of ward IDs
    """

    __tablename__ = "presidency_assignment"

    id: Optional[int] = Field(default=None, primary_key=True)
    calling_id: int = Field(
        foreign_key="calling.id",
        unique=True,
        index=True,
        ondelete="CASCADE",
    )
    responsibilities: Optional[str] = Field(default=None, nullable=True)
    wards_overseen: Optional[str] = Field(default=None, nullable=True)
