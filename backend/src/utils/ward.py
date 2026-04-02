import os
from sqlmodel import Session, select
from logging import getLogger

from .usercalling import get_or_make_user_calling
from .db import _create_calling_if_not_exists, ORM
from ..models import Ward


logger = getLogger("application")

def load_wards():
    """Loads wards from wards.txt file."""

    ward_definition_file = os.getenv("WARD_DEFINITION_FILE", "wards.txt")

    if not os.path.isfile(ward_definition_file):
        logger.warning(
            f"Ward definition file '{ward_definition_file}' not found. No wards will be loaded. "
            "To fix this, create a wards.txt file with the correct format and set the WARD_DEFINITION_FILE environment variable to the path of the file."
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
            is_public=True
        )

        for w in wards:
            bishop_slot = get_or_make_user_calling(
                calling_id=bishop_calling.id,
                slot_id=wards.index(w) + 1,
                session=session
            )
            logger.info(f"Creating ward '{w}'.")
            ward = Ward(name=w, bishop_calling_id=bishop_slot.id)
            session.add(ward)
            session.commit()