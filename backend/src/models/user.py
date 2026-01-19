from sqlmodel import Field, SQLModel
from typing import Optional

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
    calling: Optional[str] = None

class APISafeUser(SQLModel):
    id: int
    email: str
    force_password_reset: bool = Field(default=True)
    fname: str
    lname: str
    active: bool
    phone: Optional[str] = None
    bio: Optional[str] = None
    profile_image: Optional[str] = None
    calling: Optional[str] = None

    @classmethod
    def from_user(cls, user: User) -> "APISafeUser":
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
            calling=user.calling
        )