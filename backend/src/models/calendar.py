from typing import List, Optional
from datetime import datetime

from sqlalchemy import Column
from sqlalchemy import JSON as SAJSON
from sqlmodel import Field

from .base import BaseModel


class CalendarEvent(BaseModel, table=True):
	"""Persistent calendar event stored in the database."""
	id: Optional[int] = Field(default=None, primary_key=True)
	title: str
	event_description: Optional[str] = None
	organizer_name: Optional[str] = None
	organizer_email: Optional[str] = None
	organizer_phone: Optional[str] = None
	organizer_organization: Optional[str] = None
	event_affiliation: Optional[str] = None
	start: datetime
	end: datetime
	approved: bool = False
	# Store rooms as JSON array of strings
	rooms: List[str] = Field(default_factory=list, sa_column=Column(SAJSON))


class CalendarEventRequest(BaseModel):
	"""Incoming calendar event request payload (not persisted)."""
	title: str
	event_description: str
	organizer_name: str
	organizer_email: str
	organizer_phone: str
	organizer_organization: str
	event_affiliation: str
	start: datetime
	end: datetime
	rooms: List[str] = Field(default_factory=list)
	setup_time: int # minutes
	cleanup_time: int # minutes
