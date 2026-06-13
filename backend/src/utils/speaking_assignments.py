from datetime import datetime
import os
import csv

from logging import getLogger
from fastapi import Depends, HTTPException, Request
from sqlmodel import select

from .db import ORM, Session
from .usercalling import get_or_make_user_calling, HC_CALLING_NAME
from ..db import get_session
from ..models import (
    Calling, SpeakerSchedule, SpeakingCalendar, SpeakingAssignmentAPI,
    SpeakingAssignment, UserCalling
    )

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
    speaking_schedule_csv_path = os.getenv("SPEAKING_SCHEDULE_CSV_PATH", None)
    if speaking_schedule_csv_path is None or not os.path.isfile(speaking_schedule_csv_path):
        logger.warning(
            "SPEAKING_SCHEDULE_CSV_PATH environment variable is not set or the file does not exist. "
            "Speaking schedule will be disabled. "
            "To fix this, add a csv file with the correct format and set the SPEAKING_SCHEDULE_CSV_PATH environment variable to the path of the csv file."
        )
        return []
    with open(speaking_schedule_csv_path, "r") as f:
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
        statement = select(Calling).where(Calling.name == HC_CALLING_NAME)
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
        if len(schedule) > slots:
            logger.warning(
                f"Speaking schedule CSV has {len(schedule)} rows but the High Councilor calling has {slots} slots. "
                f"Truncating to {slots} rows."
            )
            schedule = schedule[:slots]
        elif len(schedule) < slots:
            logger.warning(
                f"Speaking schedule CSV has {len(schedule)} rows but the High Councilor calling has {slots} slots. "
                f"Padding {slots - len(schedule)} missing rows with empty assignments."
            )
            cols = len(schedule[0]) if schedule else 12
            schedule += [[""] * cols for _ in range(slots - len(schedule))]
    if schedule:
        logger.info(f"Loaded speaking schedule with {len(schedule)} rows and {len(schedule[0])} columns")
    else:
        logger.warning("Speaking schedule is empty after truncation/padding.")
    return schedule


def get_speaking_calendar(request:Request, session: Session, year: int=-1) -> SpeakingCalendar:
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
    calendar = SpeakingCalendar(year=year, speakers=[])
    ## Get High Councilor callings
    statement = select(Calling).where(Calling.name == HC_CALLING_NAME)
    high_councilor_calling = session.exec(statement).first()
    if high_councilor_calling is None:
        raise HTTPException(
            status_code=503, 
            detail="High Councilor calling not found in database. "
                   "This is required to generate the speaking calendar. "
                   "Please contact the administrator to resolve this issue."
        )
    slots = high_councilor_calling.max_slots
    for i in range(slots):
        usercalling = get_or_make_user_calling(
            calling_id=high_councilor_calling.id,
            slot_id=i+1,
            session=session
        )
        speaker_schedule = SpeakerSchedule(
            high_councilor_id=usercalling.id,
            assignments=[]
        )
        for assn in request.app.state.speaking_schedule[i]:
            speaker_schedule.assignments.append(
                SpeakingAssignmentAPI(
                    ward_id=int(assn) if assn else None,
                    speaker2=None
                )
            )
        calendar.speakers.append(speaker_schedule)
    # Pull overrides from the database and update the calendar accordingly
    statement = select(SpeakingAssignment).where(SpeakingAssignment.month.between(
        datetime(year, 1, 1), datetime(year, 12, 31)
    ))
    overrides = session.exec(statement).all()
    for override in overrides:
        usercalling = session.get(UserCalling, override.high_councilor_id)
        if usercalling is None:
            logger.warning(
                f"UserCalling with id {override.high_councilor_id} not found in database. "
                f"Skipping override with id {override.id}."
            )
            continue
        slot = usercalling.slot_number - 1
        month = override.month.month - 1
        if slot < len(calendar.speakers) and month < len(calendar.speakers[slot].assignments):
            calendar.speakers[slot].assignments[month] = SpeakingAssignmentAPI(
                ward_id=override.ward_id,
                speaker2=override.speaker2
            )

    return calendar
    
    
async def speaking_schedule(
    request: Request,
    session: Session = Depends(get_session),
):
    """
    Helper Dependency to load the speaking schedule 
    """
    return get_speaking_calendar(request, session)