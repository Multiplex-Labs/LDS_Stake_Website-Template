from logging import getLogger
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Field, SQLModel, Session, select

from ..models import Ward
from ..db import get_session

logger = getLogger("application")

router = APIRouter(prefix="/wards", tags=["ward"])


class WardPublic(SQLModel):
    id: int
    name: str
    bishop_id: Optional[int] = Field(
        default=None,
        description="ID of the UserCalling row (usercalling.id) for this ward's bishop slot, not a user id.",
    )
    start_time: float = Field(
        description="Decimal hours since midnight (e.g., 9.0 = 9:00 AM, 13.5 = 1:30 PM). Valid range: [0, 24)."
    )
    location: Optional[str] = None
    bishop_slot_number: Optional[int] = None


def _ward_to_public(ward: Ward) -> WardPublic:
    return WardPublic(
        id=ward.id,
        name=ward.name,
        bishop_id=ward.bishop_id,
        start_time=ward.start_time,
        location=ward.location,
        bishop_slot_number=ward.bishop.slot_number if ward.bishop else None,
    )


@router.get("/")
def list_wards(session: Session = Depends(get_session)) -> List[WardPublic]:
    """Return all wards."""
    wards = session.exec(select(Ward).options(selectinload(Ward.bishop))).all()
    return [_ward_to_public(w) for w in wards]


@router.get("/{ward_id}")
def get_ward(ward_id: int, session: Session = Depends(get_session)) -> WardPublic:
    """Return a single ward by id."""
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    return _ward_to_public(ward)
