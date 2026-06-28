import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import (
    BuildingReservation,
    BuildingReservationCreate,
    BuildingReservationResponse,
    DenyRequest,
    Permission,
    ReservationStatus,
    ResponseSafeUser,
)
from ..utils import CallingUser

logger = logging.getLogger("application")
router = APIRouter(prefix="/reservations", tags=["reservations"])


# ---------------------------------------------------------------------------
# Conflict detection helper
# ---------------------------------------------------------------------------

def _check_conflict(
    session: Session,
    reservation_id_to_exclude: Optional[int],
    event_date,
    rooms_list: list[str],
) -> bool:
    """Return True if any other PENDING/APPROVED reservation on the same date shares ≥1 room.

    Note: only date and room name are compared — time-range overlap is not checked.
    Same-day reservations for the same room at non-overlapping times will also return True.
    """
    existing = session.exec(
        select(BuildingReservation).where(
            BuildingReservation.date == event_date,
            BuildingReservation.status.in_([ReservationStatus.PENDING, ReservationStatus.APPROVED]),
            BuildingReservation.id != reservation_id_to_exclude,
        )
    ).all()
    rooms_set = set(rooms_list)
    for r in existing:
        try:
            existing_rooms = set(json.loads(r.rooms))
        except (json.JSONDecodeError, TypeError):
            logger.error("[reservations] Reservation %s has malformed rooms JSON; skipping conflict check", r.id)
            continue
        if rooms_set & existing_rooms:
            return True
    return False


# ---------------------------------------------------------------------------
# Background task helpers — imports are deferred to avoid eagerly initialising
# services (DiscordBotHandle, email) at module load time, and because background
# tasks run outside the request session and open their own resources.
# ---------------------------------------------------------------------------

def _bg_send_pending(reservation: BuildingReservation) -> None:
    try:
        from ..utils.email import send_reservation_pending
        send_reservation_pending(reservation)
    except Exception:
        logger.exception("[reservations] Failed to send pending confirmation email")


def _get_emails_with_permission(flag: int) -> list[str]:
    """Return emails of all active users who hold the given permission flag (user-level only)."""
    from sqlmodel import Session, select
    from ..db.orm import ORM
    from ..models import User, Permissions
    orm = ORM()
    with Session(orm.engine) as session:
        perm_rows = session.exec(
            select(Permissions).where(
                Permissions.is_calling == False,
                Permissions.scopes.op("&")(flag) == flag,
            )
        ).all()
        user_ids = [int(p.foreign_id) for p in perm_rows]
        if not user_ids:
            return []
        users = session.exec(
            select(User).where(User.id.in_(user_ids), User.active == True)
        ).all()
        return [u.email for u in users if u.email]


def _bg_notify_approvers(
    reservation_id: int,
    event_name: str,
    date_str: str,
    start_time: str,
    end_time: str,
    rooms: list[str],
    organizer_name: str,
    organizer_phone: str,
    needs_access: bool,
) -> None:
    try:
        from ..utils.discord_bot import DiscordBotHandle
        approver_emails = _get_emails_with_permission(Permission.APPROVE_BLDG_RESERVATIONS)
        bot = DiscordBotHandle()
        if not approver_emails:
            logger.warning(
                "[reservations] No users have APPROVE_BLDG_RESERVATIONS permission; "
                "reservation %s will have no approver notifications", reservation_id
            )
            return
        bot.notify_reservation_approvers(
            reservation_id=reservation_id,
            event_name=event_name,
            date_str=date_str,
            start_time=start_time,
            end_time=end_time,
            rooms=rooms,
            organizer_name=organizer_name,
            organizer_phone=organizer_phone,
            needs_access=needs_access,
            approver_emails=approver_emails,
        )
    except Exception:
        logger.exception("[reservations] Discord notify_reservation_approvers failed")


def _bg_send_approved(reservation: BuildingReservation) -> None:
    try:
        from ..utils.email import send_reservation_approved
        send_reservation_approved(reservation)
    except Exception:
        logger.exception("[reservations] Failed to send approved email")


def _bg_notify_access(
    reservation_id: int,
    event_name: str,
    date_str: str,
    organizer_name: str,
) -> None:
    try:
        from ..utils.discord_bot import DiscordBotHandle
        access_emails = _get_emails_with_permission(Permission.MANAGE_ACCESS)
        bot = DiscordBotHandle()
        bot.notify_access_managers(
            reservation_id=reservation_id,
            event_name=event_name,
            date_str=date_str,
            organizer_name=organizer_name,
            access_manager_emails=access_emails,
        )
    except Exception:
        logger.exception("[reservations] Discord notify_access_managers failed")


def _bg_send_denied(reservation: BuildingReservation) -> None:
    try:
        from ..utils.email import send_reservation_denied
        send_reservation_denied(reservation)
    except Exception:
        logger.exception("[reservations] Failed to send denied email")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/", status_code=201, response_model=BuildingReservationResponse)
def create_reservation(
    data: BuildingReservationCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> BuildingReservationResponse:
    reservation = BuildingReservation(
        event_name=data.event_name,
        event_description=data.event_description,
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        setup_time=data.setup_time,
        cleanup_time=data.cleanup_time,
        rooms=json.dumps(data.rooms),
        organizer_name=data.organizer_name,
        organizer_email=data.organizer_email,
        organizer_phone=data.organizer_phone,
        organization=data.organization,
        organization_other=data.organization_other,
        affiliation=data.affiliation,
        needs_access=data.needs_access,
        status=ReservationStatus.PENDING,
        submitted_at=datetime.now(timezone.utc),
    )
    session.add(reservation)
    session.commit()
    session.refresh(reservation)

    has_conflict = _check_conflict(session, reservation.id, reservation.date, data.rooms)

    background_tasks.add_task(_bg_send_pending, reservation)
    background_tasks.add_task(
        _bg_notify_approvers,
        reservation.id,
        reservation.event_name,
        str(reservation.date),
        reservation.start_time,
        reservation.end_time,
        data.rooms,
        reservation.organizer_name,
        reservation.organizer_phone,
        reservation.needs_access,
    )

    return BuildingReservationResponse.from_orm_with_conflict(reservation, has_conflict)


@router.get("/", response_model=list[BuildingReservationResponse])
def list_reservations(
    status: Optional[ReservationStatus] = None,
    date: Optional[str] = None,
    session: Session = Depends(get_session),
    _current_user: ResponseSafeUser = Depends(
        CallingUser(api_safe=True, permissions=[Permission.APPROVE_BLDG_RESERVATIONS])
    ),
) -> list[BuildingReservationResponse]:
    query = select(BuildingReservation)
    if status:
        query = query.where(BuildingReservation.status == status)
    if date:
        query = query.where(BuildingReservation.date == date)
    reservations = session.exec(query).all()

    if not reservations:
        return []

    # One query for all active (PENDING/APPROVED) reservations used in conflict checks
    active = session.exec(
        select(BuildingReservation).where(
            BuildingReservation.status.in_([ReservationStatus.PENDING, ReservationStatus.APPROVED])
        )
    ).all()

    active_by_date: defaultdict = defaultdict(list)
    for r in active:
        active_by_date[r.date].append(r)

    def _has_conflict(reservation: BuildingReservation) -> bool:
        rooms_set = set(reservation.rooms_list())
        for other in active_by_date[reservation.date]:
            if other.id == reservation.id:
                continue
            try:
                if rooms_set & set(other.rooms_list()):
                    return True
            except (json.JSONDecodeError, TypeError):
                logger.error(
                    "[reservations] Reservation %s has malformed rooms JSON; skipping conflict check",
                    other.id,
                )
        return False

    return [
        BuildingReservationResponse.from_orm_with_conflict(r, _has_conflict(r))
        for r in reservations
    ]


@router.get("/{reservation_id}", response_model=BuildingReservationResponse)
def get_reservation(
    reservation_id: int,
    session: Session = Depends(get_session),
    _current_user: ResponseSafeUser = Depends(
        CallingUser(api_safe=True, permissions=[Permission.APPROVE_BLDG_RESERVATIONS])
    ),
) -> BuildingReservationResponse:
    reservation = session.get(BuildingReservation, reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    has_conflict = _check_conflict(
        session, reservation.id, reservation.date, reservation.rooms_list()
    )
    return BuildingReservationResponse.from_orm_with_conflict(reservation, has_conflict)


@router.post("/{reservation_id}/approve", status_code=200)
def approve_reservation(
    reservation_id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: ResponseSafeUser = Depends(
        CallingUser(api_safe=True, permissions=[Permission.APPROVE_BLDG_RESERVATIONS])
    ),
) -> dict:
    reservation = session.get(BuildingReservation, reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if reservation.status != ReservationStatus.PENDING:
        raise HTTPException(status_code=409, detail="Reservation has already been reviewed")

    reservation.status = ReservationStatus.APPROVED
    reservation.reviewed_at = datetime.now(timezone.utc)
    reservation.reviewed_by = current_user.id
    session.add(reservation)
    session.commit()
    session.refresh(reservation)

    background_tasks.add_task(_bg_send_approved, reservation)
    if reservation.needs_access:
        background_tasks.add_task(
            _bg_notify_access,
            reservation.id,
            reservation.event_name,
            str(reservation.date),
            reservation.organizer_name,
        )

    return {"detail": "Reservation approved"}


@router.post("/{reservation_id}/deny", status_code=200)
def deny_reservation(
    reservation_id: int,
    request: DenyRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: ResponseSafeUser = Depends(
        CallingUser(api_safe=True, permissions=[Permission.APPROVE_BLDG_RESERVATIONS])
    ),
) -> dict:
    reservation = session.get(BuildingReservation, reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if reservation.status != ReservationStatus.PENDING:
        raise HTTPException(status_code=409, detail="Reservation has already been reviewed")

    reservation.status = ReservationStatus.DENIED
    reservation.denial_reason = request.reason
    reservation.reviewed_at = datetime.now(timezone.utc)
    reservation.reviewed_by = current_user.id
    session.add(reservation)
    session.commit()
    session.refresh(reservation)

    background_tasks.add_task(_bg_send_denied, reservation)

    return {"detail": "Reservation denied"}


@router.delete("/{reservation_id}", status_code=204)
def delete_reservation(
    reservation_id: int,
    session: Session = Depends(get_session),
    _current_user: ResponseSafeUser = Depends(
        CallingUser(api_safe=True, permissions=[Permission.APPROVE_BLDG_RESERVATIONS])
    ),
) -> None:
    reservation = session.get(BuildingReservation, reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    session.delete(reservation)
    session.commit()
