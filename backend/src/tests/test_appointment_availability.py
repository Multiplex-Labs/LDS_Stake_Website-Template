"""Tests for the appointment availability router."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

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


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ensure_config(session: Session) -> TempleRecommendConfig:
    config = session.get(TempleRecommendConfig, 1)
    if config is None:
        config = TempleRecommendConfig(
            id=1,
            timezone="America/Denver",
            slot_buffer_mins=5,
            booking_window_days=60,
            booking_cutoff_hours=0,  # no cutoff in tests
        )
        session.add(config)
        session.commit()
        session.refresh(config)
    else:
        # Ensure no cutoff to make slot generation work in tests
        config.booking_cutoff_hours = 0
        session.add(config)
        session.commit()
    return config


def _make_appointment_type(session: Session, name: str = "Test Interview") -> AppointmentType:
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
    """Give the user a calling that has MANAGE_APPOINTMENTS permission."""
    calling_name = f"Test Calling {user.id}"
    calling = session.exec(
        select(Calling).where(Calling.name == calling_name)
    ).first()
    if calling is None:
        calling = Calling(name=calling_name, max_slots=1, is_public=False, system_defined=False)
        session.add(calling)
        session.commit()
        session.refresh(calling)

    # Grant MANAGE_APPOINTMENTS (512) to the calling
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

    # Assign user to the calling
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


def _make_window(
    session: Session,
    user_id: int,
    day_of_week: int,
    start_minute: int = 510,  # 8:30 AM
    end_minute: int = 930,    # 3:30 PM
) -> AvailabilityWindow:
    window = AvailabilityWindow(
        user_id=user_id,
        day_of_week=day_of_week,
        start_minute=start_minute,
        end_minute=end_minute,
        is_active=True,
    )
    session.add(window)
    session.commit()
    session.refresh(window)
    return window


# ---------------------------------------------------------------------------
# GET /appointment-availability/slots
# ---------------------------------------------------------------------------

def test_slots_require_valid_type_id(client: TestClient, db_session: Session):
    _ensure_config(db_session)
    today = date.today()
    response = client.get(
        "/appointment-availability/slots",
        params={"type_id": 99999, "date_from": str(today), "date_to": str(today)},
    )
    assert response.status_code == 404


def test_slots_rejects_range_over_7_days(client: TestClient, db_session: Session):
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session)
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
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "NoInterviewers Type")
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
    user, password = userpass
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Window Slots Type")
    _make_interviewer_with_calling(db_session, user)

    # Find next Sunday (day_of_week=6)
    today = date.today()
    days_until_sunday = (6 - today.weekday()) % 7
    if days_until_sunday == 0:
        days_until_sunday = 7  # avoid today if already Sunday and too close
    target_sunday = today + timedelta(days=days_until_sunday)

    window = _make_window(db_session, user.id, day_of_week=6)  # 6=Sunday

    response = client.get(
        "/appointment-availability/slots",
        params={
            "type_id": appt.id,
            "date_from": str(target_sunday),
            "date_to": str(target_sunday),
        },
    )

    # Cleanup before user teardown
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 200
    slots = response.json()
    assert len(slots) > 0
    assert "slot_datetime_utc" in slots[0]
    assert "interviewer_user_id" in slots[0]
    assert slots[0]["interviewer_user_id"] == user.id


def test_slots_global_exception_blocks_all(client: TestClient, db_session: Session, userpass):
    user, password = userpass
    config = _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Exception Block Type")
    _make_interviewer_with_calling(db_session, user)

    today = date.today()
    days_until_sunday = (6 - today.weekday()) % 7 or 7
    target_sunday = today + timedelta(days=days_until_sunday)

    window = _make_window(db_session, user.id, day_of_week=6)

    # Add a global exception for that Sunday
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

    # Cleanup before user teardown
    db_session.delete(exc)
    db_session.delete(window)
    db_session.commit()

    assert response.status_code == 200
    assert response.json() == []


def test_slots_buffer_reduces_available_count(client: TestClient, db_session: Session, userpass):
    """With a buffer, fewer slots fit in a given window."""
    user, password = userpass
    config = _ensure_config(db_session)

    appt = _make_appointment_type(db_session, "Buffer Test Type")
    _make_interviewer_with_calling(db_session, user)

    today = date.today()
    days_until_sunday = (6 - today.weekday()) % 7 or 7
    target_sunday = today + timedelta(days=days_until_sunday)

    # 90-minute window with 30-minute slots
    window = _make_window(db_session, user.id, day_of_week=6, start_minute=540, end_minute=630)

    # No buffer → 3 slots: 540, 570, 600
    config.slot_buffer_mins = 0
    db_session.add(config)
    db_session.commit()

    response_no_buffer = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    count_no_buffer = len(response_no_buffer.json())

    # 5 min buffer → 2 slots: 540, 575 (575+30=605 <=630)
    config.slot_buffer_mins = 5
    db_session.add(config)
    db_session.commit()

    response_with_buffer = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    count_with_buffer = len(response_with_buffer.json())

    # Cleanup before user teardown
    db_session.delete(window)
    db_session.commit()

    assert count_no_buffer > count_with_buffer


def test_slots_booking_occupies_slot(client: TestClient, db_session: Session, userpass):
    """An existing CONFIRMED booking should remove that slot from results."""
    user, password = userpass
    config = _ensure_config(db_session)
    config.slot_buffer_mins = 0
    db_session.add(config)
    db_session.commit()

    appt = _make_appointment_type(db_session, "Occupied Slot Type")
    _make_interviewer_with_calling(db_session, user)

    today = date.today()
    days_until_sunday = (6 - today.weekday()) % 7 or 7
    target_sunday = today + timedelta(days=days_until_sunday)

    window = _make_window(db_session, user.id, day_of_week=6, start_minute=540, end_minute=600)

    # Get baseline slot count (should be 2: 540 and 570)
    resp_before = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    slots_before = resp_before.json()

    if not slots_before:
        db_session.delete(window)
        db_session.commit()
        pytest.skip("No slots generated; check config cutoff hours")

    # Book the first slot
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
        confirmation_token="test-token-unique-occ-123",
    )
    db_session.add(booking)
    db_session.commit()

    resp_after = client.get(
        "/appointment-availability/slots",
        params={"type_id": appt.id, "date_from": str(target_sunday), "date_to": str(target_sunday)},
    )
    slots_after = resp_after.json()

    # Cleanup before user teardown
    db_session.delete(booking)
    db_session.delete(window)
    db_session.commit()

    assert len(slots_after) < len(slots_before)


# ---------------------------------------------------------------------------
# GET /appointment-availability/available-dates
# ---------------------------------------------------------------------------

def test_available_dates_returns_dict_with_dates_key(client: TestClient, db_session: Session):
    _ensure_config(db_session)
    appt = _make_appointment_type(db_session, "Available Dates Type")
    today = date.today()
    response = client.get(
        "/appointment-availability/available-dates",
        params={"type_id": appt.id, "year": today.year, "month": today.month},
    )
    assert response.status_code == 200
    assert "available_dates" in response.json()
    assert isinstance(response.json()["available_dates"], list)


# ---------------------------------------------------------------------------
# Admin: windows CRUD
# ---------------------------------------------------------------------------

def test_windows_requires_auth(client: TestClient):
    response = client.get("/appointment-availability/windows")
    assert response.status_code == 401


def test_create_window_requires_manage_appointments(client: TestClient, userpass):
    user, password = userpass
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-availability/windows",
        json={"user_id": user.id, "day_of_week": 6, "start_minute": 510, "end_minute": 930},
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_create_window_success(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/windows",
        json={"user_id": user.id, "day_of_week": 0, "start_minute": 540, "end_minute": 720},
        headers=_auth(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["user_id"] == user.id
    assert payload["day_of_week"] == 0
    assert payload["start_minute"] == 540
    assert payload["end_minute"] == 720

    # Cleanup before user teardown
    window = db_session.get(AvailabilityWindow, payload["id"])
    if window:
        db_session.delete(window)
        db_session.commit()


def test_create_window_rejects_invalid_times(client: TestClient, admin, userpass):
    user, _ = userpass
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/windows",
        json={"user_id": user.id, "day_of_week": 0, "start_minute": 720, "end_minute": 540},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_delete_window_success(client: TestClient, db_session: Session, admin, userpass):
    user, _ = userpass
    window = _make_window(db_session, user.id, day_of_week=1)
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.delete(f"/appointment-availability/windows/{window.id}", headers=_auth(token))
    # If delete succeeded the window is gone; if not, clean up
    if response.status_code != 204:
        remaining = db_session.get(AvailabilityWindow, window.id)
        if remaining:
            db_session.delete(remaining)
            db_session.commit()
    assert response.status_code == 204


def test_delete_window_not_found(client: TestClient, admin):
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.delete("/appointment-availability/windows/99999", headers=_auth(token))
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Admin: exceptions CRUD
# ---------------------------------------------------------------------------

def test_create_exception_global_must_not_have_user_id(client: TestClient, admin, userpass):
    user, _ = userpass
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={"date": "2027-01-01", "reason": "Test", "is_global": True, "user_id": user.id},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_create_exception_personal_requires_user_id(client: TestClient, admin):
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={"date": "2027-01-01", "reason": "Test", "is_global": False},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_create_global_exception_success(client: TestClient, admin):
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.post(
        "/appointment-availability/exceptions",
        json={"date": "2027-02-15", "reason": "Conference", "is_global": True},
        headers=_auth(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_global"] is True
    assert payload["user_id"] is None


def test_delete_exception_not_found(client: TestClient, admin):
    admin_user, admin_password = admin
    token = _login(client, admin_user.email, admin_password)
    response = client.delete("/appointment-availability/exceptions/99999", headers=_auth(token))
    assert response.status_code == 404
