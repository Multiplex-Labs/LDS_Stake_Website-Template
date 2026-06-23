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
            permissions=[Permission.VIEW_CALLING_PROPOSALS]
        )

        for slot_number, w in enumerate(wards, start=1):
            parts = w.split(",")
            if len(parts) < 2:
                logger.error(
                    f"Ward definition line {slot_number} is malformed "
                    f"(expected 'name,start_hour[,location]'): {w!r}. Skipping."
                )
                continue
            name = parts[0].strip()
            start_time_str = parts[1].strip()
            try:
                start_time_val = float(start_time_str)
            except ValueError:
                logger.error(
                    f"Ward definition line {slot_number} has invalid start_time {start_time_str!r} "
                    f"for ward {name!r}. Expected a decimal hour (e.g. 9.0). Skipping."
                )
                continue
            location_val = parts[2].strip() if len(parts) > 2 else None
            bishop_slot = get_or_make_user_calling(
                calling_id=bishop_calling.id,
                slot_id=slot_number,
                session=session
            )
            logger.info(f"Creating ward '{name}'.")
            ward = Ward(name=name, start_time=start_time_val, bishop_id=bishop_slot.id, location=location_val)
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