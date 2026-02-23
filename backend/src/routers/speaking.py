from datetime import datetime
from logging import getLogger

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, delete, select

from ..utils import CallingUser, speaking_schedule, get_speaking_calendar
from ..db import get_session
from ..models import (
    Calling, Permission, BaseModel, UserCalling, 
    Permissions, SpeakingAssignment, SpeakingAssignmentAPI,
    SpeakingTopic
    )

logger = getLogger("application")

router = APIRouter(prefix="/speaking", tags=["speaking","high-council"])

@router.get("/calendar")
def get_speaking_schedule(
    _ = Depends(CallingUser()),
    calendar = Depends(speaking_schedule)
):
    """
    Endpoint to get the speaking schedule for the high council.
    Returns the schedule for the entire year, including overrides.
    """
    if calendar is None:
        raise HTTPException(status_code=503, detail="Speaking schedule not available")
    return calendar

@router.get("/calendar/{year}")
def get_speaking_schedule_by_year(
    year: int,
    request: Request,
    _ = Depends(CallingUser()),
    session = Depends(get_session)
):
    """
    Endpoint to get the speaking schedule for a specific year.
    Returns the schedule for the given year, including overrides.
    """
    calendar = get_speaking_calendar(request, session, year)
    if calendar is None:
        raise HTTPException(status_code=503, detail="Speaking schedule not available")
    if calendar.year != year:
        raise HTTPException(status_code=404, detail=f"Speaking schedule for year {year} not available")
    return calendar

class SpeakingOverrideRequest(BaseModel):
    high_councilor_id: int
    month: int
    year: int
    ward_id: int
    speaker2: str | None = None
@router.put("/calendar/override")
def add_speaking_override(
    request: Request,
    override: SpeakingOverrideRequest,
    session: Session = Depends(get_session),
    _ = Depends(CallingUser(permissions=[Permission.MANAGE_SPEAKING_SCHEDULE]))
):
    """
    Endpoint to add an override to the speaking schedule.
    This will allow an administrator to change the assigned ward for a given month and high councilor.
    """
    calendar = get_speaking_calendar(request, session, override.year)
    if calendar is None:
        raise HTTPException(status_code=503, detail="Speaking schedule not available")
    # Check if the high councilor exists and is valid
    userCalling = session.get(UserCalling, override.high_councilor_id)
    if userCalling is None:
        raise HTTPException(status_code=404, detail=f"High councilor with id {override.high_councilor_id} not found")
    # Check if the month is valid
    if override.month < 1 or override.month > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    # Check if the ward_id is valid (you may want to add additional validation here)
    # TODO: Add validation for ward_id
    # Check if an override already exists for the given month and high councilor
    statement = select(SpeakingAssignment).where(
        SpeakingAssignment.high_councilor_id == override.high_councilor_id).where(
            SpeakingAssignment.month == datetime(override.year, override.month, 1)
        )
    existing_override = session.exec(statement).first()
    if existing_override:
        # Update the existing override
        existing_override.ward_id = override.ward_id
        existing_override.speaker2 = override.speaker2
        session.add(existing_override)
        session.commit()
        session.refresh(existing_override)
    else:
        # Create a new override
        existing_override = SpeakingAssignment(
            high_councilor_id=override.high_councilor_id,
            month=datetime(override.year, override.month, 1),
            ward_id=override.ward_id,
            speaker2=override.speaker2
        )
        session.add(existing_override)
        session.commit()
        session.refresh(existing_override)
    # Check who is currently assigned to speak in the given month in the given ward
    previous_assignment = calendar.speakers[userCalling.slot_number - 1].assignments[override.month - 1]
    for speaker in calendar.speakers:
        if speaker.high_councilor_id == override.high_councilor_id:
            continue
        assn = speaker.assignments[override.month - 1]
        if assn.ward_id == override.ward_id:
            # We found someone who was going to speak in this ward originally
            # Trade assignments between the two high councilors
            statement = select(SpeakingAssignment)\
            .where(SpeakingAssignment.high_councilor_id == speaker.high_councilor_id)\
            .where(SpeakingAssignment.month == datetime(override.year, override.month, 1))
            other_override = session.exec(statement).first()
            if other_override:
                other_override.ward_id = previous_assignment.ward_id
                other_override.speaker2 = previous_assignment.speaker2
            else:
                other_override = SpeakingAssignment(
                    high_councilor_id=speaker.high_councilor_id,
                    month=datetime(override.year, override.month, 1),
                    ward_id=previous_assignment.ward_id,
                    speaker2=previous_assignment.speaker2
                )
            session.add(other_override)
            session.commit()
            session.refresh(other_override)
            calendar.speakers[speaker.high_councilor_id - 1].assignments[other_override.month - 1] = SpeakingAssignmentAPI(
                ward_id=other_override.ward_id,
                speaker2=other_override.speaker2
            )
            break
    # Update the calendar with the new override
    calendar.speakers[userCalling.slot_number - 1].assignments[override.month - 1] = SpeakingAssignmentAPI(
        ward_id=override.ward_id,
        speaker2=override.speaker2
    )
    return calendar
    
@router.get("/topics/{year}")
def get_speaking_topics(
    year: int,
    session: Session = Depends(get_session),
    _ = Depends(CallingUser())
):
    """
    Endpoint to get the speaking topics for a specific year.
    Returns a list of topics for the given year.
    """
    statement = select(SpeakingTopic).where(SpeakingTopic.month.between(
        datetime(year, 1, 1), datetime(year, 12, 31)
    ))
    topics = session.exec(statement).all()
    return topics

class SpeakingTopicRequest(BaseModel):
    topic: str
    reference_material: str | None = None
@router.put("/topics/{year}/{month}")
def update_speaking_topic(
    year: int,
    month: int,
    topic_request: SpeakingTopicRequest,
    session: Session = Depends(get_session),
    _ = Depends(CallingUser(permissions=[Permission.MANAGE_SPEAKING_SCHEDULE]))
):
    """
    Endpoint to update the speaking topic for a specific month and year.
    Allows an administrator to set or update the speaking topic and reference material for a given month.
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    statement = select(SpeakingTopic).where(SpeakingTopic.month == datetime(year, month, 1))
    existing_topic = session.exec(statement).first()
    if existing_topic:
        existing_topic.topic = topic_request.topic
        existing_topic.reference_material = topic_request.reference_material
        session.add(existing_topic)
        session.commit()
        session.refresh(existing_topic)
        return existing_topic
    else:
        new_topic = SpeakingTopic(
            month=datetime(year, month, 1),
            topic=topic_request.topic,
            reference_material=topic_request.reference_material
        )
        session.add(new_topic)
        session.commit()
        session.refresh(new_topic)
        return new_topic