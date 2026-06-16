from logging import getLogger
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import field_validator
from sqlalchemy.orm import selectinload
from sqlmodel import Field, SQLModel, Session, select

from ..models import Ward, UserCalling, Calling, Permission
from ..db import get_session
from ..utils import CallingUser, BISHOP_CALLING_NAME

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


class WardPayload(SQLModel):
    name: str
    start_time: float
    location: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Ward name must not be blank.")
        return v

    @field_validator("start_time")
    @classmethod
    def start_time_in_range(cls, v: float) -> float:
        if not (0.0 <= v < 24.0):
            raise ValueError("start_time must be in the range [0, 24).")
        return v

    @field_validator("location")
    @classmethod
    def location_normalize(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip() or None
        return v


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


@router.post("/")
def create_ward(
    body: WardPayload,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_WARDS])),
) -> WardPublic:
    """Create a new ward and its associated Bishop calling slot."""
    bishop_calling = session.exec(
        select(Calling).where(Calling.name == BISHOP_CALLING_NAME)
    ).first()
    if not bishop_calling:
        raise HTTPException(status_code=500, detail="Bishop calling not found. Ensure system callings are initialised.")

    existing_slots = session.exec(
        select(UserCalling).where(UserCalling.calling_id == bishop_calling.id)
    ).all()
    next_slot = max((uc.slot_number for uc in existing_slots), default=0) + 1

    try:
        bishop_calling.max_slots = max(bishop_calling.max_slots, next_slot)
        session.add(bishop_calling)
        bishop_slot = UserCalling(calling_id=bishop_calling.id, slot_number=next_slot, user_id=None)
        session.add(bishop_slot)
        session.flush()  # populate bishop_slot.id before using it as Ward.bishop_id

        ward = Ward(name=body.name, start_time=body.start_time, location=body.location, bishop_id=bishop_slot.id)
        session.add(ward)
        session.commit()
    except Exception:
        session.rollback()
        logger.error("create_ward: failed to commit, rolled back", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create ward. Please try again.")

    session.refresh(ward)
    session.refresh(bishop_slot)
    ward.bishop = bishop_slot
    return _ward_to_public(ward)


@router.put("/{ward_id}")
def update_ward(
    ward_id: int,
    body: WardPayload,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_WARDS])),
) -> WardPublic:
    """Update a ward's name, meeting time, and location."""
    ward = session.exec(
        select(Ward).where(Ward.id == ward_id).options(selectinload(Ward.bishop))
    ).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    ward.name = body.name
    ward.start_time = body.start_time
    ward.location = body.location
    session.add(ward)
    session.commit()
    session.refresh(ward)
    return _ward_to_public(ward)


@router.delete("/{ward_id}", status_code=204)
def delete_ward(
    ward_id: int,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_WARDS])),
) -> None:
    """Delete a ward and its associated bishop calling slot."""
    ward = session.get(Ward, ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    bishop_slot = None
    bishop_calling = None
    if ward.bishop_id is not None:
        bishop_slot = session.get(UserCalling, ward.bishop_id)
        if bishop_slot is None:
            logger.warning(
                "delete_ward: ward %d has bishop_id=%d but no matching UserCalling row",
                ward_id, ward.bishop_id,
            )
        else:
            bishop_calling = session.get(Calling, bishop_slot.calling_id)

    # Delete the ward first so the FK reference to the bishop slot is released.
    session.delete(ward)
    session.flush()

    if bishop_slot is not None:
        session.delete(bishop_slot)
        if bishop_calling is not None:
            remaining = session.exec(
                select(UserCalling).where(
                    UserCalling.calling_id == bishop_calling.id,
                    UserCalling.id != bishop_slot.id,
                )
            ).all()
            bishop_calling.max_slots = max(
                (uc.slot_number for uc in remaining), default=0
            )
            session.add(bishop_calling)

    session.commit()
