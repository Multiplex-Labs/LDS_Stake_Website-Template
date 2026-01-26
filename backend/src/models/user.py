from sqlmodel import Field, Relationship, SQLModel
from typing import List, Optional

from .calling import UserCalling
from .user_session import UserSession

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    force_password_reset: bool = Field(default=True)
    fname: str
    lname: str
    active: bool = True
    phone: Optional[str] = Field(default=None, unique=True)
    bio: Optional[str] = None
    profile_image: Optional[str] = None
    callings: List["UserCalling"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    sessions: List["UserSession"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    
    @classmethod
    def from_request_safe_user(cls, request_safe_user: "RequestSafeUser", password_hash: str) -> "User":
        return cls(
            id=request_safe_user.id,
            email=request_safe_user.email,
            password_hash=password_hash,
            force_password_reset=request_safe_user.force_password_reset,
            fname=request_safe_user.fname,
            lname=request_safe_user.lname,
            active=request_safe_user.active,
            phone=request_safe_user.phone,
            bio=request_safe_user.bio,
            profile_image=request_safe_user.profile_image
        )

class ResponseSafeUser(SQLModel):
    id: int
    email: str
    force_password_reset: bool = Field(default=True)
    fname: str
    lname: str
    active: bool
    phone: Optional[str] = None
    bio: Optional[str] = None
    profile_image: Optional[str] = None
    callings: List[UserCalling] = None

    @classmethod
    def from_user(cls, user: User) -> "ResponseSafeUser":
        return cls(
            id=user.id,
            email=user.email,
            force_password_reset=user.force_password_reset,
            fname=user.fname,
            lname=user.lname,
            active=user.active,
            phone=user.phone,
            bio=user.bio,
            profile_image=user.profile_image,
            callings=user.callings
        )
    
class RequestSafeUser(SQLModel):
    email: str
    force_password_reset: bool = Field(default=True)
    fname: str
    lname: str
    active: bool
    phone: Optional[str] = None
    bio: Optional[str] = None
    profile_image: Optional[str] = None