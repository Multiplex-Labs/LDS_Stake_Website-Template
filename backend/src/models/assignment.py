from typing import Optional
from sqlmodel import Field, Relationship

from .base import BaseModel
from .calling import UserCalling


class Assignment(BaseModel, table=True):
    """Represents an assignment with an associated high councilor.

    - `id`: primary key (int)
    - `high_councilor_id`: foreign key to `usercalling.id`
    - `responsibility`: nullable comma-separated string
    - `committee`: nullable comma-separated string
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    high_councilor_id: Optional[int] = Field(default=None, foreign_key="usercalling.id", index=True)
    responsibility: Optional[str] = Field(default=None, nullable=True)
    committee: Optional[str] = Field(default=None, nullable=True)

    # Optional relationship to the UserCalling which describes the high councilor slot
    high_councilor: "UserCalling" = Relationship()
