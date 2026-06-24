"""Tests for appointment types CRUD endpoints."""
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import AppointmentType, Booking, BookingStatus, TempleRecommendConfig


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ensure_config(session: Session):
    if session.get(TempleRecommendConfig, 1) is None:
        session.add(TempleRecommendConfig(id=1))
        session.commit()


def _create_type(session: Session, name: str = "Test Type", system_defined: bool = False) -> AppointmentType:
    appt = AppointmentType(
        name=name,
        description="Test description",
        duration_mins=30,
        details="Some details",
        icon_name="Calendar",
        is_active=True,
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
    inactive = AppointmentType(
        name="Inactive Type",
        description="",
        duration_mins=30,
        details="",
        icon_name="Calendar",
        is_active=False,
        display_order=1,
        system_defined=False,
    )
    db_session.add(inactive)
    db_session.commit()
    response = client.get("/appointment-types/")
    assert response.status_code == 200
    names = [t["name"] for t in response.json()]
    assert "Inactive Type" not in names


def test_list_appointment_types_ordered_by_display_order(client: TestClient, db_session: Session):
    _create_type(db_session, "Type A")
    _create_type(db_session, "Type B")
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
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "No Perm Type", "icon_name": "Calendar"},
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_create_appointment_type_success(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "New Type XYZ", "icon_name": "Star", "duration_mins": 45},
        headers=_auth(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "New Type XYZ"
    assert payload["icon_name"] == "Star"
    assert payload["duration_mins"] == 45
    assert payload["system_defined"] is False


def test_create_appointment_type_invalid_icon(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "Bad Icon Type", "icon_name": "InvalidIconNotInList"},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_create_appointment_type_duplicate_name(client: TestClient, db_session: Session, admin):
    _create_type(db_session, "Dup Name Type")
    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "Dup Name Type", "icon_name": "Calendar"},
        headers=_auth(token),
    )
    assert response.status_code == 400


def test_create_appointment_type_auto_display_order(client: TestClient, db_session: Session, admin):
    existing = _create_type(db_session, "Existing Type")
    existing.display_order = 5
    db_session.add(existing)
    db_session.commit()

    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-types/",
        json={"name": "Auto Order Type", "icon_name": "Clock"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json()["display_order"] > 5


# ---------------------------------------------------------------------------
# PATCH /appointment-types/{id}
# ---------------------------------------------------------------------------

def test_patch_appointment_type_success(client: TestClient, db_session: Session, admin):
    appt = _create_type(db_session, "Patch Target")
    user, password = admin
    token = _login(client, user.email, password)
    response = client.patch(
        f"/appointment-types/{appt.id}",
        json={"description": "Updated description"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json()["type"]["description"] == "Updated description"
    assert response.json()["warnings"] == []


def test_patch_appointment_type_invalid_icon(client: TestClient, db_session: Session, admin):
    appt = _create_type(db_session, "Patch Icon")
    user, password = admin
    token = _login(client, user.email, password)
    response = client.patch(
        f"/appointment-types/{appt.id}",
        json={"icon_name": "NotAnIcon"},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_patch_appointment_type_not_found(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.patch(
        "/appointment-types/99999",
        json={"description": "x"},
        headers=_auth(token),
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /appointment-types/{id}
# ---------------------------------------------------------------------------

def test_delete_appointment_type_success(client: TestClient, db_session: Session, admin):
    appt = _create_type(db_session, "Delete Me")
    user, password = admin
    token = _login(client, user.email, password)
    response = client.delete(f"/appointment-types/{appt.id}", headers=_auth(token))
    assert response.status_code == 204


def test_delete_appointment_type_system_defined_returns_409(client: TestClient, db_session: Session, admin):
    appt = _create_type(db_session, "System Defined Type", system_defined=True)
    user, password = admin
    token = _login(client, user.email, password)
    response = client.delete(f"/appointment-types/{appt.id}", headers=_auth(token))
    assert response.status_code == 409


def test_delete_appointment_type_not_found(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.delete("/appointment-types/99999", headers=_auth(token))
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /appointment-types/reorder
# ---------------------------------------------------------------------------

def test_reorder_appointment_types(client: TestClient, db_session: Session, admin):
    a = _create_type(db_session, "Reorder A")
    b = _create_type(db_session, "Reorder B")

    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-types/reorder",
        json=[
            {"id": a.id, "display_order": 10},
            {"id": b.id, "display_order": 5},
        ],
        headers=_auth(token),
    )
    assert response.status_code == 200
    results = {t["id"]: t["display_order"] for t in response.json()}
    assert results[a.id] == 10
    assert results[b.id] == 5


def test_reorder_with_unknown_id_returns_404(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/appointment-types/reorder",
        json=[{"id": 99999, "display_order": 1}],
        headers=_auth(token),
    )
    assert response.status_code == 404
