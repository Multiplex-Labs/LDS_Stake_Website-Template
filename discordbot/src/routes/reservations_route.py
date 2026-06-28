from logging import getLogger

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..utils.auth import require_backend_token

logger = getLogger("application")
router = APIRouter(prefix="/reservations", tags=["reservations"], dependencies=[Depends(require_backend_token)])


class ReservationNotifyRequest(BaseModel):
    """
    Payload sent by the backend when a new reservation needs approver DMs.

    The backend is responsible for querying all users with the
    APPROVE_BLDG_RESERVATIONS permission (flag 1024) and passing their
    emails in `approver_emails` before calling this endpoint.
    """

    reservation_id: int
    event_name: str
    date: str
    start_time: str
    end_time: str
    rooms: list[str]
    organizer_name: str
    organizer_phone: str
    needs_access: bool
    approver_emails: list[str]


class AccessNotifyRequest(BaseModel):
    """
    Payload sent by the backend when a reservation is approved and the organizer
    lacks building access (fob/code).

    The backend is responsible for querying all users with the MANAGE_ACCESS
    permission (flag 2048) and passing their emails in `access_manager_emails`
    before calling this endpoint.
    """

    reservation_id: int
    event_name: str
    date: str
    organizer_name: str
    access_manager_emails: list[str]


@router.post("/notify")
async def notify_approvers(payload: ReservationNotifyRequest, request: Request):
    logger.info("Received reservation notify request for id: %s", payload.reservation_id)
    if not payload.approver_emails:
        logger.warning(
            "No approver emails in notify payload for reservation %s", payload.reservation_id
        )
    await request.app.state.bot.reservation_hook.send_approval_dms(payload)
    return {"message": "Reservation notification dispatched", "approver_count": len(payload.approver_emails)}


@router.post("/access-notify")
async def notify_access_managers(payload: AccessNotifyRequest, request: Request):
    logger.info("Received access notify request for reservation id: %s", payload.reservation_id)
    if not payload.access_manager_emails:
        logger.warning(
            "No access manager emails in access-notify payload for reservation %s",
            payload.reservation_id,
        )
    await request.app.state.bot.reservation_hook.send_access_dms(payload)
    return {"message": "Access notification dispatched", "manager_count": len(payload.access_manager_emails)}
