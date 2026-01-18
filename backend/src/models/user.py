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
