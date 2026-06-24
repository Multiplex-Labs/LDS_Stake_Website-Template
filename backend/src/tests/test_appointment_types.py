"""Tests for appointment types CRUD endpoints."""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import (
    AppointmentType,
    Booking,
    BookingStatus,
    TempleRecommendConfig,
)

from .conftest import (
    ensure_temple_config,
    make_appointment_type,
    make_interviewer_with_calling,
    make_availability_window,
    build_slot_utc,
    get_next_weekday,
    cleanup_booking,
    login,
    auth_headers,
)


def _create_type(
    session: Session,
    name: str = "Test Type",
    system_defined: bool = False,
    is_active: bool = True,
) -> AppointmentType:
    """Create and persist an AppointmentType directly."""
    appt = AppointmentType(
        name=name,
        description="Test description",
        duration_mins=30,
        details="Some details",
        icon_name="Calendar",
        is_active=is_active,
        display_order=99,
        system_defined=system_defined,
    )
    session.add(appt)
    session.commit()
    session.refresh(appt)
    return appt


# ---------------------------------------------------------------------------
# GET /appointment-types
# ---------------------------------------------------------------------------

def test_list_appointment_types_public(client: TestClient, db_session: Session):
    _create_type(db_session, "Active Type")
    response = client.get("/appointment-types/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_list_appointment_types_excludes_inactive(client: TestClient, db_session: Session):
    _create_type(db_session, "Inactive Type List", is_active=False)
    response = client.get("/appointment-types/")
    assert response.status_code == 200
    names = [t["name"] for t in response.json()]
    assert "Inactive Type List" not in names


def test_list_appointment_types_ordered_by_display_order(client: TestClient, db_session: Session):
    _create_type(db_session, "Order Type A")
    _create_type(db_session, "Order Type B")
    response = client.get("/appointment-types/")
    assert response.status_code == 200
    orders = [t["display_order"] for t in response.json()]
    assert orders == sorted(orders)


# ---------------------------------------------------------------------------
# POST /appointment-types
# ---------------------------------------------------------------------------

def test_create_appointment_type_requires_auth(client: TestClient):
    response = client.post(
        "/appointment-types/",
        json={"name": "No Auth Type", "icon_name": "Calendar"},
    )
    assert response.status_code == 401


def test_create_appointment_type_requires_permission(client: TestClient, userpass):
    user, password = userpass
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "No Perm Type", "icon_name": "Calendar"},
        headers=auth_headers(token),
    )
    assert response.status_code == 403


def test_create_appointment_type_success(client: TestClient, admin):
    user, password = admin
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "New Type XYZ", "icon_name": "Star", "duration_mins": 45},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "New Type XYZ"
    assert payload["icon_name"] == "Star"
    assert payload["duration_mins"] == 45
    assert payload["system_defined"] is False


def test_create_appointment_type_invalid_icon(client: TestClient, admin):
    user, password = admin
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "Bad Icon Type", "icon_name": "InvalidIconNotInList"},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_create_appointment_type_duplicate_name(client: TestClient, db_session: Session, admin):
    _create_type(db_session, "Dup Name Type")
    user, password = admin
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "Dup Name Type", "icon_name": "Calendar"},
        headers=auth_headers(token),
    )
    assert response.status_code == 400


def test_create_appointment_type_auto_display_order(
    client: TestClient, db_session: Session, admin
):
    existing = _create_type(db_session, "Existing Type For Order")
    existing.display_order = 5
    db_session.add(existing)
    db_session.commit()

    user, password = admin
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "Auto Order Type", "icon_name": "Clock"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["display_order"] > 5


# ---------------------------------------------------------------------------
# PATCH /appointment-types/{id}
# ---------------------------------------------------------------------------

def test_patch_appointment_type_success(client: TestClient, db_session: Session, admin):
    appt = _create_type(db_session, "Patch Target")
    user, password = admin
    token = login(client, user.email, password)
    response = client.patch(
        f"/appointment-types/{appt.id}",
        json={"description": "Updated description"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["type"]["description"] == "Updated description"
    assert response.json()["warnings"] == []


def test_patch_appointment_type_invalid_icon(client: TestClient, db_session: Session, admin):
    appt = _create_type(db_session, "Patch Icon Test")
    user, password = admin
    token = login(client, user.email, password)
    response = client.patch(
        f"/appointment-types/{appt.id}",
        json={"icon_name": "NotAnIcon"},
        headers=auth_headers(token),
    )
    assert response.status_code == 422


def test_patch_appointment_type_not_found(client: TestClient, admin):
    user, password = admin
    token = login(client, user.email, password)
    response = client.patch(
        "/appointment-types/99999",
        json={"description": "x"},
        headers=auth_headers(token),
    )
    assert response.status_code == 404


def test_patch_type_duration_warns_when_future_bookings_exist(
    client: TestClient, db_session: Session, admin, userpass
):
    """Changing duration_mins should emit a warning when future CONFIRMED bookings exist."""
    user, _ = userpass
    ensure_temple_config(db_session)
    appt = _create_type(db_session, "Duration Warn Type")
    make_interviewer_with_calling(db_session, user, prefix="DurationWarn")

    target_day = get_next_weekday(2)  # Wednesday
    slot_utc = build_slot_utc(target_day, 9, 30)

    # Create a CONFIRMED future booking for this appointment type directly
    booking = Booking(
        appointment_type_id=appt.id,
        interviewer_user_id=user.id,
        member_name="Future Member",
        member_email="future@example.com",
        member_phone="555-7777",
        booking_date=target_day,
        start_minute_of_day=570,
        end_minute_of_day=600,
        start_datetime=slot_utc,
        end_datetime=slot_utc + timedelta(minutes=30),
        status=BookingStatus.CONFIRMED,
        confirmation_token="duration-warn-token-unique",
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)
    response = client.patch(
        f"/appointment-types/{appt.id}",
        json={"duration_mins": 45},
        headers=auth_headers(token),
    )

    cleanup_booking(db_session, booking)

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["warnings"]) > 0


# ---------------------------------------------------------------------------
# DELETE /appointment-types/{id}
# ---------------------------------------------------------------------------

def test_delete_appointment_type_success(client: TestClient, db_session: Session, admin):
    appt = _create_type(db_session, "Delete Me Type")
    user, password = admin
    token = login(client, user.email, password)
    response = client.delete(f"/appointment-types/{appt.id}", headers=auth_headers(token))
    assert response.status_code == 204


def test_delete_appointment_type_system_defined_returns_409(
    client: TestClient, db_session: Session, admin
):
    appt = _create_type(db_session, "System Defined Type", system_defined=True)
    user, password = admin
    token = login(client, user.email, password)
    response = client.delete(f"/appointment-types/{appt.id}", headers=auth_headers(token))
    assert response.status_code == 409


def test_delete_appointment_type_not_found(client: TestClient, admin):
    user, password = admin
    token = login(client, user.email, password)
    response = client.delete("/appointment-types/99999", headers=auth_headers(token))
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /appointment-types/reorder
# ---------------------------------------------------------------------------

def test_reorder_appointment_types(client: TestClient, db_session: Session, admin):
    a = _create_type(db_session, "Reorder A")
    b = _create_type(db_session, "Reorder B")

    user, password = admin
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-types/reorder",
        json=[
            {"id": a.id, "display_order": 10},
            {"id": b.id, "display_order": 5},
        ],
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    results = {t["id"]: t["display_order"] for t in response.json()}
    assert results[a.id] == 10
    assert results[b.id] == 5


def test_reorder_with_unknown_id_returns_404(client: TestClient, admin):
    user, password = admin
    token = login(client, user.email, password)
    response = client.post(
        "/appointment-types/reorder",
        json=[{"id": 99999, "display_order": 1}],
        headers=auth_headers(token),
    )
    assert response.status_code == 404
