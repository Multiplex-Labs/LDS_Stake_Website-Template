"""Tests for the appointment availability router."""
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import (
    AppointmentType,
    AvailabilityException,
    AvailabilityWindow,
    Booking,
    BookingStatus,
    Calling,
    Permissions,
    Permission,
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
# GET /appointment-availability/slots  (public)
# ---------------------------------------------------------------------------

def test_slots_require_valid_type_id(client: TestClient, db_session: Session):
    ensure_temple_config(db_session)
    today = date.today()
    response = client.get(
        "/appointment-availability/slots",
        params={"type_id": 99999, "date_from": str(today), "date_to": str(today)},
    )
    assert response.status_code == 404


def test_slots_rejects_range_over_7_days(client: TestClient, db_session: Session):
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Over7Days Type")
    today = date.today()
    response = client.get(
        "/appointment-availability/slots",
        params={
            "type_id": appt.id,
            "date_from": str(today),
            "date_to": str(today + timedelta(days=8)),
        },
    )
    assert response.status_code == 422


def test_slots_returns_empty_when_no_interviewers(client: TestClient, db_session: Session):
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "NoInterviewers Type")
    today = date.today()
    response = client.get(
        "/appointment-availability/slots",
        params={
            "type_id": appt.id,
            "date_from": str(today),
            "date_to": str(today + timedelta(days=1)),
        },
    )
    assert response.status_code == 200
    assert response.json() == []


def test_slots_returns_slots_when_window_exists(client: TestClient, db_session: Session, userpass):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Window Slots Type")
    make_interviewer_with_calling(db_session, user, prefix="SlotWindow")

    target_sunday = get_next_weekday(6)  # 6=Sunday
    window = make_availability_window(
        db_session, user.id, day_of_week=6, start_minute=510, end_minute=930
    )

    response = client.get(
        "/appointment-availability/slots",
        params={
            "type_id": appt.id,
            "date_from": str(target_sunday),
            "date_to": str(target_sunday),
        },
    )

    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 200
    slots = response.json()
    assert len(slots) > 0
    assert "slot_datetime_utc" in slots[0]
    assert "interviewer_user_id" in slots[0]
    assert slots[0]["interviewer_user_id"] == user.id


def test_slots_global_exception_blocks_all(client: TestClient, db_session: Session, userpass):
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Exception Block Type")
    make_interviewer_with_calling(db_session, user, prefix="ExcBlock")

    target_sunday = get_next_weekday(6)
    window = make_availability_window(db_session, user.id, day_of_week=6, start_minute=510, end_minute=930)

    exc = AvailabilityException(
        date=target_sunday, reason="Test Block", is_global=True, user_id=None
    )
    db_session.add(exc)
    db_session.commit()

    response = client.get(
        "/appointment-availability/slots",
        params={
            "type_id": appt.id,
            "date_from": str(target_sunday),
            "date_to": str(target_sunday),
        },
    )

    db_session.delete(exc)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 200
    assert response.json() == []


def test_slots_buffer_reduces_available_count(client: TestClient, db_session: Session, userpass):
    """With a buffer, fewer slots fit in a given window."""
    user, _ = userpass
    config = ensure_temple_config(db_session, slot_buffer_mins=0)
    appt = make_appointment_type(db_session, "Buffer Test Type")
    make_interviewer_with_calling(db_session, user, prefix="BufTest")

    target_sunday = get_next_weekday(6)
    # 90-minute window with 30-minute slots → 3 slots with no buffer
    window = make_availability_window(
        db_session, user.id, day_of_week=6, start_minute=540, end_minute=630
    )

    response_no_buffer = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    count_no_buffer = len(response_no_buffer.json())

    config.slot_buffer_mins = 5
    db_session.add(config)
    db_session.commit()

    response_with_buffer = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    count_with_buffer = len(response_with_buffer.json())

    db_session.delete(window)
    db_session.commit()

    assert count_no_buffer > count_with_buffer


def test_slots_booking_occupies_slot(client: TestClient, db_session: Session, userpass):
    """An existing CONFIRMED booking should remove that slot from results."""
    user, _ = userpass
    config = ensure_temple_config(db_session, slot_buffer_mins=0)

    appt = make_appointment_type(db_session, "Occupied Slot Type")
    make_interviewer_with_calling(db_session, user, prefix="OccSlot")

    target_sunday = get_next_weekday(6)
    window = make_availability_window(
        db_session, user.id, day_of_week=6, start_minute=540, end_minute=600
    )

    resp_before = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    slots_before = resp_before.json()

    if not slots_before:
        db_session.delete(window)
        db_session.commit()
        pytest.skip("No slots generated; check config cutoff hours")

    first_slot_utc = datetime.fromisoformat(slots_before[0]["slot_datetime_utc"])
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Test Member",
        member_email="test@example.com",
        member_phone="555-0000",
        booking_date=target_sunday,
        start_minute_of_day=540,
        end_minute_of_day=570,
        start_datetime=first_slot_utc.replace(tzinfo=None),
        end_datetime=(first_slot_utc + timedelta(minutes=30)).replace(tzinfo=None),
        status=BookingStatus.CONFIRMED,
        confirmation_token="test-token-unique-occ-avail-456",
    )
    db_session.add(booking)
    db_session.commit()

    resp_after = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    slots_after = resp_after.json()

    cleanup_booking(db_session, booking)
    db_session.delete(window)
    db_session.commit()

    assert len(slots_after) < len(slots_before)


# ---------------------------------------------------------------------------
# GET /appointment-availability/available-dates  (public)
# ---------------------------------------------------------------------------

def test_available_dates_returns_dict_with_dates_key(client: TestClient, db_session: Session):
    ensure_temple_config(db_session)
    appt = make_appointment_type(db_session, "Available Dates Type")
    today = date.today()
    response = client.get(
        "/appointment-availability/available-dates",
        params={"type_id": appt.id, "year": today.year, "month": today.month},
    )
    assert response.status_code == 200
    assert "available_dates" in response.json()
    assert isinstance(response.json()["available_dates"], list)


# ---------------------------------------------------------------------------
# Admin: availability windows CRUD
# ---------------------------------------------------------------------------

def test_windows_requires_auth(client: TestClient):
    response = client.get("/appointment-availability/windows")
    assert response.status_code == 401


def test_create_window_requires_manage_appointments(client: TestClient, userpass):
    user, password = userpass
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-availability/windows",
        json={"user_id": user.id, "day_of_week": 6, "start_minute": 510, "end_minute": 930},
        headers=auth_headers(token),
    )
    assert response.status_code == 403


def test_create_window_success(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/windows",
        json={"user_id": user.id, "day_of_week": 0, "start_minute": 540, "end_minute": 720},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["user_id"] == user.id
    assert payload["day_of_week"] == 0
    assert payload["start_minute"] == 540
    assert payload["end_minute"] == 720

    window = db_session.get(AvailabilityWindow, payload["id"])
    if window:
        db_session.delete(window)
        db_session.commit()


def test_create_window_rejects_invalid_times(client: TestClient, admin, userpass):
    """start_minute >= end_minute should return 422."""
    user, _ = userpass
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/windows",
        json={"user_id": user.id, "day_of_week": 0, "start_minute": 720, "end_minute": 540},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_delete_window_success(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    window = make_availability_window(db_session, user.id, day_of_week=1)
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.delete(
        f"/appointment-availability/windows/{window.id}", headers=auth_headers(token)
    )
    if response.status_code != 204:
        remaining = db_session.get(AvailabilityWindow, window.id)
        if remaining:
            db_session.delete(remaining)
            db_session.commit()
    assert response.status_code == 204


def test_delete_window_not_found(client: TestClient, admin):
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.delete(
        "/appointment-availability/windows/99999", headers=auth_headers(token)
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /windows/{id}  (Task 3)
# ---------------------------------------------------------------------------

def test_update_window_success(client: TestClient, db_session: Session, admin, userpass):
    """PATCH an existing window — should return 200 with updated field."""
    user, _ = userpass
    window = make_availability_window(
        db_session, user.id, day_of_week=2, start_minute=600, end_minute=900
    )
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)

    response = client.patch(
        f"/appointment-availability/windows/{window.id}",
        json={"start_minute": 630},
        headers=auth_headers(token),
    )

    # Cleanup
    updated = db_session.get(AvailabilityWindow, window.id)
    if updated:
        db_session.delete(updated)
        db_session.commit()

    assert response.status_code == 200
    assert response.json()["start_minute"] == 630


def test_update_window_not_found(client: TestClient, admin):
    """PATCH a non-existent window ID should return 404."""
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        "/appointment-availability/windows/99999",
        json={"start_minute": 600},
        headers=auth_headers(token),
    )
    assert response.status_code == 404


def test_update_window_invalid_time_range(client: TestClient, db_session: Session, admin, userpass):
    """PATCH that makes start_minute >= end_minute should return 422."""
    user, _ = userpass
    window = make_availability_window(
        db_session, user.id, day_of_week=3, start_minute=600, end_minute=900
    )
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)

    # Set start_minute to 950, which exceeds the existing end_minute of 900
    response = client.patch(
        f"/appointment-availability/windows/{window.id}",
        json={"start_minute": 950},
        headers=auth_headers(token),
    )

    # Cleanup (window may or may not have been modified; fetch fresh)
    remaining = db_session.get(AvailabilityWindow, window.id)
    if remaining:
        db_session.delete(remaining)
        db_session.commit()

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Admin: exceptions CRUD
# ---------------------------------------------------------------------------

def test_create_exception_global_must_not_have_user_id(
    client: TestClient, admin, userpass
):
    user, _ = userpass
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={"date": "2027-01-01", "reason": "Test", "is_global": True, "user_id": user.id},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_create_exception_personal_requires_user_id(client: TestClient, admin):
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={"date": "2027-01-01", "reason": "Test", "is_global": False},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_create_global_exception_success(client: TestClient, admin):
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={"date": "2027-02-15", "reason": "Conference", "is_global": True},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_global"] is True
    assert payload["user_id"] is None


def test_delete_exception_not_found(client: TestClient, admin):
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.delete(
        "/appointment-availability/exceptions/99999", headers=auth_headers(token)
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Exception recurrence validation  (Task 5)
# ---------------------------------------------------------------------------

def test_create_exception_with_legacy_recurrence(client: TestClient, admin, userpass):
    """The legacy 'first_sunday_monthly' recurrence string should be accepted (200)."""
    user, _ = userpass
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={
            "reason": "Fast Sunday",
            "is_global": True,
            "recurrence": "first_sunday_monthly",
        },
        headers=auth_headers(token),
    )
    # Cleanup if created
    if response.status_code == 200:
        exc_id = response.json()["id"]
        client.delete(
            f"/appointment-availability/exceptions/{exc_id}",
            headers=auth_headers(token),
        )
    assert response.status_code == 200


def test_create_exception_with_json_recurrence(client: TestClient, admin, userpass):
    """A valid JSON recurrence rule should be accepted (200)."""
    user, _ = userpass
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    import json
    recurrence_rule = json.dumps({
        "freq": "weekly",
        "interval": 1,
        "days": [6],
        "end_type": "never",
    })
    response = client.post(
        "/appointment-availability/exceptions",
        json={
            "reason": "Weekly Sunday closure",
            "is_global": True,
            "recurrence": recurrence_rule,
        },
        headers=auth_headers(token),
    )
    if response.status_code == 200:
        exc_id = response.json()["id"]
        client.delete(
            f"/appointment-availability/exceptions/{exc_id}",
            headers=auth_headers(token),
        )
    assert response.status_code == 200


def test_create_exception_invalid_recurrence_returns_422(client: TestClient, admin, userpass):
    """An unrecognised recurrence string should be rejected with 422."""
    user, _ = userpass
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={
            "reason": "Bad recurrence",
            "is_global": True,
            "recurrence": "not-a-valid-rule",
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_create_exception_neither_date_nor_recurrence_returns_422(
    client: TestClient, admin, userpass
):
    """Supplying neither date nor recurrence should return 422."""
    user, _ = userpass
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={
            "reason": "No date or recurrence",
            "is_global": True,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /appointment-availability/health  (Task 6)
# ---------------------------------------------------------------------------

def test_health_requires_auth(client: TestClient):
    """Health endpoint must reject unauthenticated requests with 401."""
    response = client.get("/appointment-availability/health")
    assert response.status_code == 401


def test_health_requires_manage_appointments(client: TestClient, userpass):
    """Health endpoint must reject users without MANAGE_APPOINTMENTS with 403."""
    user, password = userpass
    token = login(client, user.email, password)
    response = client.get(
        "/appointment-availability/health",
        headers=auth_headers(token),
    )
    assert response.status_code == 403


def test_health_returns_results(client: TestClient, db_session: Session, admin):
    """Admin with MANAGE_APPOINTMENTS (included in all-permissions) gets a list."""
    ensure_temple_config(db_session)
    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.get(
        "/appointment-availability/health",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)
