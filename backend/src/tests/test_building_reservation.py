import json
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import Permission, Permissions
from src.models.building_reservation import BuildingReservation, ReservationStatus

from .conftest import login, auth_headers


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_PAYLOAD = {
    "event_name": "Ward Christmas Party",
    "event_description": "Annual party",
    "date": "2027-12-15",
    "start_time": "18:00",
    "end_time": "21:00",
    "setup_time": "30m",
    "cleanup_time": "30m",
    "rooms": ["N. Cultural Hall (N. Gym)", "N. Kitchen"],
    "organizer_name": "John Smith",
    "organizer_email": "john@example.com",
    "organizer_phone": "4355551234",
    "organization": "Logan Married Student 9th Ward",
    "affiliation": "Ward Activity Reservation",
    "needs_access": False,
}


def _grant_reservation_approval_perm(db_session: Session, user) -> None:
    """Grant APPROVE_BLDG_RESERVATIONS (1024) to a user."""
    perm = db_session.exec(
        select(Permissions).where(
            Permissions.foreign_id == str(user.id),
            Permissions.is_calling == False,
        )
    ).first()
    if perm:
        perm.scopes = perm.scopes | 1024
    else:
        perm = Permissions(foreign_id=str(user.id), is_calling=False, scopes=1024)
    db_session.add(perm)
    db_session.commit()


# ---------------------------------------------------------------------------
# POST /reservations — creation
# ---------------------------------------------------------------------------

def test_create_reservation_returns_201(client: TestClient):
    resp = client.post("/reservations", json=VALID_PAYLOAD)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "PENDING"
    assert data["event_name"] == "Ward Christmas Party"
    assert data["rooms"] == ["N. Cultural Hall (N. Gym)", "N. Kitchen"]
    assert "has_conflict" in data


def test_create_reservation_missing_required_field_returns_422(client: TestClient):
    payload = {**VALID_PAYLOAD}
    del payload["organizer_email"]
    resp = client.post("/reservations", json=payload)
    assert resp.status_code == 422


def test_create_reservation_no_auth_required(client: TestClient):
    resp = client.post("/reservations", json=VALID_PAYLOAD)
    assert resp.status_code == 201


def test_create_reservation_conflict_flag(client: TestClient):
    # Create first reservation
    payload1 = {**VALID_PAYLOAD, "date": "2027-11-20"}
    resp1 = client.post("/reservations", json=payload1)
    assert resp1.status_code == 201
    assert resp1.json()["has_conflict"] is False

    # Create second reservation same date, overlapping room
    payload2 = {**VALID_PAYLOAD, "date": "2027-11-20", "event_name": "Another Event"}
    resp2 = client.post("/reservations", json=payload2)
    assert resp2.status_code == 201
    assert resp2.json()["has_conflict"] is True


def test_create_reservation_no_conflict_different_rooms(client: TestClient):
    payload1 = {**VALID_PAYLOAD, "date": "2027-10-05", "rooms": ["N. Chapel"]}
    resp1 = client.post("/reservations", json=payload1)
    assert resp1.status_code == 201

    payload2 = {**VALID_PAYLOAD, "date": "2027-10-05", "rooms": ["S. Kitchen"], "event_name": "Event 2"}
    resp2 = client.post("/reservations", json=payload2)
    assert resp2.status_code == 201
    assert resp2.json()["has_conflict"] is False


# ---------------------------------------------------------------------------
# GET /reservations — list (admin only)
# ---------------------------------------------------------------------------

def test_list_reservations_unauthenticated_returns_401(client: TestClient):
    resp = client.get("/reservations")
    assert resp.status_code == 401


def test_list_reservations_no_permission_returns_403(client: TestClient, userpass, db_session):
    user, password = userpass
    token = login(client, user.email, password)
    resp = client.get("/reservations", headers=auth_headers(token))
    assert resp.status_code == 403


def test_list_reservations_with_permission(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    # Create one reservation first
    client.post("/reservations", json=VALID_PAYLOAD)

    resp = client.get("/reservations", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "has_conflict" in data[0]


# ---------------------------------------------------------------------------
# GET /reservations/{id} — detail
# ---------------------------------------------------------------------------

def test_get_reservation_detail(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.get(f"/reservations/{reservation_id}", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["id"] == reservation_id


def test_get_reservation_not_found(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    resp = client.get("/reservations/99999", headers=auth_headers(token))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /reservations/{id}/approve
# ---------------------------------------------------------------------------

def test_approve_pending_reservation(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(f"/reservations/{reservation_id}/approve", headers=auth_headers(token))
    assert resp.status_code == 200

    detail = client.get(f"/reservations/{reservation_id}", headers=auth_headers(token)).json()
    assert detail["status"] == "APPROVED"
    assert detail["reviewed_by"] is not None

    # Cleanup: remove reservation to avoid FK violation when userpass fixture deletes the user
    # (SQLite enforces PRAGMA foreign_keys=ON; reviewed_by references user.id)
    client.delete(f"/reservations/{reservation_id}", headers=auth_headers(token))


def test_approve_already_approved_returns_409(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    client.post(f"/reservations/{reservation_id}/approve", headers=auth_headers(token))
    resp = client.post(f"/reservations/{reservation_id}/approve", headers=auth_headers(token))
    assert resp.status_code == 409

    # Cleanup: remove reservation so reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{reservation_id}", headers=auth_headers(token))


# ---------------------------------------------------------------------------
# POST /reservations/{id}/deny
# ---------------------------------------------------------------------------

def test_deny_pending_reservation(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "Date conflicts with stake conference"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200

    detail = client.get(f"/reservations/{reservation_id}", headers=auth_headers(token)).json()
    assert detail["status"] == "DENIED"
    assert detail["denial_reason"] == "Date conflicts with stake conference"

    # Cleanup: remove reservation so reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{reservation_id}", headers=auth_headers(token))


def test_deny_without_reason_returns_422(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": ""},
        headers=auth_headers(token),
    )
    assert resp.status_code == 422


def test_deny_empty_reason_body_returns_422(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={},
        headers=auth_headers(token),
    )
    assert resp.status_code == 422


def test_deny_already_denied_returns_409(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "First denial"},
        headers=auth_headers(token),
    )
    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "Second denial"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 409

    # Cleanup: remove reservation so reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{reservation_id}", headers=auth_headers(token))


# ---------------------------------------------------------------------------
# DELETE /reservations/{id}
# ---------------------------------------------------------------------------

def test_delete_reservation(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.delete(f"/reservations/{reservation_id}", headers=auth_headers(token))
    assert resp.status_code == 204

    get_resp = client.get(f"/reservations/{reservation_id}", headers=auth_headers(token))
    assert get_resp.status_code == 404


def test_delete_not_found_returns_404(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    resp = client.delete("/reservations/99999", headers=auth_headers(token))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Conflict detection — DENIED does not trigger conflict
# ---------------------------------------------------------------------------

def test_denied_reservation_does_not_cause_conflict(client: TestClient, userpass, db_session):
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    token = login(client, user.email, password)

    # Create and deny first reservation
    payload1 = {**VALID_PAYLOAD, "date": "2027-09-10"}
    r1 = client.post("/reservations", json=payload1).json()
    client.post(
        f"/reservations/{r1['id']}/deny",
        json={"reason": "Too late"},
        headers=auth_headers(token),
    )

    # Create second reservation same date, same rooms
    payload2 = {**VALID_PAYLOAD, "date": "2027-09-10", "event_name": "New Event"}
    r2 = client.post("/reservations", json=payload2).json()
    assert r2["has_conflict"] is False

    # Cleanup: r1 was denied (reviewed_by set), r2 is still PENDING; delete both
    # so the reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{r1['id']}", headers=auth_headers(token))
    client.delete(f"/reservations/{r2['id']}", headers=auth_headers(token))
