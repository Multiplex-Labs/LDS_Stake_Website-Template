from datetime import datetime
from logging import getLogger

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, delete, select

from ..utils import CallingUser, get_or_make_user_calling
from ..db import get_session
from ..models import Calling, Permission, BaseModel, UserCalling, Permissions

logger = getLogger("application")

router = APIRouter(prefix="/speaking", tags=["speaking","high-council"])

@router.get("/")
def get_speaking_schedule(
    current_user = Depends(CallingUser()),
    session: Session = Depends(get_session),
):
    """
    Endpoint to get the speaking schedule for the high council.
    Returns the schedule for the entire year, including overrides.
    """
    pass