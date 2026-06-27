"""Tests for the 24-hour appointment reminder background task.

All tests call process_reminders(session) directly — no asyncio required.

send_email and render_booking_reminder are lazy imports inside process_reminders
(via `from .email import ...`), so they must be patched at the source module
(src.utils.email) rather than at src.utils.background.
"""
import inspect
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from sqlmodel import Session

import src.app as _app_module
from src.models import (
    AppointmentType,
    Booking,
    BookingStatus,
    User,
)
from src.utils.background import process_reminders

from .conftest import (
    cleanup_booking,
    ensure_temple_config,
    get_next_weekday,
    make_appointment_type,
    make_interviewer_with_calling,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _make_reminder_booking(
    session: Session,
    appt: AppointmentType,
    user: User,
    start_datetime: datetime,
    token_suffix: str = "reminder",
    reminder_sent_at: datetime = None,
) -> Booking:
    """Insert a CONFIRMED booking at an explicit UTC start_datetime."""
    end_datetime = start_datetime + timedelta(minutes=30)
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Reminder Member",
        member_email="reminder@example.com",
        member_phone="555-7777",
        booking_date=start_datetime.date(),
        start_minute_of_day=start_datetime.hour * 60 + start_datetime.minute,
        end_minute_of_day=start_datetime.hour * 60 + start_datetime.minute + 30,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        status=BookingStatus.CONFIRMED,
        confirmation_token=f"confirm-{token_suffix}",
        reminder_sent_at=reminder_sent_at,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


# ---------------------------------------------------------------------------
# Happy-path: booking in the 20-28h window
# ---------------------------------------------------------------------------


def test_reminder_sent_in_window(db_session: Session, userpass):
    """A CONFIRMED booking 22h away with reminder_sent_at=None must receive a reminder."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder In Window")
    make_interviewer_with_calling(db_session, user, prefix="ReminderWindow")

    start_dt = datetime.utcnow() + timedelta(hours=22)
    booking = _make_reminder_booking(db_session, appt, user, start_dt, "in-window")

    # send_email and render_booking_reminder are lazy-imported inside process_reminders
    # via `from .email import ...`, so we patch them at the email module.
    with patch("src.utils.email.send_email") as mock_send, \
         patch("src.utils.email.render_booking_reminder",
               return_value=("<p>html</p>", "plain")):
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    assert stamp is not None, "reminder_sent_at should have been stamped"
    mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# Out-of-window: too early (> 28h away)
# ---------------------------------------------------------------------------


def test_reminder_not_sent_outside_window_early(db_session: Session, userpass):
    """A booking 30h away (outside the 28h upper bound) must not receive a reminder."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder Too Early")
    make_interviewer_with_calling(db_session, user, prefix="ReminderEarly")

    start_dt = datetime.utcnow() + timedelta(hours=30)
    booking = _make_reminder_booking(db_session, appt, user, start_dt, "too-early")

    with patch("src.utils.email.send_email") as mock_send:
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    assert stamp is None, "reminder_sent_at must remain None outside the window"
    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# Out-of-window: too late (< 20h away)
# ---------------------------------------------------------------------------


def test_reminder_not_sent_outside_window_late(db_session: Session, userpass):
    """A booking 10h away (below the 20h lower bound) must not receive a reminder."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder Too Late")
    make_interviewer_with_calling(db_session, user, prefix="ReminderLate")

    start_dt = datetime.utcnow() + timedelta(hours=10)
    booking = _make_reminder_booking(db_session, appt, user, start_dt, "too-late")

    with patch("src.utils.email.send_email") as mock_send:
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    assert stamp is None
    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# Idempotency: already stamped
# ---------------------------------------------------------------------------


def test_reminder_not_sent_if_already_stamped(db_session: Session, userpass):
    """A booking in the window but with reminder_sent_at already set must be skipped."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder Already Stamped")
    make_interviewer_with_calling(db_session, user, prefix="ReminderStamped")

    start_dt = datetime.utcnow() + timedelta(hours=22)
    prior_stamp = datetime.utcnow() - timedelta(hours=1)
    booking = _make_reminder_booking(
        db_session, appt, user, start_dt, "already-stamped", reminder_sent_at=prior_stamp
    )

    with patch("src.utils.email.send_email") as mock_send:
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    final_stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    mock_send.assert_not_called()
    assert final_stamp is not None
    assert abs((final_stamp - prior_stamp).total_seconds()) < 2, (
        "The existing stamp must not be overwritten"
    )


# ---------------------------------------------------------------------------
# Failure idempotency: send_email raises, stamp must persist
# ---------------------------------------------------------------------------


def test_reminder_email_failure_does_not_reset_stamp(db_session: Session, userpass):
    """If send_email raises after the stamp is committed, reminder_sent_at must be retained."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder Email Failure")
    make_interviewer_with_calling(db_session, user, prefix="ReminderFail")

    start_dt = datetime.utcnow() + timedelta(hours=22)
    booking = _make_reminder_booking(db_session, appt, user, start_dt, "email-failure")

    with patch("src.utils.email.send_email", side_effect=Exception("SMTP error")), \
         patch("src.utils.email.render_booking_reminder",
               return_value=("<p>html</p>", "plain")):
        # process_reminders must not propagate the exception.
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    # The stamp must be set — it is committed BEFORE send_email is attempted.
    assert stamp is not None, (
        "reminder_sent_at must be stamped even when send_email subsequently raises"
    )


# ---------------------------------------------------------------------------
# Architecture: reminder loop is a distinct asyncio.create_task
# ---------------------------------------------------------------------------


def test_reminder_loop_is_separate_task():
    """Both reminder and expiry loops must be registered as distinct asyncio.create_task calls.

    Inspects the source of app.py's lifespan function to ensure the architectural
    constraint is maintained: each background loop runs in its own task.
    """
    source = inspect.getsource(_app_module)

    assert "send_appointment_reminders_loop" in source, (
        "send_appointment_reminders_loop must be referenced in app.py"
    )
    assert "expire_pending_bookings_loop" in source, (
        "expire_pending_bookings_loop must be referenced in app.py"
    )

    # Count distinct asyncio.create_task calls — there must be at least two.
    task_call_count = source.count("asyncio.create_task(")
    assert task_call_count >= 2, (
        f"Expected at least 2 asyncio.create_task() calls in app.py; found {task_call_count}. "
        "Both loops must be registered as separate tasks."
    )

    # Verify both names appear on their own create_task lines.
    lines = source.splitlines()
    reminder_task_lines = [
        ln for ln in lines
        if "create_task" in ln and "send_appointment_reminders_loop" in ln
    ]
    expire_task_lines = [
        ln for ln in lines
        if "create_task" in ln and "expire_pending_bookings_loop" in ln
    ]
    assert reminder_task_lines, (
        "send_appointment_reminders_loop must be wrapped in asyncio.create_task() in app.py"
    )
    assert expire_task_lines, (
        "expire_pending_bookings_loop must be wrapped in asyncio.create_task() in app.py"
    )


# ---------------------------------------------------------------------------
# M-9: Exact window-boundary reminder tests
# ---------------------------------------------------------------------------


def test_reminder_at_lower_bound_20h(db_session: Session, userpass):
    """A CONFIRMED booking just above the 20h lower bound must receive a reminder.

    A 5-second buffer over the nominal 20h boundary absorbs test-execution latency:
    process_reminders() recomputes utcnow() after the booking is inserted, so
    window_start is slightly later than the booking's start_datetime would be with
    an exact timedelta(hours=20). The 5-second pad keeps the booking inside the window
    without materially changing what the test verifies.
    """
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder Lower Bound 20h")
    make_interviewer_with_calling(db_session, user, prefix="ReminderLowerBound")

    # Slightly above 20h to absorb the microseconds between booking creation and
    # the window_start computation inside process_reminders.
    start_dt = datetime.utcnow() + timedelta(hours=20, seconds=5)
    booking = _make_reminder_booking(db_session, appt, user, start_dt, "lower-bound-20h")

    with patch("src.utils.email.send_email") as mock_send, \
         patch("src.utils.email.render_booking_reminder",
               return_value=("<p>html</p>", "plain")):
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    assert stamp is not None, "reminder_sent_at must be set for a booking at the 20h lower bound"
    mock_send.assert_called_once()


def test_reminder_at_upper_bound_28h(db_session: Session, userpass):
    """A CONFIRMED booking at exactly the 28h upper bound must receive a reminder.

    A booking created at utcnow() + 28h is strictly inside the window when
    process_reminders() runs (window_end = that later utcnow() + 28h), so the
    <=  condition is satisfied without any additional buffer.
    """
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder Upper Bound 28h")
    make_interviewer_with_calling(db_session, user, prefix="ReminderUpperBound")

    start_dt = datetime.utcnow() + timedelta(hours=28)
    booking = _make_reminder_booking(db_session, appt, user, start_dt, "upper-bound-28h")

    with patch("src.utils.email.send_email") as mock_send, \
         patch("src.utils.email.render_booking_reminder",
               return_value=("<p>html</p>", "plain")):
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    assert stamp is not None, "reminder_sent_at must be set for a booking at the 28h upper bound"
    mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# M-11: Non-CONFIRMED booking in reminder window gets no reminder
# ---------------------------------------------------------------------------


def test_reminder_not_sent_for_rescheduled(db_session: Session, userpass):
    """A RESCHEDULED booking inside the 20-28h window must not receive a reminder.

    process_reminders() filters on status == CONFIRMED, so a RESCHEDULED booking
    must be excluded even when its start_datetime falls inside the window.
    """
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Reminder Not Sent Rescheduled")
    make_interviewer_with_calling(db_session, user, prefix="ReminderNotRescheduled")

    start_dt = datetime.utcnow() + timedelta(hours=22)
    booking = _make_reminder_booking(db_session, appt, user, start_dt, "not-sent-rescheduled")

    # Transition to RESCHEDULED before the reminder loop runs.
    booking.status = BookingStatus.RESCHEDULED
    db_session.add(booking)
    db_session.commit()

    with patch("src.utils.email.send_email") as mock_send:
        process_reminders(db_session)

    db_session.expire_all()
    refreshed = db_session.get(Booking, booking.id)
    stamp = refreshed.reminder_sent_at if refreshed else None
    if refreshed:
        cleanup_booking(db_session, refreshed)

    mock_send.assert_not_called()
    assert stamp is None, "reminder_sent_at must remain None for a RESCHEDULED booking"
