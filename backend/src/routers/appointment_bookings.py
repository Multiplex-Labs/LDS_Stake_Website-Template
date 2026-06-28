import asyncio
import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import datetime, date, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, Response
from pydantic import EmailStr
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
    CalendarSyncStatus,
    Permissions,
    UserCalling,
    User,
)
from ..db import get_session
from ..utils import (
    CallingUser,
    send_email,
    render_booking_confirmation,
    render_interviewer_notification,
    render_member_cancellation_confirmation,
    render_presidency_cancellation_notice,
    render_booking_reschedule_success,
    render_reschedule_interviewer_notification,
    render_booking_already_confirmed,
)
from .appointment_availability import _matches_recurrence, _get_interviewer_user_ids
from .settings import get_reply_to_email

logger = logging.getLogger("application")

router = APIRouter(prefix="/appointment-bookings", tags=["appointment-bookings"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Module-level constant — do not inline os.getenv elsewhere in this file.
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3100")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

# In-memory rate limit for the resend-confirmation endpoint: email -> last request time.
_resend_rate_limit: dict[str, datetime] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_confirmation_token() -> str:
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY env var must be set")
    random_part = secrets.token_hex(16)
    payload = f"{random_part}:new"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{random_part}.{sig}"


def _generate_hmac_token(prefix: str, booking_id: int) -> str:
    """Generate a deterministic HMAC token scoped to a prefix + booking ID.

    Prefix namespacing ensures a token issued for one purpose (e.g. cancel) cannot
    be replayed as another (e.g. reschedule), even if the raw value is extracted.
    """
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY env var must be set")
    return hmac.new(
        secret.encode(), f"{prefix}:{booking_id}".encode(), hashlib.sha256
    ).hexdigest()


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

    # Check one-time global exceptions
    global_exc = session.exec(
        select(AvailabilityException).where(
            AvailabilityException.date == local_date,
            AvailabilityException.is_global == True,
            AvailabilityException.recurrence == None,
        )
    ).first()
    if not global_exc:
        # Check recurring global exceptions
        recurring_global_excs = session.exec(
            select(AvailabilityException).where(
                AvailabilityException.is_global == True,
                AvailabilityException.recurrence != None,
            )
        ).all()
        global_exc = next(
            (e for e in recurring_global_excs if _matches_recurrence(local_date, e.recurrence, e.date)),
            None,
        )
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
    with Session(ORM().engine) as session:
        booking = session.get(Booking, booking_id)
        if not booking:
            logger.error("_send_booking_confirmation_email: booking %d not found", booking_id)
            return
        appt_type = session.get(AppointmentType, booking.appointment_type_id)
        config = session.get(TempleRecommendConfig, 1)
        interviewer = session.get(User, booking.interviewer_user_id)
        if not appt_type:
            logger.error("_send_booking_confirmation_email: appointment type not found for booking %d", booking_id)
            return
        if not config:
            logger.error("_send_booking_confirmation_email: TempleRecommendConfig not found for booking %d", booking_id)
            return
        if not interviewer:
            logger.error("_send_booking_confirmation_email: interviewer not found for booking %d", booking_id)
            return

        confirm_url = f"{BACKEND_BASE_URL}/appointment-bookings/confirm/{booking.confirmation_token}"
        cancel_url = f"{BACKEND_BASE_URL}/appointment-bookings/cancel/{booking.confirmation_token}"

        date_str = booking.booking_date.strftime("%A, %B %d, %Y")
        time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

        html_body, plain_body = render_booking_confirmation(
            member_name=booking.member_name,
            type_name=appt_type.name,
            date_str=date_str,
            time_str=time_str,
            location=config.location_name,
            interviewer_name=f"{interviewer.fname} {interviewer.lname}",
            confirm_url=confirm_url,
            cancel_url=cancel_url,
        )
        try:
            send_email(
                to_email=booking.member_email,
                to_name=booking.member_name,
                subject=f"Appointment Confirmation — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
                reply_to=get_reply_to_email(session),
            )
        except Exception:
            logger.error(
                "_send_booking_confirmation_email: email send failed for booking %d",
                booking_id,
                exc_info=True,
            )

        try:
            booking.notification_sent_at = datetime.utcnow()
            session.add(booking)
            session.commit()
        except Exception:
            logger.error(
                "_send_booking_confirmation_email: failed to update notification_sent_at for booking %d",
                booking_id,
                exc_info=True,
            )


def _send_interviewer_notification_email(booking_id: int):
    """Background task: notify the interviewer of a new booking."""
    from ..db.orm import ORM
    with Session(ORM().engine) as session:
        booking = session.get(Booking, booking_id)
        if not booking:
            logger.error("_send_interviewer_notification_email: booking %d not found", booking_id)
            return
        appt_type = session.get(AppointmentType, booking.appointment_type_id)
        config = session.get(TempleRecommendConfig, 1)
        interviewer = session.get(User, booking.interviewer_user_id)
        if not appt_type:
            logger.error("_send_interviewer_notification_email: appointment type not found for booking %d", booking_id)
            return
        if not config:
            logger.error("_send_interviewer_notification_email: TempleRecommendConfig not found for booking %d", booking_id)
            return
        if not interviewer or not interviewer.email:
            logger.error("_send_interviewer_notification_email: interviewer or interviewer email not found for booking %d", booking_id)
            return

        date_str = booking.booking_date.strftime("%A, %B %d, %Y")
        time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

        html_body, plain_body = render_interviewer_notification(
            member_name=booking.member_name,
            member_email=booking.member_email,
            member_phone=booking.member_phone,
            type_name=appt_type.name,
            date_str=date_str,
            time_str=time_str,
        )
        try:
            send_email(
                to_email=interviewer.email,
                to_name=f"{interviewer.fname} {interviewer.lname}",
                subject=f"New Appointment Booking — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
                reply_to=get_reply_to_email(session),
            )
        except Exception:
            logger.error(
                "_send_interviewer_notification_email: email send failed for booking %d",
                booking_id,
                exc_info=True,
            )


def _send_member_cancellation_email(booking_id: int):
    """Background task: send cancellation confirmation to member."""
    from ..db.orm import ORM
    with Session(ORM().engine) as session:
        booking = session.get(Booking, booking_id)
        if not booking:
            logger.error("_send_member_cancellation_email: booking %d not found", booking_id)
            return
        appt_type = session.get(AppointmentType, booking.appointment_type_id)
        config = session.get(TempleRecommendConfig, 1)
        if not appt_type:
            logger.error("_send_member_cancellation_email: appointment type not found for booking %d", booking_id)
            return
        if not config:
            logger.error("_send_member_cancellation_email: TempleRecommendConfig not found for booking %d", booking_id)
            return

        rebook_url = f"{FRONTEND_BASE_URL}/stake-info/temple-recommend"
        date_str = booking.booking_date.strftime("%A, %B %d, %Y")
        time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

        html_body, plain_body = render_member_cancellation_confirmation(
            member_name=booking.member_name,
            type_name=appt_type.name,
            date_str=date_str,
            time_str=time_str,
            rebook_url=rebook_url,
        )
        try:
            send_email(
                to_email=booking.member_email,
                to_name=booking.member_name,
                subject=f"Appointment Cancelled — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
                reply_to=get_reply_to_email(session),
            )
        except Exception:
            logger.error(
                "_send_member_cancellation_email: email send failed for booking %d",
                booking_id,
                exc_info=True,
            )


def _send_presidency_cancellation_email(booking_id: int, reason: Optional[str]):
    """Background task: send presidency cancellation notice to member."""
    from ..db.orm import ORM
    with Session(ORM().engine) as session:
        booking = session.get(Booking, booking_id)
        if not booking:
            logger.error("_send_presidency_cancellation_email: booking %d not found", booking_id)
            return
        appt_type = session.get(AppointmentType, booking.appointment_type_id)
        config = session.get(TempleRecommendConfig, 1)
        if not appt_type:
            logger.error("_send_presidency_cancellation_email: appointment type not found for booking %d", booking_id)
            return
        if not config:
            logger.error("_send_presidency_cancellation_email: TempleRecommendConfig not found for booking %d", booking_id)
            return

        rebook_url = f"{FRONTEND_BASE_URL}/stake-info/temple-recommend"
        date_str = booking.booking_date.strftime("%A, %B %d, %Y")
        time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

        html_body, plain_body = render_presidency_cancellation_notice(
            member_name=booking.member_name,
            type_name=appt_type.name,
            date_str=date_str,
            time_str=time_str,
            reason=reason,
            rebook_url=rebook_url,
        )
        try:
            send_email(
                to_email=booking.member_email,
                to_name=booking.member_name,
                subject=f"Appointment Cancelled by Presidency — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
                reply_to=get_reply_to_email(session),
            )
        except Exception:
            logger.error(
                "_send_presidency_cancellation_email: email send failed for booking %d",
                booking_id,
                exc_info=True,
            )


def _send_reschedule_member_email(new_booking_id: int, old_start_datetime: datetime):
    """Background task: send reschedule success email to the member."""
    from ..db.orm import ORM
    with Session(ORM().engine) as session:
        new_booking = session.get(Booking, new_booking_id)
        if not new_booking:
            logger.error("_send_reschedule_member_email: booking %d not found", new_booking_id)
            return
        appt_type = session.get(AppointmentType, new_booking.appointment_type_id)
        interviewer = session.get(User, new_booking.interviewer_user_id)
        if not appt_type:
            logger.error("_send_reschedule_member_email: appointment type not found for booking %d", new_booking_id)
            return
        if not interviewer:
            logger.error("_send_reschedule_member_email: interviewer not found for booking %d", new_booking_id)
            return

        cancel_url = f"{BACKEND_BASE_URL}/appointment-bookings/cancel/{new_booking.confirmation_token}"

        try:
            html_body, plain_body = render_booking_reschedule_success(
                member_name=new_booking.member_name,
                old_datetime=old_start_datetime,
                new_datetime=new_booking.start_datetime,
                appointment_type_name=appt_type.name,
                interviewer_name=f"{interviewer.fname} {interviewer.lname}",
                cancel_link=cancel_url,
            )
            send_email(
                to_email=new_booking.member_email,
                to_name=new_booking.member_name,
                subject=f"Appointment Rescheduled — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
                reply_to=get_reply_to_email(session),
            )
        except Exception:
            logger.error(
                "_send_reschedule_member_email: email send failed for booking %d",
                new_booking_id,
                exc_info=True,
            )


def _send_reschedule_interviewer_email(new_booking_id: int, old_start_datetime: datetime):
    """Background task: notify the interviewer of a rescheduled booking."""
    from ..db.orm import ORM
    with Session(ORM().engine) as session:
        new_booking = session.get(Booking, new_booking_id)
        if not new_booking:
            logger.error("_send_reschedule_interviewer_email: booking %d not found", new_booking_id)
            return
        appt_type = session.get(AppointmentType, new_booking.appointment_type_id)
        interviewer = session.get(User, new_booking.interviewer_user_id)
        if not appt_type:
            logger.error("_send_reschedule_interviewer_email: appointment type not found for booking %d", new_booking_id)
            return
        if not interviewer or not interviewer.email:
            logger.error("_send_reschedule_interviewer_email: interviewer or email not found for booking %d", new_booking_id)
            return

        try:
            html_body, plain_body = render_reschedule_interviewer_notification(
                interviewer_name=f"{interviewer.fname} {interviewer.lname}",
                member_name=new_booking.member_name,
                old_datetime=old_start_datetime,
                new_datetime=new_booking.start_datetime,
                appointment_type_name=appt_type.name,
            )
            send_email(
                to_email=interviewer.email,
                to_name=f"{interviewer.fname} {interviewer.lname}",
                subject=f"Appointment Rescheduled — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
                reply_to=get_reply_to_email(session),
            )
        except Exception:
            logger.error(
                "_send_reschedule_interviewer_email: email send failed for booking %d",
                new_booking_id,
                exc_info=True,
            )


def _create_calendar_event_for_booking(booking_id: int) -> None:
    from ..utils.google_calendar import create_event
    from ..db.orm import ORM
    with Session(ORM().engine) as session:
        booking = session.get(Booking, booking_id)
        if not booking:
            return
        appt_type = session.get(AppointmentType, booking.appointment_type_id)
        type_name = appt_type.name if appt_type else "Temple Recommend Interview"
        event_id = create_event(booking, type_name)
        if event_id:
            booking.calendar_event_id = event_id
            booking.calendar_sync_status = CalendarSyncStatus.SYNCED
        else:
            booking.calendar_sync_status = CalendarSyncStatus.SYNC_FAILED
            logger.error("[calendar] Failed to create calendar event for booking %d", booking_id)
        session.add(booking)
        session.commit()


def _delete_calendar_event_for_booking(event_id: Optional[str]) -> None:
    if not event_id:
        return
    from ..utils.google_calendar import delete_event
    delete_event(event_id)


def _update_calendar_after_reschedule(new_booking_id: int, old_event_id: Optional[str]):
    """Background task: update or create the Google Calendar event after a reschedule.

    If the old booking had a calendar event, patches it in place (preserves the event
    ID so subscribers receive an "event updated" notification rather than a new invite).
    If no prior event existed, creates a fresh one and persists the ID on the new booking.
    """
    from ..db.orm import ORM
    from ..utils.google_calendar import create_event, update_event
    with Session(ORM().engine) as session:
        new_booking = session.get(Booking, new_booking_id)
        if not new_booking:
            logger.error("_update_calendar_after_reschedule: booking %d not found", new_booking_id)
            return
        appt_type = session.get(AppointmentType, new_booking.appointment_type_id)
        type_name = appt_type.name if appt_type else "Temple Recommend Interview"

        if old_event_id:
            # Patch the existing event — subscribers get an "event updated" notification.
            success = update_event(old_event_id, new_booking, type_name)
            new_booking.calendar_sync_status = CalendarSyncStatus.SYNCED if success else CalendarSyncStatus.SYNC_FAILED
            if new_booking.calendar_event_id != old_event_id:
                new_booking.calendar_event_id = old_event_id
        else:
            # No prior event; create a new one for the new slot.
            event_id = create_event(new_booking, type_name)
            if event_id:
                new_booking.calendar_event_id = event_id
                new_booking.calendar_sync_status = CalendarSyncStatus.SYNCED
            else:
                new_booking.calendar_sync_status = CalendarSyncStatus.SYNC_FAILED
                logger.warning("[calendar] Failed to create calendar event for new booking %d", new_booking.id)
        session.add(new_booking)
        session.commit()


def _send_already_confirmed_email(booking_id: int):
    """Background task: send an already-confirmed details email to the member.

    Used by POST /resend-confirmation when the booking is already CONFIRMED.
    Omits the email-confirm link; includes cancel and reschedule links.
    """
    from ..db.orm import ORM
    with Session(ORM().engine) as session:
        booking = session.get(Booking, booking_id)
        if not booking:
            logger.error("_send_already_confirmed_email: booking %d not found", booking_id)
            return
        appt_type = session.get(AppointmentType, booking.appointment_type_id)
        config = session.get(TempleRecommendConfig, 1)
        interviewer = session.get(User, booking.interviewer_user_id)
        if not appt_type:
            logger.error("_send_already_confirmed_email: appointment type not found for booking %d", booking_id)
            return
        if not config:
            logger.error("_send_already_confirmed_email: TempleRecommendConfig not found for booking %d", booking_id)
            return
        if not interviewer:
            logger.error("_send_already_confirmed_email: interviewer not found for booking %d", booking_id)
            return

        cancel_url = f"{BACKEND_BASE_URL}/appointment-bookings/cancel/{booking.confirmation_token}"
        reschedule_url: Optional[str] = (
            f"{BACKEND_BASE_URL}/appointment-bookings/reschedule/{booking.reschedule_token}"
            if booking.reschedule_token else None
        )

        date_str = booking.booking_date.strftime("%A, %B %d, %Y")
        time_str = _format_time_str(booking.start_minute_of_day, config.timezone)

        try:
            html_body, plain_body = render_booking_already_confirmed(
                member_name=booking.member_name,
                type_name=appt_type.name,
                date_str=date_str,
                time_str=time_str,
                location=config.location_name,
                interviewer_name=f"{interviewer.fname} {interviewer.lname}",
                cancel_url=cancel_url,
                reschedule_url=reschedule_url,
            )
            send_email(
                to_email=booking.member_email,
                to_name=booking.member_name,
                subject=f"Your Appointment Details — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
                reply_to=get_reply_to_email(session),
            )
        except Exception:
            logger.error(
                "_send_already_confirmed_email: email send failed for booking %d",
                booking_id,
                exc_info=True,
            )


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

    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    def __init__(self, **data):
        super().__init__(**data)
        if not _EMAIL_RE.match(self.member_email):
            raise ValueError("member_email is not a valid email address")


class AdminCancelBody(SQLModel):
    cancellation_reason: Optional[str] = None


class StatusUpdateBody(SQLModel):
    status: str


class RescheduleRequest(SQLModel):
    reschedule_token: str
    new_slot_start: datetime
    appointment_type_id: int


class ResendConfirmationRequest(SQLModel):
    member_email: EmailStr


class RescheduleInfoResponse(SQLModel):
    member_name: str
    member_email: str
    member_phone: str
    appointment_type_id: int
    appointment_type_name: str


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
    # Normalize to UTC then strip tz to get a naive UTC datetime
    _raw = body.slot_datetime_utc
    slot_utc = (_raw.astimezone(timezone.utc) if _raw.tzinfo is not None else _raw).replace(tzinfo=None)

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
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Response:
    """Confirm a booking via token link from the confirmation email. Public endpoint."""
    booking = session.exec(
        select(Booking).where(Booking.confirmation_token == token)
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == BookingStatus.CONFIRMED:
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/stake-info/temple-recommend?confirmed=1",
            status_code=302,
        )

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
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise HTTPException(status_code=503, detail="Unable to process your request. Please try again.")

    background_tasks.add_task(_create_calendar_event_for_booking, booking.id)

    return RedirectResponse(
        url=f"{FRONTEND_BASE_URL}/stake-info/temple-recommend?confirmed=1",
        status_code=302,
    )


@router.get("/cancel/{token}")
def cancel_booking_by_token(
    token: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Response:
    """Cancel a booking via token link. Must be CONFIRMED status. Public endpoint."""
    booking = session.exec(
        select(Booking).where(Booking.confirmation_token == token)
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # A RESCHEDULED booking means the member clicked a stale cancel link from their
    # original confirmation email. The new booking has its own cancel link.
    if booking.status == BookingStatus.RESCHEDULED:
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/appointments/cancelled?reason=rescheduled",
            status_code=302,
        )

    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail=f"Only confirmed bookings can be cancelled this way (current status: {booking.status.value}).",
        )

    calendar_event_id = booking.calendar_event_id
    booking.status = BookingStatus.CANCELLED_BY_MEMBER
    booking.cancelled_at = datetime.utcnow()
    session.add(booking)
    session.add(BookingAuditLog(
        booking_id=booking.id,
        event_type="cancelled_by_member",
        actor_user_id=None,
    ))
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise HTTPException(status_code=503, detail="Unable to process your request. Please try again.")

    background_tasks.add_task(_send_member_cancellation_email, booking.id)
    background_tasks.add_task(_delete_calendar_event_for_booking, calendar_event_id)

    return RedirectResponse(
        url=f"{FRONTEND_BASE_URL}/appointments/cancelled",
        status_code=302,
    )


@router.get("/reschedule-info", response_model=RescheduleInfoResponse)
def get_reschedule_info(
    token: str = Query(...),
    session: Session = Depends(get_session),
) -> RescheduleInfoResponse:
    """Return member and appointment details for a reschedule token. Public endpoint."""
    booking = session.exec(
        select(Booking).where(Booking.reschedule_token == token)
    ).first()
    if not booking:
        raise HTTPException(status_code=404)

    expected = _generate_hmac_token("reschedule", booking.id)
    if not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=404)

    if booking.status == BookingStatus.RESCHEDULED:
        raise HTTPException(status_code=409, detail="This appointment has already been rescheduled.")

    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(status_code=409, detail="This booking cannot be rescheduled in its current state.")

    config = session.get(TempleRecommendConfig, 1)
    if not config:
        raise HTTPException(status_code=500, detail="Temple recommend config not found")

    if booking.start_datetime <= datetime.utcnow() + timedelta(hours=config.booking_cutoff_hours):
        raise HTTPException(
            status_code=409,
            detail="This appointment is within the booking cutoff window and can no longer be rescheduled.",
        )

    appt_type = session.get(AppointmentType, booking.appointment_type_id)
    if not appt_type:
        raise HTTPException(status_code=404)

    return RescheduleInfoResponse(
        member_name=booking.member_name,
        member_email=booking.member_email,
        member_phone=booking.member_phone,
        appointment_type_id=booking.appointment_type_id,
        appointment_type_name=appt_type.name,
    )


@router.post("/reschedule")
def reschedule_booking(
    body: RescheduleRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> dict:
    """Reschedule an existing confirmed booking. Unauthenticated — token IS the auth.

    Atomically marks the old booking RESCHEDULED and creates a new CONFIRMED booking
    in a single transaction, then dispatches calendar and email tasks.
    """
    # Look up booking by indexed reschedule_token column.
    old_booking = session.exec(
        select(Booking).where(Booking.reschedule_token == body.reschedule_token)
    ).first()
    if not old_booking:
        raise HTTPException(status_code=404, detail="Booking not found or access denied.")

    # Re-verify HMAC (defense in depth — rejects tokens from wrong namespace or tampered DB).
    expected_token = _generate_hmac_token("reschedule", old_booking.id)
    if not hmac.compare_digest(body.reschedule_token, expected_token):
        raise HTTPException(status_code=403, detail="Booking not found or access denied.")

    # Enforce booking state machine constraints.
    if old_booking.status == BookingStatus.PENDING_EMAIL_CONFIRM:
        raise HTTPException(
            status_code=409,
            detail="Please confirm your original booking via the email link before rescheduling.",
        )
    if old_booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(
            status_code=409,
            detail="This booking cannot be rescheduled in its current state.",
        )

    config = session.get(TempleRecommendConfig, 1)
    if not config:
        raise HTTPException(status_code=500, detail="Temple recommend config not found")

    # Normalize new slot to naive UTC.
    _raw = body.new_slot_start
    new_slot_utc = (_raw.astimezone(timezone.utc) if _raw.tzinfo is not None else _raw).replace(tzinfo=None)

    now_utc = datetime.utcnow()

    # Apply the same cutoff and window checks as the original booking endpoint.
    cutoff_dt = now_utc + timedelta(hours=config.booking_cutoff_hours)
    if new_slot_utc <= cutoff_dt:
        raise HTTPException(
            status_code=422,
            detail="The selected slot is within the booking cutoff window.",
        )

    max_booking_date = (now_utc + timedelta(days=config.booking_window_days)).date()
    if new_slot_utc.date() > max_booking_date:
        raise HTTPException(
            status_code=422,
            detail=f"Slot is beyond the {config.booking_window_days}-day booking window.",
        )

    appt_type = session.get(AppointmentType, body.appointment_type_id)
    if not appt_type or not appt_type.is_active:
        raise HTTPException(status_code=404, detail="Appointment type not found or inactive")

    new_interviewer_id = _find_interviewer_for_slot(session, new_slot_utc, body.appointment_type_id)
    if new_interviewer_id is None:
        raise HTTPException(status_code=422, detail="No interviewer available for the requested slot.")

    # Compute display fields for the new slot.
    tz = ZoneInfo(config.timezone)
    local_dt = new_slot_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    new_booking_date = local_dt.date()
    new_start_minute = local_dt.hour * 60 + local_dt.minute
    new_end_minute = new_start_minute + appt_type.duration_mins
    new_end_utc = new_slot_utc + timedelta(minutes=appt_type.duration_mins)

    # Capture data needed for post-commit tasks before the transaction mutates state.
    old_start_datetime = old_booking.start_datetime
    old_calendar_event_id = old_booking.calendar_event_id

    # --- Atomic transaction ---------------------------------------------------
    # 1. Transition old booking to RESCHEDULED and strip its calendar ownership.
    old_booking.status = BookingStatus.RESCHEDULED
    old_booking.cancelled_at = now_utc
    old_booking.calendar_event_id = None  # Ownership transferred to new_booking below.
    session.add(old_booking)

    # 2. Create new confirmed booking copying all member contact fields.
    new_confirmation_token = _generate_confirmation_token()
    new_booking = Booking(
        appointment_type_id=body.appointment_type_id,
        interviewer_user_id=new_interviewer_id,
        member_name=old_booking.member_name,
        member_email=old_booking.member_email,
        member_phone=old_booking.member_phone,
        booking_date=new_booking_date,
        start_minute_of_day=new_start_minute,
        end_minute_of_day=new_end_minute,
        start_datetime=new_slot_utc,
        end_datetime=new_end_utc,
        status=BookingStatus.CONFIRMED,
        # confirmation_token doubles as the cancel token in the current model.
        confirmation_token=new_confirmation_token,
        # Transfer calendar event ownership to the new booking so subscribers receive an "event updated" notification rather than a new invite.
        calendar_event_id=old_calendar_event_id,
        calendar_sync_status=CalendarSyncStatus.PENDING if old_calendar_event_id else CalendarSyncStatus.NOT_APPLICABLE,
    )
    session.add(new_booking)

    try:
        # Flush to obtain new_booking.id before generating the reschedule_token.
        session.flush()

        # 3. Generate the reschedule_token for the new booking (requires its DB id).
        new_booking.reschedule_token = _generate_hmac_token("reschedule", new_booking.id)
        session.add(new_booking)

        # 4. Write audit trail for both state transitions.
        session.add(BookingAuditLog(
            booking_id=old_booking.id,
            event_type="rescheduled",
            actor_user_id=None,
            event_metadata={"from": "CONFIRMED", "to": "RESCHEDULED", "new_booking_id": new_booking.id},
        ))
        session.add(BookingAuditLog(
            booking_id=new_booking.id,
            event_type="created_by_reschedule",
            actor_user_id=None,
            event_metadata={"from": None, "to": "CONFIRMED", "old_booking_id": old_booking.id},
        ))

        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="That slot was just taken — please choose another time.",
        )
    # -------------------------------------------------------------------------

    session.refresh(new_booking)

    # Dispatch post-commit background tasks (calendar + emails).
    background_tasks.add_task(
        _update_calendar_after_reschedule, new_booking.id, old_calendar_event_id
    )
    background_tasks.add_task(_send_reschedule_member_email, new_booking.id, old_start_datetime)
    background_tasks.add_task(_send_reschedule_interviewer_email, new_booking.id, old_start_datetime)

    return {
        "booking_id": new_booking.id,
        "status": "CONFIRMED",
        "start_datetime": new_booking.start_datetime.isoformat(),
    }


@router.get("/reschedule/{token}")
def get_reschedule_redirect(
    token: str,
    session: Session = Depends(get_session),
) -> Response:
    """Validate a reschedule token and redirect to the frontend reschedule page.

    This is the link target delivered in confirmation emails. Unauthenticated.
    """
    booking = session.exec(
        select(Booking).where(Booking.reschedule_token == token)
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Reschedule link not found.")

    if booking.status != BookingStatus.CONFIRMED:
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/appointments/reschedule?error=invalid_state",
            status_code=302,
        )

    # Re-verify HMAC to ensure the token was generated with the correct secret.
    expected_token = _generate_hmac_token("reschedule", booking.id)
    if not hmac.compare_digest(token, expected_token):
        return RedirectResponse(
            url=f"{FRONTEND_BASE_URL}/appointments/reschedule?error=invalid_token",
            status_code=302,
        )

    return RedirectResponse(
        url=f"{FRONTEND_BASE_URL}/appointments/reschedule?token={token}&type_id={booking.appointment_type_id}",
        status_code=302,
    )


@router.post("/resend-confirmation")
def resend_confirmation(
    body: ResendConfirmationRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> dict:
    """Resend a confirmation email for a pending or confirmed booking. Unauthenticated.

    Always returns the same 200 message regardless of whether a booking is found,
    to avoid leaking whether a given email address has a booking in the system.
    """
    _PRIVACY_SAFE_RESPONSE = {"detail": "If a booking was found, a confirmation email has been sent."}

    # Simple in-memory rate limit: 60 seconds per email address.
    email_key = body.member_email.lower()
    now = datetime.utcnow()
    last_request = _resend_rate_limit.get(email_key)
    if last_request and (now - last_request).total_seconds() < 60:
        raise HTTPException(
            status_code=429,
            detail="Please wait before requesting another confirmation email.",
        )
    _resend_rate_limit[email_key] = now
    if len(_resend_rate_limit) > 100:
        stale = [k for k, v in _resend_rate_limit.items() if (now - v).total_seconds() > 60]
        for k in stale:
            del _resend_rate_limit[k]

    # Find the most recent booking in a resendable state.
    booking = session.exec(
        select(Booking)
        .where(
            Booking.member_email == body.member_email,
            Booking.status.in_([BookingStatus.PENDING_EMAIL_CONFIRM, BookingStatus.CONFIRMED]),
        )
        .order_by(Booking.created_at.desc())
        .limit(1)
    ).first()

    if not booking:
        # Return the same message — do not reveal that no booking exists.
        return _PRIVACY_SAFE_RESPONSE

    if booking.status == BookingStatus.PENDING_EMAIL_CONFIRM:
        # Resend the original confirmation email (member needs to click confirm link).
        background_tasks.add_task(_send_booking_confirmation_email, booking.id)
    else:
        # Booking is CONFIRMED — send appointment details with cancel/reschedule links,
        # but omit the confirm link since it is no longer needed.
        background_tasks.add_task(_send_already_confirmed_email, booking.id)

    return _PRIVACY_SAFE_RESPONSE


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
        try:
            valid_statuses = [BookingStatus(s) for s in status]
        except ValueError as e:
            raise HTTPException(status_code=422, detail=f"Invalid status value: {e}")
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

    calendar_event_id = booking.calendar_event_id
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
    background_tasks.add_task(_delete_calendar_event_for_booking, calendar_event_id)

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
