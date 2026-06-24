from datetime import date as _date, datetime, timezone
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel, UniqueConstraint
from sqlalchemy import Column
from sqlalchemy.dialects.sqlite import JSON as SAJSON

from .base import BaseModel


class TempleRecommendConfig(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    location_name: str = Field(default="Stake Center")
    location_address: str = Field(default="1550 N 400 E, Logan, UT 84321")
    open_hours_text: str = Field(default="Sundays 8:30am–3:30pm")
    exception_note: str = Field(
        default="Open interviews are not held on Fast Sunday, General Conference, Stake Conference, Easter, or Christmas."
    )
    timezone: str = Field(default="America/Denver")
    slot_buffer_mins: int = Field(default=5)
    booking_window_days: int = Field(default=60)
    booking_cutoff_hours: int = Field(default=24)


class AppointmentType(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    description: str = Field(default="")
    duration_mins: int = Field(default=30)
    details: str = Field(default="")
    icon_name: str = Field(default="Calendar")
    is_active: bool = Field(default=True)
    display_order: int = Field(default=0)
    system_defined: bool = Field(default=False)


class AvailabilityWindow(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    day_of_week: int = Field(ge=0, le=6)  # 0=Monday, 6=Sunday
    start_minute: int = Field(ge=0, lt=1440)  # minute of day
    end_minute: int = Field(ge=0, lt=1440)
    valid_from: Optional[_date] = Field(default=None)
    valid_until: Optional[_date] = Field(default=None)
    is_active: bool = Field(default=True)


class AvailabilityException(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: Optional[_date] = Field(default=None)   # None when recurrence is set
    reason: str
    is_global: bool = Field(default=False)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    # Recurring rules: None = one-time date exception
    # "first_sunday_monthly" = first Sunday of every month (Fast Sunday)
    recurrence: Optional[str] = Field(default=None)


class BookingStatus(str, Enum):
    PENDING_EMAIL_CONFIRM = "PENDING_EMAIL_CONFIRM"
    CONFIRMED = "CONFIRMED"
    EXPIRED = "EXPIRED"
    CANCELLED_BY_MEMBER = "CANCELLED_BY_MEMBER"
    CANCELLED_BY_PRESIDENCY = "CANCELLED_BY_PRESIDENCY"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"


class Booking(BaseModel, table=True):
    __table_args__ = (
        UniqueConstraint("start_datetime", "interviewer_user_id", name="uq_booking_slot"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    appointment_type_id: int = Field(foreign_key="appointmenttype.id")
    interviewer_user_id: int = Field(foreign_key="user.id")
    member_name: str
    member_email: str
    member_phone: str
    booking_date: _date
    start_minute_of_day: int
    end_minute_of_day: int
    start_datetime: datetime  # UTC
    end_datetime: datetime    # UTC
    status: BookingStatus = Field(default=BookingStatus.PENDING_EMAIL_CONFIRM)
    confirmation_token: str = Field(unique=True)
    cancelled_at: Optional[datetime] = Field(default=None)
    cancelled_by_user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    cancellation_reason: Optional[str] = Field(default=None)
    notification_sent_at: Optional[datetime] = Field(default=None)
    calendar_sync_status: str = Field(default="not_applicable")
    calendar_event_id: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class BookingAuditLog(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    booking_id: int = Field(foreign_key="booking.id")
    event_type: str
    actor_user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    event_metadata: Optional[dict] = Field(default=None, sa_column=Column("metadata", SAJSON))
