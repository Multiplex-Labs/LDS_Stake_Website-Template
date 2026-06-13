import os
from sqlmodel import Session, select
from fastapi import HTTPException
from logging import getLogger

from .usercalling import get_or_make_user_calling, user_has_calling
from .db import _create_calling_if_not_exists, ORM
from ..models import Ward, Permission, User, UserCalling, Calling


logger = getLogger("application")

def load_wards():
    """Loads wards from wards.csv file."""

    ward_definition_file = os.getenv("WARD_DEFINITION_FILE", "wards.csv")

    if not os.path.isfile(ward_definition_file):
        logger.warning(
            f"Ward definition file '{ward_definition_file}' not found. No wards will be loaded. "
            "To fix this, create a wards.csv file with the correct format and set the WARD_DEFINITION_FILE environment variable to the path of the file."
        )
        return
    
    with open(ward_definition_file, "r") as f:
        wards = [l.strip() for l in f.readlines() if l.strip() and not l.startswith("#")]
    orm = ORM()
    with Session(orm.engine) as session:
        existing_wards_statement = select(Ward)
        existing_wards = session.exec(existing_wards_statement).all()
        if existing_wards:
            logger.warning(
                f"Wards already exist in the database. Skipping ward loading from '{ward_definition_file}'. "
                "To fix this, remove all wards from the database and restart the application to load wards from the file."
            )
            return
        bishop_calling = _create_calling_if_not_exists(
            session=session,
            name="Bishop",
            max_slots=len(wards),
            is_public=True,
            permissions=[Permission.SUBMIT_CALLING_PROPOSALS]
        )

        for w in wards:
            parts = w.split(",")
            name = parts[0]
            start_time_val = parts[1]
            location_val = parts[2].strip() if len(parts) > 2 else None
            bishop_slot = get_or_make_user_calling(
                calling_id=bishop_calling.id,
                slot_id=wards.index(w) + 1,
                session=session
            )
            logger.info(f"Creating ward '{w}'.")
            ward = Ward(name=name, start_time=float(start_time_val), bishop_calling_id=bishop_slot.id, location=location_val)
            session.add(ward)
            session.commit()

def get_bishops_ward(session: Session, bishop_user: User) -> Ward:
    """Helper function to get the ward for a given bishop user calling."""
    if not user_has_calling(bishop_user, "Bishop"):
        raise HTTPException(status_code=403, detail="User does not have a Bishop calling.")
    bishop_calling = session.exec(
        select(UserCalling)
        .join(Calling, UserCalling.calling_id == Calling.id)
        .where(UserCalling.user_id == bishop_user.id)
        .where(Calling.name == "Bishop")
    ).first()
    ward_statement = select(Ward).where(Ward.bishop_id == bishop_calling.id)
    ward = session.exec(ward_statement).first()
    return ward