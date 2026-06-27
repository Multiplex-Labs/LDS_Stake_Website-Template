"""Tests for POST /appointment-bookings/reschedule.

Verifies token validation, state-machine guards, cutoff enforcement,
atomic rollback on slot conflict, and calendar background task dispatch.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import (
    AppointmentType,
    AvailabilityWindow,
    Booking,
    BookingAuditLog,
    BookingStatus,
    TempleRecommendConfig,
    User,
)
from src.routers.appointment_bookings import _generate_hmac_token

from .conftest import (
    build_slot_utc,
    cleanup_booking,
    ensure_temple_config,
    get_next_weekday,
    make_appointment_type,
    make_availability_window,
    make_interviewer_with_calling,
)


# ---------------------------------------------------------------------------
# Module-level fixture: suppress real email API calls for all reschedule tests.
#
# The background task functions in appointment_bookings.py import send_email via
# `from ..utils import send_email` at module load time, so we must patch the name
# in the appointment_bookings module namespace — not at src.utils.email.
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _no_email():
    """Suppress all email sends triggered by the reschedule endpoint's background tasks."""
    with patch("src.routers.appointment_bookings.send_email"):
        yield


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _make_confirmed_booking(
    session: Session,
    appt: AppointmentType,
    user: User,
    target_day,
    slot_utc: datetime,
    token_suffix: str = "resched-base",
) -> Booking:
    """Insert a CONFIRMED booking with a valid HMAC reschedule_token.

    The reschedule_token is generated using the same HMAC scheme as the router,
    so token-validation tests work correctly against the real endpoint logic.
    """
    confirmation_token = f"confirm-{token_suffix}"
    end_utc = slot_utc + timedelta(minutes=30)
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Reschedule Member",
        member_email="resched@example.com",
        member_phone="555-1111",
        booking_date=target_day,
        start_minute_of_day=slot_utc.hour * 60 + slot_utc.minute,
        end_minute_of_day=slot_utc.hour * 60 + slot_utc.minute + 30,
        start_datetime=slot_utc,
        end_datetime=end_utc,
        status=BookingStatus.CONFIRMED,
        confirmation_token=confirmation_token,
    )
    session.add(booking)
    session.flush()  # Obtain the primary key before computing the HMAC token.
    booking.reschedule_token = _generate_hmac_token("reschedule", booking.id)
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def _reschedule_payload(booking: Booking, new_slot_utc: datetime, appt_type_id: int) -> dict:
    return {
        "reschedule_token": booking.reschedule_token,
        "new_slot_start": new_slot_utc.isoformat(),
        "new_slot_end": (new_slot_utc + timedelta(minutes=30)).isoformat(),
        "appointment_type_id": appt_type_id,
    }


# ---------------------------------------------------------------------------
# test_reschedule_happy_path
# ---------------------------------------------------------------------------


def test_reschedule_happy_path(client: TestClient, db_session: Session, userpass):
    """Full reschedule flow: old booking becomes RESCHEDULED, new booking is CONFIRMED."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Happy Path Reschedule")
    make_interviewer_with_calling(db_session, user, prefix="HappyResched")

    target_day = get_next_weekday(1)  # Monday
    window = make_availability_window(
        db_session, user.id, day_of_week=1, start_minute=540, end_minute=660
    )

    old_slot_utc = build_slot_utc(target_day, 9, 0)
    new_slot_utc = build_slot_utc(target_day, 10, 0)

    old_booking = _make_confirmed_booking(
        db_session, appt, user, target_day, old_slot_utc, token_suffix="happy-old"
    )
    old_booking_id = old_booking.id
    # Capture attributes from old_booking BEFORE expire_all() evicts them.
    expected_member_email = old_booking.member_email

    payload = _reschedule_payload(old_booking, new_slot_utc, appt.id)
    response = client.post("/appointment-bookings/reschedule", json=payload)

    # Reload from DB before cleanup so attribute access works.
    db_session.expire_all()
    old_refreshed = db_session.get(Booking, old_booking_id)
    new_booking = db_session.exec(
        select(Booking).where(
            Booking.start_datetime == new_slot_utc,
            Booking.interviewer_user_id == user.id,
        )
    ).first()

    # Capture status/email BEFORE cleanup deletes the rows.
    old_status = old_refreshed.status if old_refreshed else None
    new_status = new_booking.status if new_booking else None
    new_email = new_booking.member_email if new_booking else None

    # Cleanup.
    if new_booking:
        cleanup_booking(db_session, new_booking)
    if old_refreshed:
        cleanup_booking(db_session, old_refreshed)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CONFIRMED"
    assert "booking_id" in data
    assert old_status == BookingStatus.RESCHEDULED
    assert new_status == BookingStatus.CONFIRMED
    assert new_email == expected_member_email


# ---------------------------------------------------------------------------
# test_reschedule_atomic_rollback
# ---------------------------------------------------------------------------


def test_reschedule_atomic_rollback(client: TestClient, db_session: Session, userpass):
    """Slot conflict on commit must roll back: old booking stays CONFIRMED."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Atomic Rollback Reschedule")
    make_interviewer_with_calling(db_session, user, prefix="AtomicRollback")

    target_day = get_next_weekday(2)  # Wednesday
    window = make_availability_window(
        db_session, user.id, day_of_week=2, start_minute=540, end_minute=720
    )

    # Booking at slot A (will be rescheduled).
    slot_a_utc = build_slot_utc(target_day, 9, 0)
    old_booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_a_utc, token_suffix="atomic-old"
    )

    # Blocker booking at slot B (same interviewer, conflicts with reschedule target).
    slot_b_utc = build_slot_utc(target_day, 10, 0)
    blocker = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Blocker Member",
        member_email="blocker@example.com",
        member_phone="555-2222",
        booking_date=target_day,
        start_minute_of_day=600,
        end_minute_of_day=630,
        start_datetime=slot_b_utc,
        end_datetime=slot_b_utc + timedelta(minutes=30),
        status=BookingStatus.CONFIRMED,
        confirmation_token="blocker-token-atomic-rollback",
    )
    db_session.add(blocker)
    db_session.commit()
    db_session.refresh(blocker)

    old_booking_id = old_booking.id

    # Submit reschedule to slot B — UNIQUE constraint fires on commit.
    payload = _reschedule_payload(old_booking, slot_b_utc, appt.id)
    response = client.post("/appointment-bookings/reschedule", json=payload)

    # After rollback, old_booking must remain CONFIRMED.
    db_session.expire_all()
    old_refreshed = db_session.get(Booking, old_booking_id)
    old_status = old_refreshed.status if old_refreshed else None

    cleanup_booking(db_session, blocker)
    if old_refreshed:
        cleanup_booking(db_session, old_refreshed)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 409
    assert old_status == BookingStatus.CONFIRMED


# ---------------------------------------------------------------------------
# test_reschedule_token_namespace
# ---------------------------------------------------------------------------


def test_reschedule_token_namespace(client: TestClient, db_session: Session, userpass):
    """A cancel-scoped HMAC token submitted as a reschedule token must be rejected."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Token Namespace Reschedule")
    make_interviewer_with_calling(db_session, user, prefix="TokenNs")

    target_day = get_next_weekday(3)
    window = make_availability_window(
        db_session, user.id, day_of_week=3, start_minute=540, end_minute=600
    )
    slot_utc = build_slot_utc(target_day, 9, 0)
    old_booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_utc, token_suffix="token-ns"
    )

    # Generate a cancel-scoped token for the same booking ID — wrong namespace.
    cancel_token = _generate_hmac_token("cancel", old_booking.id)

    new_slot = slot_utc + timedelta(hours=1)
    payload = {
        "reschedule_token": cancel_token,
        "new_slot_start": new_slot.isoformat(),
        "new_slot_end": (new_slot + timedelta(minutes=30)).isoformat(),
        "appointment_type_id": appt.id,
    }
    response = client.post("/appointment-bookings/reschedule", json=payload)

    cleanup_booking(db_session, old_booking)
    db_session.delete(window)
    db_session.commit()

    # The endpoint does a DB lookup first by reschedule_token column — a cancel-scoped
    # HMAC token won't match any row, so the lookup returns None → 404 before any
    # HMAC check that would produce 403.
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# test_reschedule_rejects_pending_email_confirm
# ---------------------------------------------------------------------------


def test_reschedule_rejects_pending_email_confirm(
    client: TestClient, db_session: Session, userpass
):
    """Rescheduling a PENDING_EMAIL_CONFIRM booking must return 409."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Pending Confirm Reschedule")
    make_interviewer_with_calling(db_session, user, prefix="PendingResched")

    target_day = get_next_weekday(4)
    window = make_availability_window(
        db_session, user.id, day_of_week=4, start_minute=540, end_minute=660
    )
    slot_utc = build_slot_utc(target_day, 9, 0)

    # Create as CONFIRMED first (to generate token), then downgrade to PENDING.
    booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_utc, token_suffix="pending-resched"
    )
    booking.status = BookingStatus.PENDING_EMAIL_CONFIRM
    db_session.add(booking)
    db_session.commit()

    new_slot = slot_utc + timedelta(hours=1)
    payload = _reschedule_payload(booking, new_slot, appt.id)
    response = client.post("/appointment-bookings/reschedule", json=payload)

    cleanup_booking(db_session, booking)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 409
    assert "confirm" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# test_reschedule_cutoff_enforced
# ---------------------------------------------------------------------------


def test_reschedule_cutoff_enforced(client: TestClient, db_session: Session, userpass):
    """A new slot within booking_cutoff_hours of now must be rejected with 422."""
    user, _ = userpass
    # 24-hour cutoff — any slot less than 24h away should be rejected.
    ensure_temple_config(db_session, booking_cutoff_hours=24)
    appt = make_appointment_type(db_session, "Cutoff Reschedule")
    make_interviewer_with_calling(db_session, user, prefix="CutoffResched")

    target_day = get_next_weekday(5)
    window = make_availability_window(
        db_session, user.id, day_of_week=5, start_minute=540, end_minute=600
    )
    slot_utc = build_slot_utc(target_day, 9, 0)
    booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_utc, token_suffix="cutoff-resched"
    )

    # Submit a new slot only 1 hour in the future — within the 24-hour cutoff.
    too_soon_slot = datetime.utcnow() + timedelta(hours=1)

    payload = {
        "reschedule_token": booking.reschedule_token,
        "new_slot_start": too_soon_slot.isoformat(),
        "new_slot_end": (too_soon_slot + timedelta(minutes=30)).isoformat(),
        "appointment_type_id": appt.id,
    }
    response = client.post("/appointment-bookings/reschedule", json=payload)

    cleanup_booking(db_session, booking)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 422
    assert "cutoff" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# test_reschedule_calendar_background_task_enqueued
# ---------------------------------------------------------------------------


def test_reschedule_calendar_background_task_enqueued(
    client: TestClient, db_session: Session, userpass
):
    """After a successful reschedule, the Google Calendar update_event task must run."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Calendar BG Task Reschedule")
    make_interviewer_with_calling(db_session, user, prefix="CalBGTask")

    target_day = get_next_weekday(6)  # Sunday
    window = make_availability_window(
        db_session, user.id, day_of_week=6, start_minute=540, end_minute=720
    )

    old_slot_utc = build_slot_utc(target_day, 9, 0)
    new_slot_utc = build_slot_utc(target_day, 10, 0)

    old_booking = _make_confirmed_booking(
        db_session, appt, user, target_day, old_slot_utc, token_suffix="cal-bg-task"
    )
    # Give the old booking a calendar event ID so the endpoint dispatches update_event.
    old_booking.calendar_event_id = "existing-cal-event-id"
    db_session.add(old_booking)
    db_session.commit()

    payload = _reschedule_payload(old_booking, new_slot_utc, appt.id)

    # Patch update_event at the source module; the background task imports it lazily via
    # `from ..utils.google_calendar import update_event` so patching the module attribute
    # intercepts the import at call time.
    with patch("src.utils.google_calendar.update_event") as mock_update:
        response = client.post("/appointment-bookings/reschedule", json=payload)
        # TestClient runs BackgroundTasks synchronously before returning.
        assert response.status_code == 200
        # update_event must have been invoked by the background task.
        mock_update.assert_called_once()

    # Cleanup.
    db_session.expire_all()
    new_booking = db_session.exec(
        select(Booking).where(
            Booking.start_datetime == new_slot_utc,
            Booking.interviewer_user_id == user.id,
        )
    ).first()
    old_refreshed = db_session.get(Booking, old_booking.id)
    if new_booking:
        cleanup_booking(db_session, new_booking)
    if old_refreshed:
        cleanup_booking(db_session, old_refreshed)
    db_session.delete(window)
    db_session.commit()


# ---------------------------------------------------------------------------
# I-3: GET /appointment-bookings/reschedule-info — new endpoint (parallel agent)
#
# All test_reschedule_info_* tests are skipped until the reschedule-info endpoint
# is merged from the batch-b parallel agent.  The test bodies are correct against
# the described interface and will be un-skipped when that work lands.
# ---------------------------------------------------------------------------


def test_reschedule_info_returns_member_data(
    client: TestClient, db_session: Session, userpass
):
    """GET /appointment-bookings/reschedule-info?token=… returns 200 with member data."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Reschedule Info Member Data")
    make_interviewer_with_calling(db_session, user, prefix="InfoMemberData")

    target_day = get_next_weekday(1)
    window = make_availability_window(
        db_session, user.id, day_of_week=1, start_minute=540, end_minute=660
    )
    slot_utc = build_slot_utc(target_day, 9, 0)
    booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_utc, token_suffix="info-member-data"
    )

    # Capture attributes before cleanup evicts them.
    expected_name = booking.member_name
    expected_email = booking.member_email
    expected_phone = booking.member_phone
    expected_type_id = appt.id
    expected_type_name = appt.name
    reschedule_token = booking.reschedule_token

    response = client.get(
        "/appointment-bookings/reschedule-info",
        params={"token": reschedule_token},
    )

    cleanup_booking(db_session, booking)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 200
    data = response.json()
    assert data["member_name"] == expected_name
    assert data["member_email"] == expected_email
    assert data["member_phone"] == expected_phone
    assert data["appointment_type_id"] == expected_type_id
    assert data["appointment_type_name"] == expected_type_name


def test_reschedule_info_token_not_found(client: TestClient):
    """GET /appointment-bookings/reschedule-info returns 404 for an unknown token."""
    response = client.get(
        "/appointment-bookings/reschedule-info",
        params={"token": "randomstringthatexistsnowhere"},
    )
    assert response.status_code == 404


def test_reschedule_info_already_rescheduled(
    client: TestClient, db_session: Session, userpass
):
    """GET /appointment-bookings/reschedule-info returns 409 with 'rescheduled' when booking is RESCHEDULED."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Reschedule Info Already Rescheduled")
    make_interviewer_with_calling(db_session, user, prefix="InfoAlreadyResched")

    target_day = get_next_weekday(2)
    window = make_availability_window(
        db_session, user.id, day_of_week=2, start_minute=540, end_minute=660
    )
    slot_utc = build_slot_utc(target_day, 9, 0)
    booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_utc, token_suffix="info-already-resched"
    )

    # Manually transition to RESCHEDULED.
    booking.status = BookingStatus.RESCHEDULED
    db_session.add(booking)
    db_session.commit()

    reschedule_token = booking.reschedule_token

    response = client.get(
        "/appointment-bookings/reschedule-info",
        params={"token": reschedule_token},
    )

    cleanup_booking(db_session, booking)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 409
    assert "rescheduled" in response.json()["detail"].lower()


def test_reschedule_info_within_cutoff(
    client: TestClient, db_session: Session, userpass
):
    """GET /appointment-bookings/reschedule-info returns 409 with 'cutoff' when booking is within the cutoff window."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=24)
    appt = make_appointment_type(db_session, "Reschedule Info Within Cutoff")
    make_interviewer_with_calling(db_session, user, prefix="InfoWithinCutoff")

    # 1 hour in the future is well within any 24-hour cutoff window.
    slot_utc = datetime.utcnow() + timedelta(hours=1)
    target_day = slot_utc.date()

    booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_utc, token_suffix="info-within-cutoff"
    )

    reschedule_token = booking.reschedule_token

    response = client.get(
        "/appointment-bookings/reschedule-info",
        params={"token": reschedule_token},
    )

    cleanup_booking(db_session, booking)
    db_session.commit()

    assert response.status_code == 409
    assert "cutoff" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# I-3: POST /appointment-bookings/resend-confirmation — existing endpoint
# ---------------------------------------------------------------------------


def test_resend_no_booking_returns_200(client: TestClient):
    """POST /appointment-bookings/resend-confirmation returns 200 even when no booking exists.

    The endpoint is privacy-safe: it never reveals whether an email has a booking.
    """
    from src.routers.appointment_bookings import _resend_rate_limit

    email = "nobody-resend-test@example.com"
    # Clear any stale rate-limit state from a prior test run in this session.
    _resend_rate_limit.pop(email.lower(), None)

    response = client.post(
        "/appointment-bookings/resend-confirmation",
        json={"member_email": email},
    )

    # Always clean up the rate-limit entry so other tests are not affected.
    _resend_rate_limit.pop(email.lower(), None)

    assert response.status_code == 200


def test_resend_rate_limit(client: TestClient):
    """POST /appointment-bookings/resend-confirmation returns 429 on the second rapid call.

    The endpoint enforces a 60-second per-email rate limit via a module-level dict.
    Importing and clearing the dict before the test ensures a clean slate regardless
    of prior test runs in the same session.
    """
    from src.routers.appointment_bookings import _resend_rate_limit

    email = "ratelimit-test-resend@example.com"
    _resend_rate_limit.pop(email.lower(), None)

    r1 = client.post(
        "/appointment-bookings/resend-confirmation",
        json={"member_email": email},
    )
    assert r1.status_code == 200, f"First call should succeed, got {r1.status_code}"

    # Second call within 60 s must be rejected.
    r2 = client.post(
        "/appointment-bookings/resend-confirmation",
        json={"member_email": email},
    )
    _resend_rate_limit.pop(email.lower(), None)

    assert r2.status_code == 429


# ---------------------------------------------------------------------------
# I-3: GET /appointment-bookings/cancel/{token} — RESCHEDULED redirect
#
# Skipped until the parallel agent changes the cancel endpoint to redirect
# RESCHEDULED bookings to /appointments/cancelled?reason=rescheduled (302)
# instead of raising 409.
# ---------------------------------------------------------------------------


def test_cancel_rescheduled_booking_redirects(
    client: TestClient, db_session: Session, userpass
):
    """GET /appointment-bookings/cancel/{token} on a RESCHEDULED booking returns 302 with reason=rescheduled."""
    user, _ = userpass
    ensure_temple_config(db_session, booking_cutoff_hours=0)
    appt = make_appointment_type(db_session, "Cancel Rescheduled Redirect")
    make_interviewer_with_calling(db_session, user, prefix="CancelResched")

    target_day = get_next_weekday(1)
    window = make_availability_window(
        db_session, user.id, day_of_week=1, start_minute=540, end_minute=660
    )
    slot_utc = build_slot_utc(target_day, 9, 0)
    booking = _make_confirmed_booking(
        db_session, appt, user, target_day, slot_utc, token_suffix="cancel-resched-redirect"
    )

    # Transition to RESCHEDULED — simulates an already-rescheduled booking.
    booking.status = BookingStatus.RESCHEDULED
    db_session.add(booking)
    db_session.commit()

    cancel_token = booking.confirmation_token

    # follow_redirects=False so we observe the 302 directly.
    response = client.get(
        f"/appointment-bookings/cancel/{cancel_token}",
        follow_redirects=False,
    )

    cleanup_booking(db_session, booking)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 302
    location = response.headers.get("location", "")
    assert "reason=rescheduled" in location
