from datetime import datetime
import os
import csv

from logging import getLogger
from fastapi import Depends, HTTPException, Request
from sqlmodel import select

from .db import ORM, Session
from ..db import get_session

from ..models import Calling

logger = getLogger("application")

def load_speaking_schedule() -> list[list[str]]:
    """
    Loads the speaking schedule csv
    The csv has the following format:
    Each column is a month starting at january and ending with december
    Each row is a high council assignment slot
    The cell values are the ward in which the high councilor will speak in.
    An null or empty cell means the high councilor will not be speaking in that month.
    """

    # Load the csv file
    with open(os.getenv("SPEAKING_SCHEDULE_CSV_PATH","./"), "r") as f:
        reader = csv.reader(f)
        schedule = list(reader)
    
    if not schedule:
        logger.warning(
            "Speaking schedule csv is empty,"
            "related routes will be disabled"
            "To fix this, add a csv file with the "
            "correct format and set the "
            "SPEAKING_SCHEDULE_CSV_PATH environment "
            "variable to the path of the csv file"
            )
        return []
    
    orm = ORM()
    with Session(orm.engine) as session:
        # Get High Councilor callings
        statement = select(Calling).where(Calling.name == "High Councilor")
        high_councilor_calling = session.exec(statement).first()
        if high_councilor_calling is None:
            logger.warning(
                "High Councilor calling not found in database,"
                "related routes will be disabled"
                "To fix this, delete the database and let the application recreate it with the correct system callings, " 
                "or manually add a calling with the name 'High Councilor' and set system_defined to true"
            )
            return []
        slots = high_councilor_calling.max_slots
        if len(schedule) != slots:
            logger.warning(
                f"Speaking schedule has {len(schedule)} rows but the High Councilor calling has {slots} slots."
                "Speaking assignment slots will be disabled until the mismatch is resolved."
                "To fix this, adjust the number of rows in the schedule to match the number of slots in the High Councilor calling."
            )
            return []
    logger.info(f"Loaded speaking schedule with {len(schedule)} rows and {len(schedule[0])} columns")
    return schedule


def get_speaking_calendar(request:Request, session: Session, year: int=-1):
    """
    Helper function to get the speaking calendar for a given year.
    If year is not provided, defaults to the current year.
    """
    if year == -1:
        year = datetime.now().year
    if not hasattr(request.app.state, "speaking_schedule") or \
        request.app.state.speaking_schedule is None:
        raise HTTPException(
            status_code=503, 
            detail="Speaking schedule is not available. "
                   "This may be due to a problem loading the schedule from the csv file on startup. "
                   "Please contact the administrator to resolve this issue."
        )
    # Iterate through schedule and populate SpeakingCalendar object
    # Pull overrides from the database and update the calendar accordingly
    
    
async def speaking_schedule(
    request: Request,
    session: Session = Depends(get_session),
):
    """
    Helper Dependency to load the speaking schedule 
    """
    return get_speaking_calendar(request, session)