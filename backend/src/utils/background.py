"""Background loop: 24-hour appointment reminders.

Registered in app.py lifespan as a distinct asyncio.create_task separate from
expire_pending_bookings_loop.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta

from sqlmodel import Session, select

logger = logging.getLogger("application")


def process_reminders(session: Session) -> None:
    """Process all confirmed bookings in the 20-28h reminder window.

    Accepts an open Session so the function is directly testable without spawning
    a new ORM connection. Called by send_appointment_reminders_loop on each tick.

    Idempotency: reminder_sent_at is stamped and committed BEFORE calling send_email.
    If the process restarts mid-iteration the booking will not be re-queued because
    the stamp is already committed.
    """
    from ..models import Booking, BookingStatus, AppointmentType, User
    from .email import send_email, render_booking_reminder

    now = datetime.utcnow()
    window_start = now + timedelta(hours=20)
    window_end = now + timedelta(hours=28)

    bookings = session.exec(
        select(Booking).where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.start_datetime >= window_start,
            Booking.start_datetime <= window_end,
            Booking.reminder_sent_at == None,  # noqa: E711
        )
    ).all()

    for booking in bookings:
        appt_type = session.get(AppointmentType, booking.appointment_type_id)
        interviewer = session.get(User, booking.interviewer_user_id)

        if not appt_type or not interviewer:
            logger.error(
                "[reminders] Missing appointment type or interviewer for booking %s; skipping",
                booking.id,
            )
            continue

        # Stamp BEFORE sending — idempotency guard.
        # If send_email raises, reminder_sent_at retains this value
        # and the booking will NOT be re-queued on the next tick.
        booking.reminder_sent_at = datetime.utcnow()
        session.add(booking)
        session.commit()

        api_base = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
        cancel_link = (
            f"{api_base}/appointment-bookings/cancel/{booking.confirmation_token}"
        )
        interviewer_name = f"{interviewer.fname} {interviewer.lname}"

        try:
            html_body, plain_body = render_booking_reminder(
                member_name=booking.member_name,
                start_datetime=booking.start_datetime,
                appointment_type_name=appt_type.name,
                interviewer_name=interviewer_name,
                cancel_link=cancel_link,
            )
            send_email(
                to_email=booking.member_email,
                to_name=booking.member_name,
                subject=f"Appointment Reminder — {appt_type.name}",
                html_body=html_body,
                plain_body=plain_body,
            )
        except Exception as exc:
            logger.error(
                "[reminders] Failed to send reminder for booking %s: %s",
                booking.id,
                exc,
            )


async def send_appointment_reminders_loop() -> None:
    """Poll every 30 minutes and send reminders for appointments 20–28 hours away.

    Delivery window rationale: the 8-hour band (20h–28h) ensures at least one tick
    catches each appointment even if the process restarts within a 24-hour cycle.
    A narrower window (e.g. 23–25h) would miss appointments if the server is down
    when that window passes.

    The loop body is extracted to process_reminders(session) for testability.
    """
    logger.info("[reminders] Appointment reminder loop started (20–28h window, 30-min polling)")
    from ..db.orm import ORM

    while True:
        await asyncio.sleep(1800)
        try:
            with Session(ORM().engine) as session:
                process_reminders(session)
        except Exception:
            logger.error("[reminders] send_appointment_reminders_loop: error", exc_info=True)
