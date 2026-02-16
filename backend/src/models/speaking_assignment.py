from typing import Optional
from sqlmodel import Field, Relationship
from datetime import datetime

from .base import BaseModel

class SpeakingAssignment(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    high_councilor_id: Optional[int] = Field(default=None, foreign_key="usercalling.id", index=True)
    speaker2: Optional[str] = Field(default=None, nullable=True)
    ward_id: Optional[int] = Field(default=None, index=True)
    month: datetime = Field(default=None, index=True, nullable=False)

class SpeakingTopic(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    topic: str = Field(default=None, nullable=False)
    reference_material: Optional[str] = Field(default=None, nullable=True)
    month: datetime = Field(default=None, index=True, nullable=False)