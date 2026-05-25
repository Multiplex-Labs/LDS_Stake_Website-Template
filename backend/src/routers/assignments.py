from logging import getLogger

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..utils import (
    CallingUser,
    get_or_make_hc_assignment
)
from ..db import get_session
from ..models import Assignment, Permission, BaseModel, UserCalling


class AssignmentUpdate(BaseModel):
    responsibility: str | None = None
    committee: str | None = None


class AssignmentResponse(BaseModel):
    id: int
    slot_number: int
    high_councilor_id: int | None
    responsibility: str | None
    committee: str | None


logger = getLogger("application")

router = APIRouter(prefix="/assignments", tags=["assignments","high-council"])


@router.get("/", response_model=list[AssignmentResponse])
def get_assignments(
    _ = Depends(CallingUser()),
    session: Session = Depends(get_session)
):
    rows = session.exec(
        select(Assignment, UserCalling.slot_number)
        .join(UserCalling, Assignment.high_councilor_id == UserCalling.id)
    ).all()
    return [
        AssignmentResponse(
            id=a.id,
            slot_number=slot_number,
            high_councilor_id=a.high_councilor_id,
            responsibility=a.responsibility,
            committee=a.committee,
        )
        for a, slot_number in rows
    ]


@router.get("/slot/{slot_id}")
def get_assignment(
    slot_id: int,
    session: Session = Depends(get_session),
    current_user = Depends(CallingUser())
):
        
    assignment = get_or_make_hc_assignment(slot_id, session, current_user)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.put("/slot/{slot_id}")
def update_assignment(
    slot_id: int,
    data: AssignmentUpdate,
    current_user = Depends(CallingUser(permissions=[Permission.MANAGE_ASSIGNMENTS])),
    session: Session = Depends(get_session)
):
    assignment = get_or_make_hc_assignment(slot_id, session, current_user)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment.responsibility = data.responsibility
    assignment.committee = data.committee

    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment

