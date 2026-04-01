from sqlmodel import Field, Relationship
from typing import Optional

from .base import BaseModel
from .calling import UserCalling


class Ward(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    bishop_id: int = Field(default=None, foreign_key="UserCalling.id")

    # Relationships
    bishop: UserCalling = Relationship()