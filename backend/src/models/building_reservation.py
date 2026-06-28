import json
from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel

from .base import BaseModel


class ReservationStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"


class BuildingReservation(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    event_name: str
    event_description: Optional[str] = None
    date: date
    start_time: str
    end_time: str
    setup_time: str
    cleanup_time: str
    rooms: str  # JSON-encoded list of room strings
    organizer_name: str
    organizer_email: str
    organizer_phone: str
    organization: str
    organization_other: Optional[str] = None
    affiliation: str
    needs_access: bool = Field(default=False)
    status: ReservationStatus = Field(default=ReservationStatus.PENDING)
    denial_reason: Optional[str] = None
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[int] = Field(default=None, foreign_key="user.id")

    def rooms_list(self) -> list[str]:
        return json.loads(self.rooms)


class BuildingReservationCreate(SQLModel):
    event_name: str
    event_description: Optional[str] = None
    date: date
    start_time: str
    end_time: str
    setup_time: str
    cleanup_time: str
    rooms: list[str]
    organizer_name: str
    organizer_email: str
    organizer_phone: str
    organization: str
    organization_other: Optional[str] = None
    affiliation: str
    needs_access: bool = False


class BuildingReservationResponse(SQLModel):
    id: int
    event_name: str
    event_description: Optional[str]
    date: date
    start_time: str
    end_time: str
    setup_time: str
    cleanup_time: str
    rooms: list[str]
    organizer_name: str
    organizer_email: str
    organizer_phone: str
    organization: str
    organization_other: Optional[str]
    affiliation: str
    needs_access: bool
    status: ReservationStatus
    denial_reason: Optional[str]
    submitted_at: datetime
    reviewed_at: Optional[datetime]
    reviewed_by: Optional[int]
    has_conflict: bool = False

    @classmethod
    def from_orm_with_conflict(
        cls, obj: "BuildingReservation", has_conflict: bool
    ) -> "BuildingReservationResponse":
        data = obj.model_dump()
        data["rooms"] = obj.rooms_list()
        data["has_conflict"] = has_conflict
        return cls(**data)


class DenyRequest(SQLModel):
    reason: str = Field(min_length=1, max_length=1000)
