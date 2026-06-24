"""Tests for the appointment bookings router."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

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


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ensure_config(session: Session) -> TempleRecommendConfig:
    session.expire_all()  # Ensure we see the latest DB state
    config = session.get(TempleRecommendConfig, 1)
    if config is None:
        config = TempleRecommendConfig(
            id=1,
            timezone="America/Denver",
            slot_buffer_mins=0,
            booking_window_days=60,
            booking_cutoff_hours=0,  # no cutoff in tests
        )
        session.add(config)
        session.commit()
        session.refresh(config)
    else:
        # Reset to known test-safe state
        config.booking_cutoff_hours = 0
        config.slot_buffer_mins = 0
        config.booking_window_days = 60
        config.timezone = "America/Denver"
        session.add(config)
        session.commit()
        session.refresh(config)
    return config


def _make_appointment_type(session: Session, name: str = "Booking Test Type") -> AppointmentType:
    existing = session.exec(
        select(AppointmentType).where(AppointmentType.name == name)
    ).first()
    if existing:
        return existing
    appt = AppointmentType(
        name=name,
        duration_mins=30,
        description="",
        details="",
        icon_name="Calendar",
        is_active=True,
        display_order=1,
        system_defined=False,
    )
    session.add(appt)
    session.commit()
    session.refresh(appt)
    return appt


def _make_interviewer_with_calling(session: Session, user: User) -> None:
    calling_name = f"Booking Calling {user.id}"
    calling = session.exec(
        select(Calling).where(Calling.name == calling_name)
    ).first()
    if calling is None:
        calling = Calling(name=calling_name, max_slots=1, is_public=False, system_defined=False)
        session.add(calling)
        session.commit()
        session.refresh(calling)

    perm = session.exec(
        select(Permissions).where(
            Permissions.foreign_id == str(calling.id),
            Permissions.is_calling == True,
        )
    ).first()
    if perm is None:
        perm = Permissions(foreign_id=str(calling.id), is_calling=True, scopes=512)
        session.add(perm)
    else:
        perm.scopes = perm.scopes | 512
        session.add(perm)

    uc = session.exec(
        select(UserCalling).where(
            UserCalling.calling_id == calling.id,
            UserCalling.slot_number == 1,
        )
    ).first()
    if uc is None:
        uc = UserCalling(calling_id=calling.id, slot_number=1, user_id=user.id)
        session.add(uc)
    else:
        uc.user_id = user.id
        session.add(uc)
    session.commit()


def _make_window(session: Session, user_id: int, day_of_week: int) -> AvailabilityWindow:
    window = AvailabilityWindow(
        user_id=user_id,
        day_of_week=day_of_week,
        start_minute=540,   # 9:00 AM
        end_minute=600,     # 10:00 AM (two 30-min slots)
        is_active=True,
    )
    session.add(window)
    session.commit()
    session.refresh(window)
    return window


def _get_next_target_day(day_of_week: int) -> date:
    """Return the next date matching the given weekday (0=Mon, 6=Sun)."""
    today = date.today()
    days_ahead = (day_of_week - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


def _build_slot_utc(target_date: date, hour: int, minute: int, timezone: str = "America/Denver") -> datetime:
    """Build a naive UTC datetime for a given local time on target_date."""
    tz = ZoneInfo(timezone)
    local_dt = datetime(target_date.year, target_date.month, target_date.day, hour, minute, tzinfo=tz)
    return local_dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def _post_booking(client: TestClient, appt_type_id: int, slot_utc: datetime, honeypot: str = "") -> dict:
    return {
        "appointment_type_id": appt_type_id,
        "slot_datetime_utc": slot_utc.isoformat(),
        "member_name": "Jane Smith",
        "member_email": "jane@example.com",
        "member_phone": "555-1234",
        "_honeypot": honeypot,
    }


# ---------------------------------------------------------------------------
# POST /appointment-bookings (public)
# ---------------------------------------------------------------------------

def test_create_booking_no_interviewer_returns_422(client: TestClient, db_session: Session):
    """With no interviewer windows, booking should fail with 422."""
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "No Interviewer Booking")
    slot_utc = _build_slot_utc(_get_next_target_day(6), 9, 0)
    response = client.post(
        "/appointment-bookings/",
        json=_post_booking(client, appt.id, slot_utc),
    )
    assert response.status_code == 422


def test_create_booking_success(client: TestClient, db_session: Session, userpass):
    """Full happy path: create a booking, verify it's persisted."""
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Happy Path Booking")
    _make_interviewer_with_calling(db_session, user)

    target_day = _get_next_target_day(6)  # Sunday
    window = _make_window(db_session, user.id, day_of_week=6)
    slot_utc = _build_slot_utc(target_day, 9, 0)

    response = client.post(
        "/appointment-bookings/",
        json=_post_booking(client, appt.id, slot_utc),
    )
    assert response.status_code == 200
    payload = response.json()

    # Verify BookingAuditLog was created
    booking_id = payload["id"]
    created_booking = db_session.get(Booking, booking_id)
    audit = db_session.exec(
        select(BookingAuditLog).where(
            BookingAuditLog.booking_id == booking_id,
            BookingAuditLog.event_type == "created",
        )
    ).first()

    # Cleanup before user teardown (must delete audit log before booking, booking before window)
    if created_booking:
        _cleanup_booking(db_session, created_booking)
    db_session.delete(window)
    db_session.commit()

    assert payload["member_name"] == "Jane Smith"
    assert payload["status"] == "PENDING_EMAIL_CONFIRM"
    assert "confirmation_token" in payload
    assert payload["interviewer_user_id"] == user.id
    assert audit is not None


def test_create_booking_honeypot_returns_fake_success(client: TestClient, db_session: Session):
    """Honeypot field filled in should return 200 but not persist anything."""
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Honeypot Booking")
    slot_utc = _build_slot_utc(_get_next_target_day(6), 9, 0)

    count_before = db_session.exec(select(Booking)).all()

    body = _post_booking(client, appt.id, slot_utc, honeypot="i-am-a-bot")
    response = client.post("/appointment-bookings/", json=body)
    assert response.status_code == 200

    count_after = db_session.exec(select(Booking)).all()
    # Nothing should have been persisted
    assert len(count_after) == len(count_before)


def test_create_booking_invalid_type_id(client: TestClient, db_session: Session):
    _ensure_config(db_session)
    slot_utc = _build_slot_utc(_get_next_target_day(6), 9, 0)
    body = _post_booking(client, 99999, slot_utc)
    response = client.post("/appointment-bookings/", json=body)
    assert response.status_code == 404


def test_create_booking_double_book_returns_409(client: TestClient, db_session: Session, userpass):
    """Two bookings for the same slot should result in 409 on the second."""
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Double Book Type")
    _make_interviewer_with_calling(db_session, user)

    target_day = _get_next_target_day(0)  # Monday
    window = _make_window(db_session, user.id, day_of_week=0)
    slot_utc = _build_slot_utc(target_day, 9, 0)

    # First booking — should succeed
    r1 = client.post("/appointment-bookings/", json=_post_booking(client, appt.id, slot_utc))
    assert r1.status_code == 200
    booking_id = r1.json()["id"]

    # Second booking for same slot — should 409
    r2 = client.post("/appointment-bookings/", json=_post_booking(client, appt.id, slot_utc))

    # Cleanup before user teardown
    created_booking = db_session.get(Booking, booking_id)
    if created_booking:
        _cleanup_booking(db_session, created_booking)
    db_session.delete(window)
    db_session.commit()

    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# GET /appointment-bookings/confirm/{token}
# ---------------------------------------------------------------------------

def _create_direct_booking(session: Session, appt: AppointmentType, user: User, target_day: date, token: str) -> Booking:
    slot_utc = _build_slot_utc(target_day, 9, 0)
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Test Member",
        member_email="test@example.com",
        member_phone="555-0000",
        booking_date=target_day,
        start_minute_of_day=540,
        end_minute_of_day=570,
        start_datetime=slot_utc,
        end_datetime=slot_utc + timedelta(minutes=30),
        status=BookingStatus.PENDING_EMAIL_CONFIRM,
        confirmation_token=token,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def _cleanup_booking(session: Session, booking: Booking) -> None:
    """Delete booking audit logs then the booking itself to avoid FK violations."""
    from sqlalchemy import text
    session.exec(text(f"DELETE FROM bookingauditlog WHERE booking_id = {booking.id}"))
    session.exec(text(f"DELETE FROM booking WHERE id = {booking.id}"))
    session.commit()


def test_confirm_booking_transitions_to_confirmed(client: TestClient, db_session: Session, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Confirm Type")
    target_day = _get_next_target_day(1)  # Tuesday
    booking = _create_direct_booking(db_session, appt, user, target_day, "confirm-token-abc")

    # Should redirect (302) to frontend URL
    response = client.get(f"/appointment-bookings/confirm/{booking.confirmation_token}", follow_redirects=False)

    db_session.expire_all()
    confirmed_booking = db_session.get(Booking, booking.id)
    confirmed_status = confirmed_booking.status if confirmed_booking else None

    _cleanup_booking(db_session, booking)

    assert response.status_code in (200, 302)
    assert confirmed_status == BookingStatus.CONFIRMED


def test_confirm_booking_idempotent(client: TestClient, db_session: Session, userpass):
    """Confirming an already-confirmed booking should return success."""
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Idempotent Confirm Type")
    target_day = _get_next_target_day(2)
    booking = _create_direct_booking(db_session, appt, user, target_day, "idempotent-token-xyz")

    # Confirm once
    client.get(f"/appointment-bookings/confirm/{booking.confirmation_token}", follow_redirects=False)
    # Confirm again — should not error
    response = client.get(f"/appointment-bookings/confirm/{booking.confirmation_token}", follow_redirects=False)

    _cleanup_booking(db_session, booking)

    assert response.status_code in (200, 302)


def test_confirm_booking_unknown_token_returns_404(client: TestClient, db_session: Session):
    _ensure_config(db_session)
    response = client.get("/appointment-bookings/confirm/nonexistent-token-999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /appointment-bookings/cancel/{token}
# ---------------------------------------------------------------------------

def _create_confirmed_booking(session: Session, appt: AppointmentType, user: User, target_day: date, token: str) -> Booking:
    slot_utc = _build_slot_utc(target_day, 9, 30)
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Cancel Member",
        member_email="cancel@example.com",
        member_phone="555-9999",
        booking_date=target_day,
        start_minute_of_day=570,
        end_minute_of_day=600,
        start_datetime=slot_utc,
        end_datetime=slot_utc + timedelta(minutes=30),
        status=BookingStatus.CONFIRMED,
        confirmation_token=token,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def test_cancel_booking_transitions_to_cancelled(client: TestClient, db_session: Session, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Cancel Type")
    target_day = _get_next_target_day(3)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "cancel-token-xyz")

    response = client.get(f"/appointment-bookings/cancel/{booking.confirmation_token}")

    db_session.expire_all()
    updated = db_session.get(Booking, booking.id)
    final_status = updated.status if updated else None
    cancelled_at = updated.cancelled_at if updated else None

    _cleanup_booking(db_session, booking)

    assert response.status_code == 200
    assert final_status == BookingStatus.CANCELLED_BY_MEMBER
    assert cancelled_at is not None


def test_cancel_booking_not_confirmed_returns_400(client: TestClient, db_session: Session, userpass):
    """Can't cancel a PENDING_EMAIL_CONFIRM booking via token."""
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Pending Cancel Type")
    target_day = _get_next_target_day(4)
    booking = _create_direct_booking(db_session, appt, user, target_day, "pending-cancel-token")

    response = client.get(f"/appointment-bookings/cancel/{booking.confirmation_token}")

    # Cleanup
    db_session.delete(booking)
    db_session.commit()

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# GET /appointment-bookings (admin list)
# ---------------------------------------------------------------------------

def test_list_bookings_requires_auth(client: TestClient):
    response = client.get("/appointment-bookings/")
    assert response.status_code == 401


def test_list_bookings_requires_manage_appointments(client: TestClient, userpass):
    user, password = userpass
    token = _login(client, user.email, password)
    response = client.get("/appointment-bookings/", headers=_auth(token))
    assert response.status_code == 403


def test_list_bookings_admin_can_list(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Admin List Type")
    target_day = _get_next_target_day(5)  # Friday
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "admin-list-token")

    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.get("/appointment-bookings/", headers=_auth(token))

    booking_id = booking.id
    # Cleanup (no audit logs for directly-created bookings)
    _cleanup_booking(db_session, booking)

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    booking_ids = [b["id"] for b in data]
    assert booking_id in booking_ids


# ---------------------------------------------------------------------------
# PATCH /appointment-bookings/{id}/cancel (admin cancel)
# ---------------------------------------------------------------------------

def test_admin_cancel_requires_auth(client: TestClient):
    response = client.patch("/appointment-bookings/1/cancel", json={})
    assert response.status_code == 401


def test_admin_cancel_success(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Admin Cancel Type")
    target_day = _get_next_target_day(1)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "admin-cancel-token-abc")

    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/cancel",
        json={"cancellation_reason": "Schedule conflict"},
        headers=_auth(token),
    )

    db_session.expire_all()
    updated = db_session.get(Booking, booking.id)
    final_status = updated.status if updated else None

    _cleanup_booking(db_session, booking)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "CANCELLED_BY_PRESIDENCY"
    assert payload["cancellation_reason"] == "Schedule conflict"
    assert final_status == BookingStatus.CANCELLED_BY_PRESIDENCY


def test_admin_cancel_non_confirmed_returns_400(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Already Cancelled Type")
    target_day = _get_next_target_day(2)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "double-cancel-token")
    booking.status = BookingStatus.CANCELLED_BY_MEMBER
    db_session.add(booking)
    db_session.commit()

    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/cancel",
        json={},
        headers=_auth(token),
    )

    # Cleanup
    _cleanup_booking(db_session, booking)

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# PATCH /appointment-bookings/{id}/status
# ---------------------------------------------------------------------------

def test_status_update_to_completed(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Status Complete Type")
    target_day = _get_next_target_day(3)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "status-complete-token")

    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "COMPLETED"},
        headers=_auth(token),
    )

    _cleanup_booking(db_session, booking)

    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"


def test_status_update_to_no_show(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Status NoShow Type")
    target_day = _get_next_target_day(4)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "status-noshow-token")

    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "NO_SHOW"},
        headers=_auth(token),
    )

    _cleanup_booking(db_session, booking)

    assert response.status_code == 200
    assert response.json()["status"] == "NO_SHOW"


def test_status_update_invalid_status(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Status Invalid Type")
    target_day = _get_next_target_day(5)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "status-invalid-token")

    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "EXPIRED"},
        headers=_auth(token),
    )

    # Cleanup (no audit log created since request was rejected)
    _cleanup_booking(db_session, booking)

    assert response.status_code == 422


def test_status_update_non_confirmed_returns_400(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Status Non Confirmed Type")
    target_day = _get_next_target_day(0)
    booking = _create_confirmed_booking(db_session, appt, user, target_day, "status-expired-token")
    booking.status = BookingStatus.EXPIRED
    db_session.add(booking)
    db_session.commit()

    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-bookings/{booking.id}/status",
        json={"status": "COMPLETED"},
        headers=_auth(token),
    )

    # Cleanup
    _cleanup_booking(db_session, booking)

    assert response.status_code == 400
