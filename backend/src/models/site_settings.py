from typing import Optional
from sqlmodel import Field
from sqlalchemy import Column
from sqlalchemy.dialects.sqlite import JSON as SAJSON

from .base import BaseModel


class SiteSettings(BaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    stake_name: str = Field(default="Logan Married Student 2nd Stake", max_length=200)
    stake_address: str = Field(default="1550 N 400 E, Logan, UT 84321", max_length=500)
    contact_email: str = Field(default="lmssecondstake@gmail.com", max_length=254)
    reply_to_email: str = Field(default="", max_length=254)
    hero_title: str = Field(default="Welcome to the Logan Married Student 2nd Stake", max_length=200)
    hero_subtitle: str = Field(default="A community dedicated to faith, service, and fellowship. Join us in worship and activities.", max_length=500)
    hero_image_url: Optional[str] = Field(default=None, max_length=500)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    sacrament_times: list[str] = Field(
        default_factory=list,
        sa_column=Column("sacrament_times", SAJSON)
    )
    hidden_pages: list[str] = Field(
        default_factory=list,
        sa_column=Column("hidden_pages", SAJSON)
    )
