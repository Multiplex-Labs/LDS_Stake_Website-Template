from typing import Optional
from zoneinfo import available_timezones

_VALID_TIMEZONES = available_timezones()

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Field, SQLModel, Session

from ..models import Permission, TempleRecommendConfig
from ..db import get_session
from ..utils import CallingUser

router = APIRouter(prefix="/temple-config", tags=["temple-config"])


class TempleRecommendConfigUpdate(SQLModel):
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    open_hours_text: Optional[str] = None
    exception_note: Optional[str] = None
    timezone: Optional[str] = None
    slot_buffer_mins: Optional[int] = Field(default=None, ge=1)
    booking_window_days: Optional[int] = Field(default=None, ge=1)
    booking_cutoff_hours: Optional[int] = Field(default=None, ge=0)


@router.get("/")
def get_config(session: Session = Depends(get_session)) -> TempleRecommendConfig:
    """Return the singleton temple recommend configuration."""
    config = session.get(TempleRecommendConfig, 1)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.patch("/")
def update_config(
    body: TempleRecommendConfigUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> TempleRecommendConfig:
    """Update the singleton temple recommend configuration. Requires MANAGE_APPOINTMENTS."""
    config = session.get(TempleRecommendConfig, 1)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    update_data = body.model_dump(exclude_none=True)

    if "timezone" in update_data:
        if update_data["timezone"] not in _VALID_TIMEZONES:
            raise HTTPException(status_code=422, detail="Invalid IANA timezone")

    for key, value in update_data.items():
        setattr(config, key, value)

    session.add(config)
    session.commit()
    session.refresh(config)
    return config
