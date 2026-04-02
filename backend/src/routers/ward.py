from logging import getLogger
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..models import Ward
from ..db import get_session

logger = getLogger("application")

router = APIRouter(prefix="/wards", tags=["ward"])


@router.get("/")
def list_wards(session: Session = Depends(get_session)) -> List[Ward]:
    """Return all wards."""
    wards = session.exec(select(Ward)).all()
    return wards


@router.get("/{ward_id}")
def get_ward(ward_id: int, session: Session = Depends(get_session)) -> Ward:
    """Return a single ward by id."""
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    return ward
