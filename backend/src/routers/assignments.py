from logging import getLogger

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..utils import (
    CallingUser,
    get_or_make_hc_assignment
)
from ..db import get_session
from ..models import Assignment, Permission


logger = getLogger("application")

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("/")
def get_assignments(
    _ = Depends(CallingUser()),
    session: Session = Depends(get_session)
):
    """Return all assignments."""
    statement = select(Assignment)
    assignments = session.exec(statement).all()
    return assignments


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
    assignment_id: str,
    data: Assignment,
    current_user = Depends(CallingUser(permissions=[Permission.MANAGE_ASSIGNMENTS])),
    session: Session = Depends(get_session)
):
    assignment = get_or_make_hc_assignment(assignment_id, session, current_user)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Update fields
    assignment.high_councilor_id = data.high_councilor_id
    assignment.responsibility = data.responsibility
    assignment.committee = data.committee

    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment

