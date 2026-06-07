import json
from logging import getLogger
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel as PydanticBaseModel
from sqlmodel import Session, select

from ..utils import CallingUser
from ..db import get_session
from ..models import (
    BaseModel,
    Calling,
    Permission,
    PresidencyAssignment,
    User,
    UserCalling,
    Ward,
)

logger = getLogger("application")

router = APIRouter(prefix="/presidency-assignments", tags=["presidency"])

# ---------------------------------------------------------------------------
# Response / request models
# ---------------------------------------------------------------------------

PRESIDENCY_CALLING_NAMES = ["Stake President", "First Counselor", "Second Counselor"]


class CurrentHolder(PydanticBaseModel):
    id: int
    fname: str
    lname: str


class PresidencyAssignmentResponse(PydanticBaseModel):
    id: int
    calling_id: int
    calling_name: str
    current_holder: Optional[CurrentHolder]
    responsibilities: list[str]
    wards_overseen: list[int]


class PresidencyAssignmentUpdate(PydanticBaseModel):
    responsibilities: Optional[str] = None
    ward_ids: list[int] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_responsibilities(value: Optional[str]) -> list[str]:
    if not value:
        return []
    return [s.strip() for s in value.split(",") if s.strip()]


def _parse_wards_overseen(value: Optional[str]) -> list[int]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [int(x) for x in parsed]
    except (json.JSONDecodeError, ValueError, TypeError):
        logger.error("Could not parse wards_overseen JSON: %r", value)
    return []


def _build_response(
    row: PresidencyAssignment,
    session: Session,
) -> PresidencyAssignmentResponse:
    """Build a PresidencyAssignmentResponse from an ORM row."""
    calling = session.get(Calling, row.calling_id)
    if calling is None:
        logger.error(
            "_build_response: PresidencyAssignment id=%s references non-existent calling_id=%s",
            row.id,
            row.calling_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Internal data error: presidency assignment references a deleted calling.",
        )
    calling_name = calling.name

    # Find the active UserCalling for this calling (slot_number=1 for single-slot callings)
    uc = session.exec(
        select(UserCalling).where(
            UserCalling.calling_id == row.calling_id,
            UserCalling.user_id.isnot(None),  # type: ignore[attr-defined]
        )
    ).first()

    current_holder: Optional[CurrentHolder] = None
    if uc is not None:
        user = session.get(User, uc.user_id)
        if user is not None:
            current_holder = CurrentHolder(id=user.id, fname=user.fname, lname=user.lname)

    # Filter out any stale ward IDs
    raw_ward_ids = _parse_wards_overseen(row.wards_overseen)
    valid_ward_ids: list[int] = []
    for wid in raw_ward_ids:
        ward = session.get(Ward, wid)
        if ward is None:
            logger.warning(
                "PresidencyAssignment id=%s has stale ward_id=%s — ignoring.", row.id, wid
            )
        else:
            valid_ward_ids.append(wid)

    return PresidencyAssignmentResponse(
        id=row.id,
        calling_id=row.calling_id,
        calling_name=calling_name,
        current_holder=current_holder,
        responsibilities=_parse_responsibilities(row.responsibilities),
        wards_overseen=valid_ward_ids,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[PresidencyAssignmentResponse])
def get_presidency_assignments(
    _=Depends(CallingUser()),
    session: Session = Depends(get_session),
) -> list[PresidencyAssignmentResponse]:
    """Return the three presidency assignment rows (one per calling)."""
    results: list[PresidencyAssignmentResponse] = []

    for calling_name in PRESIDENCY_CALLING_NAMES:
        calling = session.exec(
            select(Calling).where(Calling.name == calling_name)
        ).first()

        if calling is None:
            logger.error(
                "get_presidency_assignments: calling '%s' not found. Startup init may have failed.",
                calling_name,
            )
            results.append(
                PresidencyAssignmentResponse(
                    id=-1,
                    calling_id=-1,
                    calling_name=calling_name,
                    current_holder=None,
                    responsibilities=[],
                    wards_overseen=[],
                )
            )
            continue

        row = session.exec(
            select(PresidencyAssignment).where(
                PresidencyAssignment.calling_id == calling.id
            )
        ).first()

        if row is None:
            # Shouldn't happen after startup init, but be defensive
            logger.warning(
                "No PresidencyAssignment row for calling '%s' (id=%s).",
                calling_name,
                calling.id,
            )
            # Return a synthetic empty row so the client always gets 3 entries
            results.append(
                PresidencyAssignmentResponse(
                    id=-1,
                    calling_id=calling.id,
                    calling_name=calling_name,
                    current_holder=None,
                    responsibilities=[],
                    wards_overseen=[],
                )
            )
            continue

        results.append(_build_response(row, session))

    return results


@router.put("/{calling_id}", response_model=PresidencyAssignmentResponse)
def update_presidency_assignment(
    calling_id: int,
    data: PresidencyAssignmentUpdate,
    _=Depends(CallingUser(permissions=[Permission.MANAGE_ASSIGNMENTS])),
    session: Session = Depends(get_session),
) -> PresidencyAssignmentResponse:
    """Update responsibilities and ward assignments for a presidency calling."""
    row = session.exec(
        select(PresidencyAssignment).where(PresidencyAssignment.calling_id == calling_id)
    ).first()

    if row is None:
        raise HTTPException(status_code=404, detail="PresidencyAssignment not found for this calling_id")

    # Validate all ward IDs exist
    if data.ward_ids:
        invalid_ids = [
            wid for wid in data.ward_ids if session.get(Ward, wid) is None
        ]
        if invalid_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid ward IDs: {invalid_ids}",
            )

    row.responsibilities = data.responsibilities if data.responsibilities else None
    row.wards_overseen = json.dumps(data.ward_ids) if data.ward_ids else None

    session.add(row)
    session.commit()
    session.refresh(row)

    return _build_response(row, session)
