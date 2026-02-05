from sqlmodel import Field, Relationship
from typing import Optional
from datetime import datetime, timezone
from .base import BaseModel

class UserSession(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(unique=True)
    ip_address: str = Field()
    user_agent: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_active_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field()

    user: "User" = Relationship(back_populates="sessions")  # type: ignore

class APISafeUserSession(BaseModel):
    id: int
    user_id: int
    ip_address: str
    user_agent: Optional[str] = None
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime

    @classmethod
    def from_user_session(cls, session: UserSession) -> "APISafeUserSession":
        return cls(
            id=session.id,
            user_id=session.user_id,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
            created_at=session.created_at,
            last_active_at=session.last_active_at,
            expires_at=session.expires_at
        )
