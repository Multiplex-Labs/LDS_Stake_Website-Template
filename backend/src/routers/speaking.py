from logging import getLogger

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, delete, select

from ..utils import CallingUser, get_or_make_user_calling
from ..db import get_session
from ..models import Calling, Permission, BaseModel, UserCalling, Permissions

logger = getLogger("application")

router = APIRouter(prefix="/speaking", tags=["speaking","high-council"])

