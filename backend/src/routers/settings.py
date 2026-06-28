import os
import mimetypes
import logging
from enum import Enum
from typing import Optional
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import SQLModel, Session, Field
from pydantic import field_validator

from ..models import Permission, SiteSettings
from ..db import get_session
from ..utils import CallingUser

router = APIRouter(prefix="/settings", tags=["settings"])
logger = logging.getLogger("application")

ALLOWED_HIDDEN_PAGES = frozenset([
    "resources", "sports", "reserve", "temple-recommend",
    "ward-map", "bishops", "hc-assignments", "speaking",
    "callings", "sustainings", "presidency",
])

TIME_PATTERN = re.compile(r"^\d{1,2}:\d{2}\s?(am|pm)$", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SiteSettingsResponse(SQLModel):
    stake_name: str
    stake_address: str
    contact_email: str
    reply_to_email: str
    hero_title: str
    hero_subtitle: str
    hero_image_url: Optional[str]
    logo_url: Optional[str]
    sacrament_times: list[str]
    hidden_pages: list[str]


class SiteSettingsUpdate(SQLModel):
    stake_name: Optional[str] = Field(default=None, max_length=200)
    stake_address: Optional[str] = Field(default=None, max_length=500)
    contact_email: Optional[str] = Field(default=None, max_length=254)
    reply_to_email: Optional[str] = Field(default=None, max_length=254)
    hero_title: Optional[str] = Field(default=None, max_length=200)
    hero_subtitle: Optional[str] = Field(default=None, max_length=500)
    sacrament_times: Optional[list[str]] = None
    hidden_pages: Optional[list[str]] = None

    @field_validator("contact_email", "reply_to_email", mode="before")
    @classmethod
    def validate_email(cls, v: object) -> object:
        if v is None or v == "":
            return v
        if not EMAIL_PATTERN.match(str(v)):
            raise ValueError("Invalid email address.")
        return v

    @field_validator("sacrament_times")
    @classmethod
    def validate_times(cls, v: object) -> object:
        if v is None:
            return v
        for t in v:
            if not TIME_PATTERN.match(str(t)):
                raise ValueError(f"Invalid time format: '{t}'. Expected format like '10:00am'.")
        return v

    @field_validator("hidden_pages")
    @classmethod
    def validate_pages(cls, v: object) -> object:
        if v is None:
            return v
        unknown = set(v) - ALLOWED_HIDDEN_PAGES  # type: ignore[arg-type]
        if unknown:
            raise ValueError(f"Unknown page keys: {sorted(unknown)}")
        return v


class SiteImageType(str, Enum):
    logo = "logo"
    hero = "hero"


def _default_settings() -> SiteSettingsResponse:
    return SiteSettingsResponse(
        stake_name="Logan Married Student 2nd Stake",
        stake_address="1550 N 400 E, Logan, UT 84321",
        contact_email="lmssecondstake@gmail.com",
        reply_to_email="",
        hero_title="Welcome to the Logan Married Student 2nd Stake",
        hero_subtitle="A community dedicated to faith, service, and fellowship. Join us in worship and activities.",
        hero_image_url=None,
        logo_url=None,
        sacrament_times=["8:30am", "10:00am", "11:30am", "1:00pm"],
        hidden_pages=[],
    )


@router.get("/", response_model=SiteSettingsResponse)
def get_settings(session: Session = Depends(get_session)) -> SiteSettingsResponse:
    """Return current site settings. Public — no auth required."""
    settings = session.get(SiteSettings, 1)
    if settings is None:
        return _default_settings()
    return SiteSettingsResponse(
        stake_name=settings.stake_name,
        stake_address=settings.stake_address,
        contact_email=settings.contact_email,
        reply_to_email=settings.reply_to_email,
        hero_title=settings.hero_title,
        hero_subtitle=settings.hero_subtitle,
        hero_image_url=settings.hero_image_url,
        logo_url=settings.logo_url,
        sacrament_times=settings.sacrament_times or [],
        hidden_pages=settings.hidden_pages or [],
    )


@router.put("/", response_model=SiteSettingsResponse)
def update_settings(
    body: SiteSettingsUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_SITE_SETTINGS])),
) -> SiteSettingsResponse:
    """Update site settings. Requires MANAGE_SITE_SETTINGS permission."""
    settings = session.get(SiteSettings, 1)
    if settings is None:
        settings = SiteSettings(id=1, sacrament_times=[], hidden_pages=[])
        session.add(settings)

    update_data = body.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    session.add(settings)
    session.commit()
    session.refresh(settings)

    return SiteSettingsResponse(
        stake_name=settings.stake_name,
        stake_address=settings.stake_address,
        contact_email=settings.contact_email,
        reply_to_email=settings.reply_to_email,
        hero_title=settings.hero_title,
        hero_subtitle=settings.hero_subtitle,
        hero_image_url=settings.hero_image_url,
        logo_url=settings.logo_url,
        sacrament_times=settings.sacrament_times or [],
        hidden_pages=settings.hidden_pages or [],
    )


@router.post("/upload/{image_type}", response_model=SiteSettingsResponse)
async def upload_site_image(
    image_type: SiteImageType,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_SITE_SETTINGS])),
) -> SiteSettingsResponse:
    """Upload logo or hero image. Requires MANAGE_SITE_SETTINGS permission."""
    ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
    MAX_SIZE = 5 * 1024 * 1024  # 5MB

    if not file.content_type or file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="File must be a JPEG, PNG, or WebP image.")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Image must be smaller than 5MB.")

    _, ext = os.path.splitext(file.filename or "")
    if not ext:
        ext = mimetypes.guess_extension(file.content_type) or ".jpg"
    ext = ext.lower()
    if ext == ".jpeg":
        ext = ".jpg"

    base_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "static", "site_images")
    )
    os.makedirs(base_dir, exist_ok=True)
    fname = f"{image_type.value}{ext}"
    fpath = os.path.join(base_dir, fname)

    settings = session.get(SiteSettings, 1)
    if settings is None:
        settings = SiteSettings(id=1, sacrament_times=[], hidden_pages=[])
        session.add(settings)
        session.commit()
        session.refresh(settings)

    # Delete old file for this image type if it exists and differs
    old_url = settings.logo_url if image_type == SiteImageType.logo else settings.hero_image_url
    if old_url:
        old_fname = os.path.basename(old_url)
        old_path = os.path.join(base_dir, old_fname)
        if os.path.isfile(old_path) and old_path != fpath:
            try:
                os.remove(old_path)
            except OSError:
                logger.warning("[settings] Could not delete old site image: %s", old_path)

    try:
        with open(fpath, "wb") as f:
            f.write(contents)
    except OSError as e:
        raise HTTPException(status_code=500, detail="Failed to save image.") from e

    public_path = f"/api/static/site_images/{fname}"
    if image_type == SiteImageType.logo:
        settings.logo_url = public_path
    else:
        settings.hero_image_url = public_path

    session.add(settings)
    session.commit()
    session.refresh(settings)

    return SiteSettingsResponse(
        stake_name=settings.stake_name,
        stake_address=settings.stake_address,
        contact_email=settings.contact_email,
        reply_to_email=settings.reply_to_email,
        hero_title=settings.hero_title,
        hero_subtitle=settings.hero_subtitle,
        hero_image_url=settings.hero_image_url,
        logo_url=settings.logo_url,
        sacrament_times=settings.sacrament_times or [],
        hidden_pages=settings.hidden_pages or [],
    )


def get_reply_to_email(session: Session) -> str:
    """Resolve reply-to address: DB setting takes priority over REPLY_TO_EMAIL env var."""
    settings = session.get(SiteSettings, 1)
    if settings and settings.reply_to_email:
        return settings.reply_to_email
    return os.getenv("REPLY_TO_EMAIL", "") or os.getenv("BREVO_FROM_EMAIL", "")
