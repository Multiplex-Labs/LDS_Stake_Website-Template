import asyncio
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, date, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, SQLModel, Session, select

from ..models import (
    Permission,
    TempleRecommendConfig,
    AppointmentType,
    AvailabilityWindow,
    AvailabilityException,
    Booking,
    BookingAuditLog,
    BookingStatus,
    Permissions,
    UserCalling,
    User,
)
from ..db import get_session
from ..utils import CallingUser, email_service

logger = logging.getLogger("application")

router = APIRouter(prefix="/appointment-bookings", tags=["appointment-bookings"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_confirmation_token() -> str:
    secret = os.getenv("JWT_SECRET_KEY", "default-secret")
    random_part = secrets.token_hex(16)
    payload = f"{random_part}:new"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{random_part}.{sig}"


def _get_interviewer_user_ids(session: Session) -> set:
    perm_rows = session.exec(
        select(Permissions).where(Permissions.is_calling == True)
    ).all()
    calling_ids = [int(p.foreign_id) for p in perm_rows if (p.scopes & 512) == 512]
    interviewer_user_ids: set = set()
    for cid in calling_ids:
        ucs = session.exec(
            select(UserCalling).where(
                UserCalling.calling_id == cid,
                UserCalling.user_id.is_not(None),
            )
        ).all()
        for uc in ucs:
            interviewer_user_ids.add(uc.user_id)
    return interviewer_user_ids


def _find_interviewer_for_slot(
    session: Session,
    slot_datetime_utc: datetime,
    appointment_type_id: int,
) -> Optional[int]:
    """Find which interviewer's availability window covers the requested UTC slot."""
    config = session.get(TempleRecommendConfig, 1)
    if not config:
        return None

    tz = ZoneInfo(config.timezone)
    local_dt = slot_datetime_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    local_date = local_dt.date()
    slot_minute = local_dt.hour * 60 + local_dt.minute
    dow = local_date.weekday()

    appt_type = session.get(AppointmentType, appointment_type_id)
    if not appt_type:
        return None
    duration = appt_type.duration_mins

    # Check global exceptions
    global_exc = session.exec(
        select(AvailabilityException).where(
            AvailabilityException.date == local_date,
            AvailabilityException.is_global == True,
        )
    ).first()
    if global_exc:
        return None

    interviewer_user_ids = _get_interviewer_user_ids(session)

    for user_id in interviewer_user_ids:
        # Check personal exception
        personal_exc = session.exec(
            select(AvailabilityException).where(
                AvailabilityException.date == local_date,
                AvailabilityException.user_id == user_id,
                AvailabilityException.is_global == False,
            )
        ).first()
        if personal_exc:
            continue

        windows = session.exec(
            select(AvailabilityWindow).where(
                AvailabilityWindow.user_id == user_id,
                AvailabilityWindow.day_of_week == dow,
                AvailabilityWindow.is_active == True,
            )
        ).all()
        for window in windows:
            if (window.valid_from is None or window.valid_from <= local_date) and \
               (window.valid_until is None or window.valid_until >= local_date):
                if window.start_minute <= slot_minute and slot_minute + duration <= window.end_minute:
                    return user_id

    return None


def _format_time_str(minute_of_day: int, timezone: str) -> str:
    """Format a minute-of-day to a human-readable time string."""
    hour = minute_of_day // 60
    minute = minute_of_day % 60
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour if hour <= 12 else hour - 12
    if display_hour == 0:
        display_hour = 12
    return f"{display_hour}:{minute:02d} {suffix}"


# ---------------------------------------------------------------------------
# Background task helpers
# ---------------------------------------------------------------------------

def _send_booking_confirmation_email(booking_id: int):
    """Background task: send confirmation email to the member."""
    from ..db.orm import ORM
    try:
        with Session(ORM().engine) as session:
            booking = session.get(Booking, booking_id)
            if not booking:
                return
            appt_type = session.get(AppointmentType, booking.appointment_type_id)
            config = session.get(TempleRecommendConfig, 1)
            interviewer = session.get(User, booking.interviewer_user_id)
            if not (appt_type and config and interviewer):
                return

            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3100")
            confirm_url = f"{frontend_base}/appointment-bookings/confirm/{booking.confirmation_token}"
            cancel_url = f"{frontend_base}/appointment-bookings/cancel/{booking.confirmation_token}"

            date_str = booking.booking_date.strftime("%A, %B %d, %Y")
            time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

            email_service.booking_confirmation(
                member_email=booking.member_email,
                member_name=booking.member_name,
                type_name=appt_type.name,
                date_str=date_str,
                time_str=time_str,
                location=config.location_name,
                interviewer_name=f"{interviewer.fname} {interviewer.lname}",
                confirm_url=confirm_url,
                cancel_url=cancel_url,
            )

            booking.notification_sent_at = datetime.utcnow()
            session.add(booking)
            session.commit()
    except Exception:
        logger.warning("Failed to send booking confirmation email for booking %d", booking_id, exc_info=True)


def _send_interviewer_notification_email(booking_id: int):
    """Background task: notify the interviewer of a new booking."""
    from ..db.orm import ORM
    try:
        with Session(ORM().engine) as session:
            booking = session.get(Booking, booking_id)
            if not booking:
                return
            appt_type = session.get(AppointmentType, booking.appointment_type_id)
            config = session.get(TempleRecommendConfig, 1)
            interviewer = session.get(User, booking.interviewer_user_id)
            if not (appt_type and config and interviewer) or not interviewer.email:
                return

            date_str = booking.booking_date.strftime("%A, %B %d, %Y")
            time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

            email_service.interviewer_notification(
                interviewer_email=interviewer.email,
                member_name=booking.member_name,
                member_email=booking.member_email,
                member_phone=booking.member_phone,
                type_name=appt_type.name,
                date_str=date_str,
                time_str=time_str,
            )
    except Exception:
        logger.warning("Failed to send interviewer notification email for booking %d", booking_id, exc_info=True)


def _send_member_cancellation_email(booking_id: int):
    """Background task: send cancellation confirmation to member."""
    from ..db.orm import ORM
    try:
        with Session(ORM().engine) as session:
            booking = session.get(Booking, booking_id)
            if not booking:
                return
            appt_type = session.get(AppointmentType, booking.appointment_type_id)
            config = session.get(TempleRecommendConfig, 1)
            if not (appt_type and config):
                return

            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3100")
            rebook_url = f"{frontend_base}/stake-info/temple-recommend"
            date_str = booking.booking_date.strftime("%A, %B %d, %Y")
            time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

            email_service.member_cancellation_confirmation(
                member_email=booking.member_email,
                member_name=booking.member_name,
                type_name=appt_type.name,
                date_str=date_str,
                time_str=time_str,
                rebook_url=rebook_url,
            )
    except Exception:
        logger.warning("Failed to send member cancellation email for booking %d", booking_id, exc_info=True)


def _send_presidency_cancellation_email(booking_id: int, reason: Optional[str]):
    """Background task: send presidency cancellation notice to member."""
    from ..db.orm import ORM
    try:
        with Session(ORM().engine) as session:
            booking = session.get(Booking, booking_id)
            if not booking:
                return
            appt_type = session.get(AppointmentType, booking.appointment_type_id)
            config = session.get(TempleRecommendConfig, 1)
            if not (appt_type and config):
                return

            frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3100")
            rebook_url = f"{frontend_base}/stake-info/temple-recommend"
            date_str = booking.booking_date.strftime("%A, %B %d, %Y")
            time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

            email_service.presidency_cancellation_notice(
                member_email=booking.member_email,
                member_name=booking.member_name,
                type_name=appt_type.name,
                date_str=date_str,
                time_str=time_str,
                reason=reason,
                rebook_url=rebook_url,
            )
    except Exception:
        logger.warning("Failed to send presidency cancellation email for booking %d", booking_id, exc_info=True)


# ---------------------------------------------------------------------------
# Background cleanup task
# ---------------------------------------------------------------------------

async def expire_pending_bookings_loop():
    """Hourly background task: expire PENDING_EMAIL_CONFIRM bookings older than 24 hours."""
    from ..db.orm import ORM
    while True:
        await asyncio.sleep(3600)
        try:
            cutoff = datetime.utcnow() - timedelta(hours=24)
            with Session(ORM().engine) as session:
                pending = session.exec(
                    select(Booking).where(
                        Booking.status == BookingStatus.PENDING_EMAIL_CONFIRM,
                        Booking.created_at < cutoff,
                    )
                ).all()
                for booking in pending:
                    booking.status = BookingStatus.EXPIRED
                    session.add(booking)
                    session.add(BookingAuditLog(
                        booking_id=booking.id,
                        event_type="expired",
                        actor_user_id=None,
                    ))
                if pending:
                    session.commit()
                    logger.info("Expired %d pending bookings.", len(pending))
        except Exception:
            logger.error("expire_pending_bookings_loop: error", exc_info=True)


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------

class BookingCreate(SQLModel):
    appointment_type_id: int
    slot_datetime_utc: datetime
    member_name: str
    member_email: str
    member_phone: str
    honeypot: str = Field(default="", alias="_honeypot")


class AdminCancelBody(SQLModel):
    cancellation_reason: Optional[str] = None


class StatusUpdateBody(SQLModel):
    status: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/")
def create_booking(
    body: BookingCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Booking:
    """Create a new booking. Public endpoint. Includes honeypot spam protection."""
    # Honeypot: if filled, silently return fake success without persisting anything
    if body.honeypot:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=200, content={"detail": "Booking received"})

    config = session.get(TempleRecommendConfig, 1)
    if not config:
        raise HTTPException(status_code=500, detail="Temple recommend config not found")

    now_utc = datetime.utcnow()
    cutoff_dt = now_utc + timedelta(hours=config.booking_cutoff_hours)
    slot_utc = body.slot_datetime_utc.replace(tzinfo=None)  # ensure naive UTC

    if slot_utc <= cutoff_dt:
        raise HTTPException(
            status_code=422,
            detail=f"Slot is within the {config.booking_cutoff_hours}-hour booking cutoff.",
        )

    max_booking_date = (now_utc + timedelta(days=config.booking_window_days)).date()
    if slot_utc.date() > max_booking_date:
        raise HTTPException(
            status_code=422,
            detail=f"Slot is beyond the {config.booking_window_days}-day booking window.",
        )

    appt_type = session.get(AppointmentType, body.appointment_type_id)
    if not appt_type or not appt_type.is_active:
        raise HTTPException(status_code=404, detail="Appointment type not found or inactive")

    interviewer_user_id = _find_interviewer_for_slot(
        session, slot_utc, body.appointment_type_id
    )
    if interviewer_user_id is None:
        raise HTTPException(status_code=422, detail="No interviewer available for the requested slot.")

    # Convert slot UTC to local for display fields
    tz = ZoneInfo(config.timezone)
    local_dt = slot_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    booking_date = local_dt.date()
    start_minute = local_dt.hour * 60 + local_dt.minute
    end_minute = start_minute + appt_type.duration_mins
    end_utc = slot_utc + timedelta(minutes=appt_type.duration_mins)

    token = _generate_confirmation_token()

    booking = Booking(
        appointment_type_id=body.appointment_type_id,
        interviewer_user_id=interviewer_user_id,
        member_name=body.member_name,
        member_email=body.member_email,
        member_phone=body.member_phone,
        booking_date=booking_date,
        start_minute_of_day=start_minute,
        end_minute_of_day=end_minute,
        start_datetime=slot_utc,
        end_datetime=end_utc,
        status=BookingStatus.PENDING_EMAIL_CONFIRM,
        confirmation_token=token,
    )

    try:
        session.add(booking)
        session.flush()  # get booking.id before audit log
        session.add(BookingAuditLog(
            booking_id=booking.id,
            event_type="created",
            actor_user_id=None,
        ))
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="That slot was just taken — please choose another time.",
        )

    session.refresh(booking)

    background_tasks.add_task(_send_booking_confirmation_email, booking.id)
    background_tasks.add_task(_send_interviewer_notification_email, booking.id)

    return booking


@router.get("/confirm/{token}")
def confirm_booking(
    token: str,
    session: Session = Depends(get_session),
) -> dict:
    """Confirm a booking via token link from the confirmation email. Public endpoint."""
    booking = session.exec(
        select(Booking).where(Booking.confirmation_token == token)
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == BookingStatus.CONFIRMED:
        return {"detail": "Booking already confirmed", "booking_id": booking.id}

    if booking.status != BookingStatus.PENDING_EMAIL_CONFIRM:
        raise HTTPException(
            status_code=400,
            detail=f"Booking cannot be confirmed (current status: {booking.status.value})",
        )

    booking.status = BookingStatus.CONFIRMED
    session.add(booking)
    session.add(BookingAuditLog(
        booking_id=booking.id,
        event_type="confirmed",
        actor_user_id=None,
    ))
    session.commit()

    frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3100")
    return RedirectResponse(
        url=f"{frontend_base}/stake-info/temple-recommend?confirmed=1",
        status_code=302,
    )


@router.get("/cancel/{token}")
def cancel_booking_by_token(
    token: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> dict:
    """Cancel a booking via token link. Must be CONFIRMED status. Public endpoint."""
    booking = session.exec(
        select(Booking).where(Booking.confirmation_token == token)
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail=f"Only confirmed bookings can be cancelled this way (current status: {booking.status.value}).",
        )

    booking.status = BookingStatus.CANCELLED_BY_MEMBER
    booking.cancelled_at = datetime.utcnow()
    session.add(booking)
    session.add(BookingAuditLog(
        booking_id=booking.id,
        event_type="cancelled_by_member",
        actor_user_id=None,
    ))
    session.commit()

    background_tasks.add_task(_send_member_cancellation_email, booking.id)

    return {"detail": "Booking cancelled successfully", "booking_id": booking.id}


@router.get("/")
def list_bookings(
    interviewer_user_id: Optional[int] = Query(default=None),
    appointment_type_id: Optional[int] = Query(default=None),
    status: Optional[List[str]] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> List[Booking]:
    """List bookings with optional filters. Requires MANAGE_APPOINTMENTS."""
    stmt = select(Booking)
    if interviewer_user_id is not None:
        stmt = stmt.where(Booking.interviewer_user_id == interviewer_user_id)
    if appointment_type_id is not None:
        stmt = stmt.where(Booking.appointment_type_id == appointment_type_id)
    if status:
        valid_statuses = [BookingStatus(s) for s in status]
        stmt = stmt.where(Booking.status.in_(valid_statuses))
    if date_from is not None:
        stmt = stmt.where(Booking.booking_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Booking.booking_date <= date_to)
    stmt = stmt.order_by(Booking.start_datetime)
    return list(session.exec(stmt).all())


@router.patch("/{booking_id}/cancel")
def admin_cancel_booking(
    booking_id: int,
    body: AdminCancelBody,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS], api_safe=True)),
) -> Booking:
    """Cancel a booking as presidency. Requires MANAGE_APPOINTMENTS."""
    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail=f"Only confirmed bookings can be cancelled (current status: {booking.status.value})",
        )

    booking.status = BookingStatus.CANCELLED_BY_PRESIDENCY
    booking.cancelled_at = datetime.utcnow()
    booking.cancelled_by_user_id = current_user.id if current_user else None
    booking.cancellation_reason = body.cancellation_reason
    session.add(booking)
    session.add(BookingAuditLog(
        booking_id=booking.id,
        event_type="cancelled_by_presidency",
        actor_user_id=booking.cancelled_by_user_id,
        event_metadata={"reason": body.cancellation_reason},
    ))
    session.commit()
    session.refresh(booking)

    background_tasks.add_task(_send_presidency_cancellation_email, booking.id, body.cancellation_reason)

    return booking


@router.patch("/{booking_id}/status")
def update_booking_status(
    booking_id: int,
    body: StatusUpdateBody,
    session: Session = Depends(get_session),
    current_user: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS], api_safe=True)),
) -> Booking:
    """Mark a booking as COMPLETED or NO_SHOW. Only CONFIRMED → COMPLETED/NO_SHOW is allowed."""
    allowed_transitions = {
        "COMPLETED": BookingStatus.COMPLETED,
        "NO_SHOW": BookingStatus.NO_SHOW,
    }
    if body.status not in allowed_transitions:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of: {list(allowed_transitions.keys())}",
        )

    booking = session.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail=f"Only CONFIRMED bookings can be marked as {body.status} (current status: {booking.status.value})",
        )

    new_status = allowed_transitions[body.status]
    booking.status = new_status
    session.add(booking)
    session.add(BookingAuditLog(
        booking_id=booking.id,
        event_type=body.status.lower(),
        actor_user_id=current_user.id if current_user else None,
    ))
    session.commit()
    session.refresh(booking)
    return booking
