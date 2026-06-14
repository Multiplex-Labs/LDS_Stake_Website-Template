from sqlmodel import Field, Relationship
from typing import Optional

from .base import BaseModel
from .calling import UserCalling


class Ward(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    bishop_id: Optional[int] = Field(default=None, foreign_key="usercalling.id", nullable=True)
    start_time: float
    location: Optional[str] = Field(default=None, nullable=True)

    # Relationships
    bishop: UserCalling = Relationship()