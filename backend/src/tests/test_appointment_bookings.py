"""Tests for the appointment bookings router."""
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import (
    AppointmentType,
    AvailabilityWindow,
    Booking,
    BookingAuditLog,
    BookingStatus,
    Calling,
    Permissions,
    TempleRecommendConfig,
    User,
    UserCalling,
)

from .conftest import (
    ensure_temple_config,
    make_appointment_type,
    make_interviewer_with_calling,
    make_availability_window,
    get_next_weekday,
    build_slot_utc,
    cleanup_booking,
    login,
    auth_headers,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _booking_payload(
    appt_type_id: int,
    slot_utc: datetime,
    honeypot: str = "",
) -> dict:
    """Build a standard booking request body."""
    return {
        "appointment_type_id": appt_type_id,
        "slot_datetime_utc": slot_utc.isoformat(),
        "member_name": "Jane Smith",
        "member_email": "jane@example.com",
        "member_phone": "555-1234",
        "_honeypot": honeypot,
    }


def _create_pending_booking(
    session: Session,
    appt: AppointmentType,
    user: User,
    target_day: date,
    token: str,
    start_hour: int = 9,
) -> Booking:
    """Create a PENDING_EMAIL_CONFIRM booking directly in the DB."""
    slot_utc = build_slot_utc(target_day, start_hour, 0)
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Test Member",
        member_email="test@example.com",
        member_phone="555-0000",
        booking_date=target_day,
        start_minute_of_day=start_hour * 60,
        end_minute_of_day=start_hour * 60 + 30,
        start_datetime=slot_utc,
        end_datetime=slot_utc + timedelta(minutes=30),
        status=BookingStatus.PENDING_EMAIL_CONFIRM,
        confirmation_token=token,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def _create_confirmed_booking(
    session: Session,
    appt: AppointmentType,
    user: User,
    target_day: date,
    token: str,
    start_hour: int = 9,
    start_minute: int = 30,
) -> Booking:
    """Create a CONFIRMED booking directly in the DB."""
    slot_utc = build_slot_utc(target_day, start_hour, start_minute)
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Cancel Member",
        member_email="cancel@example.com",
        member_phone="555-9999",
        booking_date=target_day,
        start_minute_of_day=start_hour * 60 + start_minute,
        end_minute_of_day=start_hour * 60 + start_minute + 30,
        start_datetime=slot_utc,
        end_datetime=slot_utc + timedelta(minutes=30),
        status=BookingStatus.CONFIRMED,
        confirmation_token=token,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


# ---------------------------------------------------------------------------
# POST /appointment-bookings  (public)
# ---------------------------------------------------------------------------

def test_create_booking_no_interviewer_returns_422(client: TestClient, db_session: Session):
    """With no interviewer windows, booking should fail with 422."""
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "No Interviewer Booking")
    slot_utc = build_slot_utc(get_next_weekday(6), 9, 0)
    response = client.post(
        "/appointment-bookings/",
        json=_booking_payload(appt.id, slot_utc),
    )
    assert response.status_code == 422


def test_create_booking_success(client: TestClient, db_session: Session, userpass):
    """Full happy path: create a booking, verify it is persisted."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Happy Path Booking")
    make_interviewer_with_calling(db_session, user, prefix="HappyPath")

    target_day = get_next_weekday(6)  # Sunday
    window = make_availability_window(db_session, user.id, day_of_week=6, start_minute=540, end_minute=600)
    slot_utc = build_slot_utc(target_day, 9, 0)

    response = client.post(
        "/appointment-bookings/",
        json=_booking_payload(appt.id, slot_utc),
    )
    assert response.status_code == 200
    payload = response.json()

    booking_id = payload["id"]
    created_booking = db_session.get(Booking, booking_id)
    audit = db_session.exec(
        select(BookingAuditLog).where(
            BookingAuditLog.booking_id == booking_id,
            BookingAuditLog.event_type == "created",
        )
    ).first()

    if created_booking:
        cleanup_booking(db_session, created_booking)
    db_session.delete(window)
    db_session.commit()

    assert payload["member_name"] == "Jane Smith"
    assert payload["status"] == "PENDING_EMAIL_CONFIRM"
    assert "confirmation_token" in payload
    assert payload["interviewer_user_id"] == user.id
    assert audit is not None


def test_create_booking_honeypot_returns_fake_success(client: TestClient, db_session: Session):
    """Honeypot field filled in should return 200 but not persist anything."""
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Honeypot Booking")
    slot_utc = build_slot_utc(get_next_weekday(6), 9, 0)

    count_before = len(db_session.exec(select(Booking)).all())

    body = _booking_payload(appt.id, slot_utc, honeypot="i-am-a-bot")
    response = client.post("/appointment-bookings/", json=body)
    assert response.status_code == 200

    count_after = len(db_session.exec(select(Booking)).all())
    assert count_after == count_before


def test_create_booking_invalid_type_id(client: TestClient, db_session: Session):
    ensure_temple_config(db_session)
    slot_utc = build_slot_utc(get_next_weekday(6), 9, 0)
    response = client.post(
        "/appointment-bookings/",
        json=_booking_payload(99999, slot_utc),
    )
    assert response.status_code == 404


def test_create_booking_double_book_returns_409(client: TestClient, db_session: Session, userpass):
    """Two bookings for the same slot should result in 409 on the second."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Double Book Type")
    make_interviewer_with_calling(db_session, user, prefix="DblBook")

    target_day = get_next_weekday(0)  # Monday
    window = make_availability_window(db_session, user.id, day_of_week=0, start_minute=540, end_minute=600)
    slot_utc = build_slot_utc(target_day, 9, 0)

    r1 = client.post("/appointment-bookings/", json=_booking_payload(appt.id, slot_utc))
    assert r1.status_code == 200
    booking_id = r1.json()["id"]

    r2 = client.post("/appointment-bookings/", json=_booking_payload(appt.id, slot_utc))

    created_booking = db_session.get(Booking, booking_id)
    if created_booking:
        cleanup_booking(db_session, created_booking)
    db_session.delete(window)
    db_session.commit()

    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# Booking cutoff test  (Task 4)
# TODO: passes after C-3 fix — the create_booking endpoint must enforce booking_cutoff_hours
# ---------------------------------------------------------------------------

def test_create_booking_within_cutoff_returns_422(client: TestClient, db_session: Session, userpass):
    """A slot only 1 hour away should be rejected when booking_cutoff_hours=24."""
    # TODO: passes after C-3 fix — booking cutoff enforcement must be present in create_booking
    pytest.skip(
        "Requires C-3 router fix: booking_cutoff_hours must reject slots within the cutoff window"
    )
    user, _ = userpass
    # Use 24-hour cutoff
    ensure_temple_config(db_session, booking_cutoff_hours=24)
    appt = make_appointment_type(db_session, "Cutoff Test Booking")
    make_interviewer_with_calling(db_session, user, prefix="Cutoff")

    # Slot is only 1 hour in the future — within the 24-hour cutoff
    slot_utc = datetime.utcnow() + timedelta(hours=1)

    response = client.post(
        "/appointment-bookings/",
        json=_booking_payload(appt.id, slot_utc),
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /appointment-bookings/confirm/{token}
# ---------------------------------------------------------------------------

def test_confirm_booking_transitions_to_confirmed(
    client: TestClient, db_session: Session, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Confirm Type")
    target_day = get_next_weekday(1)  # Tuesday
    booking = _create_pending_booking(db_session, appt, user, target_day, "confirm-token-abc")

    # Task 2: confirm endpoint returns 302 redirect on success
    response = client.get(
        f"/appointment-bookings/confirm/{booking.confirmation_token}",
        follow_redirects=False,
    )

    db_session.expire_all()
    confirmed_booking = db_session.get(Booking, booking.id)
    confirmed_status = confirmed_booking.status if confirmed_booking else None

    cleanup_booking(db_session, booking)

    assert response.status_code == 302
    assert confirmed_status == BookingStatus.CONFIRMED


def test_confirm_booking_idempotent(client: TestClient, db_session: Session, userpass):
    """Confirming an already-confirmed booking should return a non-error response."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Idempotent Confirm Type")
    target_day = get_next_weekday(2)
    booking = _create_pending_booking(
        db_session, appt, user, target_day, "idempotent-token-xyz", start_hour=10
    )

    # First confirm — transitions to CONFIRMED (302 redirect)
    client.get(
        f"/appointment-bookings/confirm/{booking.confirmation_token}",
        follow_redirects=False,
    )
    # Second confirm — already CONFIRMED, should not raise 5xx
    response = client.get(
        f"/appointment-bookings/confirm/{booking.confirmation_token}",
        follow_redirects=False,
    )

    cleanup_booking(db_session, booking)

    # Either 200 (already-confirmed JSON) or 302 redirect are acceptable
    assert response.status_code in (200, 302)


def test_confirm_booking_unknown_token_returns_404(client: TestClient, db_session: Session):
    ensure_temple_config(db_session)
    response = client.get("/appointment-bookings/confirm/nonexistent-token-999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /appointment-bookings/cancel/{token}
# ---------------------------------------------------------------------------

def test_cancel_booking_transitions_to_cancelled(
    client: TestClient, db_session: Session, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Cancel Type")
    target_day = get_next_weekday(3)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "cancel-token-xyz")

    # The cancel endpoint now redirects to the frontend cancelled page (302).
    response = client.get(
        f"/appointment-bookings/cancel/{booking.confirmation_token}",
        follow_redirects=False,
    )

    db_session.expire_all()
    updated = db_session.get(Booking, booking.id)
    final_status = updated.status if updated else None
    cancelled_at = updated.cancelled_at if updated else None

    cleanup_booking(db_session, booking)

    assert response.status_code == 302
    assert "/appointments/cancelled" in response.headers["location"]
    assert final_status == BookingStatus.CANCELLED_BY_MEMBER
    assert cancelled_at is not None


def test_cancel_booking_not_confirmed_returns_400(
    client: TestClient, db_session: Session, userpass
):
    """Cannot cancel a PENDING_EMAIL_CONFIRM booking via token."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Pending Cancel Type")
    target_day = get_next_weekday(4)
    booking = _create_pending_booking(
        db_session, appt, user, target_day, "pending-cancel-token", start_hour=11
    )

    response = client.get(f"/appointment-bookings/cancel/{booking.confirmation_token}")

    db_session.delete(booking)
    db_session.commit()

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# GET /appointment-bookings  (admin list)
# ---------------------------------------------------------------------------

def test_list_bookings_requires_auth(client: TestClient):
    response = client.get("/appointment-bookings/")
    assert response.status_code == 401


def test_list_bookings_requires_manage_appointments(client: TestClient, userpass):
    user, password = userpass
    token = login(client, user.email, password)
    response = client.get("/appointment-bookings/", headers=auth_headers(token))
    assert response.status_code == 403


def test_list_bookings_admin_can_list(
    client: TestClient, db_session: Session, admin, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Admin List Type")
    target_day = get_next_weekday(5)  # Friday
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "admin-list-token")

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.get("/appointment-bookings/", headers=auth_headers(token))

    booking_id = booking.id
    cleanup_booking(db_session, booking)

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert booking_id in [b["id"] for b in data]


# ---------------------------------------------------------------------------
# Booking list filters  (Task 8)
# ---------------------------------------------------------------------------

def test_list_bookings_filter_by_status(
    client: TestClient, db_session: Session, admin, userpass
):
    """Filter ?status=CONFIRMED should return only CONFIRMED bookings."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Filter Status Type")
    target_day = get_next_weekday(1)

    confirmed = _create_confirmed_booking(
        db_session, appt, user, target_day, "filter-status-confirmed-tok", start_hour=9
    )
    pending = _create_pending_booking(
        db_session, appt, user, target_day, "filter-status-pending-tok", start_hour=10
    )

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.get(
        "/appointment-bookings/",
        params={"status": "CONFIRMED"},
        headers=auth_headers(token),
    )

    cleanup_booking(db_session, confirmed)
    db_session.delete(pending)
    db_session.commit()

    assert response.status_code == 200
    results = response.json()
    statuses = {b["status"] for b in results}
    assert "CONFIRMED" in statuses
    assert "PENDING_EMAIL_CONFIRM" not in statuses


def test_list_bookings_filter_by_date(
    client: TestClient, db_session: Session, admin, userpass
):
    """Bookings outside the date_from/date_to range should be excluded."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Filter Date Type")

    target_day = get_next_weekday(2)  # Wednesday
    far_future_day = date.today() + timedelta(days=90)

    in_range = _create_confirmed_booking(
        db_session, appt, user, target_day, "filter-date-in-range-tok"
    )
    out_of_range = _create_confirmed_booking(
        db_session, appt, user, far_future_day, "filter-date-out-range-tok"
    )

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.get(
        "/appointment-bookings/",
        params={
            "date_from": str(target_day),
            "date_to": str(target_day),
        },
        headers=auth_headers(token),
    )

    in_range_id = in_range.id
    out_of_range_id = out_of_range.id
    cleanup_booking(db_session, in_range)
    cleanup_booking(db_session, out_of_range)

    assert response.status_code == 200
    results = response.json()
    result_ids = [b["id"] for b in results]
    assert in_range_id in result_ids
    assert out_of_range_id not in result_ids


# ---------------------------------------------------------------------------
# PATCH /appointment-bookings/{id}/cancel  (admin cancel)
# ---------------------------------------------------------------------------

def test_admin_cancel_requires_auth(client: TestClient):
    response = client.patch("/appointment-bookings/1/cancel", json={})
    assert response.status_code == 401


def test_admin_cancel_success(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Admin Cancel Type")
    target_day = get_next_weekday(1)
    booking = _create_confirmed_booking(
        db_session, appt, user, target_day, "admin-cancel-token-abc", start_hour=9
    )

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/cancel",
        json={"cancellation_reason": "Schedule conflict"},
        headers=auth_headers(token),
    )

    db_session.expire_all()
    updated = db_session.get(Booking, booking.id)
    final_status = updated.status if updated else None

    cleanup_booking(db_session, booking)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "CANCELLED_BY_PRESIDENCY"
    assert payload["cancellation_reason"] == "Schedule conflict"
    assert final_status == BookingStatus.CANCELLED_BY_PRESIDENCY


def test_admin_cancel_non_confirmed_returns_400(
    client: TestClient, db_session: Session, admin, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Already Cancelled Type")
    target_day = get_next_weekday(2)
    booking = _create_confirmed_booking(
        db_session, appt, user, target_day, "double-cancel-token", start_hour=10
    )
    booking.status = BookingStatus.CANCELLED_BY_MEMBER
    db_session.add(booking)
    db_session.commit()

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/cancel",
        json={},
        headers=auth_headers(token),
    )

    cleanup_booking(db_session, booking)

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# PATCH /appointment-bookings/{id}/status
# ---------------------------------------------------------------------------

def test_status_update_to_completed(
    client: TestClient, db_session: Session, admin, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Status Complete Type")
    target_day = get_next_weekday(3)
    booking = _create_confirmed_booking(
        db_session, appt, user, target_day, "status-complete-token", start_hour=9
    )

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "COMPLETED"},
        headers=auth_headers(token),
    )

    cleanup_booking(db_session, booking)

    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"


def test_status_update_to_no_show(
    client: TestClient, db_session: Session, admin, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Status NoShow Type")
    target_day = get_next_weekday(4)
    booking = _create_confirmed_booking(
        db_session, appt, user, target_day, "status-noshow-token", start_hour=10
    )

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "NO_SHOW"},
        headers=auth_headers(token),
    )

    cleanup_booking(db_session, booking)

    assert response.status_code == 200
    assert response.json()["status"] == "NO_SHOW"


def test_status_update_invalid_status(
    client: TestClient, db_session: Session, admin, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Status Invalid Type")
    target_day = get_next_weekday(5)
    booking = _create_confirmed_booking(
        db_session, appt, user, target_day, "status-invalid-token", start_hour=11
    )

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "EXPIRED"},
        headers=auth_headers(token),
    )

    cleanup_booking(db_session, booking)

    assert response.status_code == 422


def test_status_update_non_confirmed_returns_400(
    client: TestClient, db_session: Session, admin, userpass
):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Status Non Confirmed Type")
    target_day = get_next_weekday(0)
    booking = _create_confirmed_booking(
        db_session, appt, user, target_day, "status-expired-token", start_hour=9
    )
    booking.status = BookingStatus.EXPIRED
    db_session.add(booking)
    db_session.commit()

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "COMPLETED"},
        headers=auth_headers(token),
    )

    cleanup_booking(db_session, booking)

    assert response.status_code == 400
