from logging import getLogger
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel, Session, select

from ..models import Ward
from ..db import get_session

logger = getLogger("application")

router = APIRouter(prefix="/wards", tags=["ward"])


class WardPublic(SQLModel):
    id: Optional[int]
    name: str
    bishop_id: Optional[int]
    start_time: float
    location: Optional[str]
    bishop_slot_number: Optional[int]


@router.get("/")
def list_wards(session: Session = Depends(get_session)) -> List[WardPublic]:
    """Return all wards."""
    wards = session.exec(select(Ward)).all()
    return [
        WardPublic(
            id=ward.id,
            name=ward.name,
            bishop_id=ward.bishop_id,
            start_time=ward.start_time,
            location=ward.location,
            bishop_slot_number=ward.bishop.slot_number if ward.bishop else None,
        )
        for ward in wards
    ]


@router.get("/{ward_id}")
def get_ward(ward_id: int, session: Session = Depends(get_session)) -> WardPublic:
    """Return a single ward by id."""
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    return WardPublic(
        id=ward.id,
        name=ward.name,
        bishop_id=ward.bishop_id,
        start_time=ward.start_time,
        location=ward.location,
        bishop_slot_number=ward.bishop.slot_number if ward.bishop else None,
    )
