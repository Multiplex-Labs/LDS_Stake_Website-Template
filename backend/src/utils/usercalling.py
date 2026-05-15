from ..models import Calling, UserCalling, User, Assignment
from sqlmodel import Session, select
from fastapi import HTTPException
from typing import Optional

def get_or_make_user_calling(
    calling_id: int,
    slot_id: int,
    session: Session,
    current_user: Optional[User] = None
    ):
    """
    Helper function to get or create a UserCalling for a given calling and slot.
    This is used to ensure that we have a UserCalling entry for each slot of a calling.
    Even if the slot is unassigned (user_id is None), we want to have a UserCalling entry for it.
    """
    calling = session.get(Calling, calling_id)
    if calling is None or (not calling.is_public and current_user is None):
        raise HTTPException(status_code=404, detail="Calling not found")
    if slot_id < 1 or slot_id > calling.max_slots:
        raise HTTPException(status_code=400, detail="Slot ID is out of range for this calling.")
    assignment = session.exec(
        select(UserCalling).where(UserCalling.calling_id == calling_id, UserCalling.slot_number == slot_id)
    ).first()
    if assignment is None:
        # We should create a database entry for this slot even if it's unassigned
        assignment = UserCalling(
            calling_id=calling_id,
            slot_number=slot_id,
            user_id=None
        )
        session.add(assignment)
        session.commit()
        session.refresh(assignment)
    return assignment

def get_or_make_hc_assignment(
    slot_id: int,
    session: Session,
    current_user: Optional[User] = None
    ):
    """
    Helper function to get or create an Assignment for a given high councilor slot.
    This is used to ensure that we have an Assignment entry for each high councilor slot.
    """
    statement = (
            select(Assignment)
            .join(UserCalling)
            .where(UserCalling.slot_number == slot_id)
        )
    assignment = session.exec(statement).first()
    if assignment is None:
        # We need to see if the slot exists at all to determine if this is a 404 or just an empty slot
        calling = session.exec(
            select(Calling).where(Calling.name == "High Councilor")
        ).first()

        if calling is None:
            raise HTTPException(status_code=404, detail="High Councilor calling not found")

        usercalling = get_or_make_user_calling(
            calling_id=calling.id,
            slot_id=slot_id,
            session=session,
            current_user=current_user
        )
        if usercalling is None:
            raise HTTPException(status_code=404, detail="Slot not found")
        # Usercalling exists, we need to create the assignment for this slot
        assignment = Assignment(
            high_councilor_id=usercalling.id,
            responsibility=None,
            committee=None
        )
        session.add(assignment)
        session.commit()
        session.refresh(assignment)
        session.refresh(assignment)
    return assignment

def user_has_calling(user: User, calling_name: str) -> bool:
    """Helper function to check if a user has a specific calling by name."""
    for uc in user.callings:
        if uc.calling and uc.calling.name == calling_name:
            return True
    return False