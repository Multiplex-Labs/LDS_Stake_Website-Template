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


@pytest.fixture
def approver_headers(client, userpass, db_session):
    """Ready-to-use auth headers for a user with APPROVE_BLDG_RESERVATIONS permission."""
    user, password = userpass
    _grant_reservation_approval_perm(db_session, user)
    return auth_headers(login(client, user.email, password))


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


def test_list_reservations_with_permission(client: TestClient, approver_headers):
    # Create one reservation first
    client.post("/reservations", json=VALID_PAYLOAD)

    resp = client.get("/reservations", headers=approver_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "has_conflict" in data[0]


# ---------------------------------------------------------------------------
# GET /reservations/{id} — detail
# ---------------------------------------------------------------------------

def test_get_reservation_detail(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.get(f"/reservations/{reservation_id}", headers=approver_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == reservation_id


def test_get_reservation_not_found(client: TestClient, approver_headers):
    resp = client.get("/reservations/99999", headers=approver_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /reservations/{id}/approve
# ---------------------------------------------------------------------------

def test_approve_pending_reservation(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(f"/reservations/{reservation_id}/approve", headers=approver_headers)
    assert resp.status_code == 200

    detail = client.get(f"/reservations/{reservation_id}", headers=approver_headers).json()
    assert detail["status"] == "APPROVED"
    assert detail["reviewed_by"] is not None

    # Cleanup: remove reservation to avoid FK violation when userpass fixture deletes the user
    # (SQLite enforces PRAGMA foreign_keys=ON; reviewed_by references user.id)
    client.delete(f"/reservations/{reservation_id}", headers=approver_headers)


def test_approve_already_approved_returns_409(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    client.post(f"/reservations/{reservation_id}/approve", headers=approver_headers)
    resp = client.post(f"/reservations/{reservation_id}/approve", headers=approver_headers)
    assert resp.status_code == 409

    # Cleanup: remove reservation so reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{reservation_id}", headers=approver_headers)


# ---------------------------------------------------------------------------
# POST /reservations/{id}/deny
# ---------------------------------------------------------------------------

def test_deny_pending_reservation(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "Date conflicts with stake conference"},
        headers=approver_headers,
    )
    assert resp.status_code == 200

    detail = client.get(f"/reservations/{reservation_id}", headers=approver_headers).json()
    assert detail["status"] == "DENIED"
    assert detail["denial_reason"] == "Date conflicts with stake conference"

    # Cleanup: remove reservation so reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{reservation_id}", headers=approver_headers)


def test_deny_without_reason_returns_422(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": ""},
        headers=approver_headers,
    )
    assert resp.status_code == 422


def test_deny_empty_reason_body_returns_422(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={},
        headers=approver_headers,
    )
    assert resp.status_code == 422


def test_deny_already_denied_returns_409(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "First denial"},
        headers=approver_headers,
    )
    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "Second denial"},
        headers=approver_headers,
    )
    assert resp.status_code == 409

    # Cleanup: remove reservation so reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{reservation_id}", headers=approver_headers)


# ---------------------------------------------------------------------------
# DELETE /reservations/{id}
# ---------------------------------------------------------------------------

def test_delete_reservation(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    resp = client.delete(f"/reservations/{reservation_id}", headers=approver_headers)
    assert resp.status_code == 204

    get_resp = client.get(f"/reservations/{reservation_id}", headers=approver_headers)
    assert get_resp.status_code == 404


def test_delete_not_found_returns_404(client: TestClient, approver_headers):
    resp = client.delete("/reservations/99999", headers=approver_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Conflict detection — DENIED does not trigger conflict
# ---------------------------------------------------------------------------

def test_denied_reservation_does_not_cause_conflict(client: TestClient, approver_headers):
    # Create and deny first reservation
    payload1 = {**VALID_PAYLOAD, "date": "2027-09-10"}
    r1 = client.post("/reservations", json=payload1).json()
    client.post(
        f"/reservations/{r1['id']}/deny",
        json={"reason": "Too late"},
        headers=approver_headers,
    )

    # Create second reservation same date, same rooms
    payload2 = {**VALID_PAYLOAD, "date": "2027-09-10", "event_name": "New Event"}
    r2 = client.post("/reservations", json=payload2).json()
    assert r2["has_conflict"] is False

    # Cleanup: r1 was denied (reviewed_by set), r2 is still PENDING; delete both
    # so the reviewed_by FK doesn't block userpass teardown
    client.delete(f"/reservations/{r1['id']}", headers=approver_headers)
    client.delete(f"/reservations/{r2['id']}", headers=approver_headers)


# ---------------------------------------------------------------------------
# Group A — Auth tests for mutating endpoints
# ---------------------------------------------------------------------------

def test_approve_reservation_unauthenticated_returns_401(client: TestClient):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    resp = client.post(f"/reservations/{created['id']}/approve")
    assert resp.status_code == 401


def test_approve_reservation_no_permission_returns_403(client: TestClient, userpass):
    user, password = userpass
    token = login(client, user.email, password)
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    resp = client.post(f"/reservations/{created['id']}/approve", headers=auth_headers(token))
    assert resp.status_code == 403


def test_deny_reservation_unauthenticated_returns_401(client: TestClient):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    resp = client.post(f"/reservations/{created['id']}/deny", json={"reason": "test"})
    assert resp.status_code == 401


def test_deny_reservation_no_permission_returns_403(client: TestClient, userpass):
    user, password = userpass
    token = login(client, user.email, password)
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    resp = client.post(
        f"/reservations/{created['id']}/deny",
        json={"reason": "test"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 403


def test_delete_reservation_unauthenticated_returns_401(client: TestClient):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    resp = client.delete(f"/reservations/{created['id']}")
    assert resp.status_code == 401


def test_delete_reservation_no_permission_returns_403(client: TestClient, userpass):
    user, password = userpass
    token = login(client, user.email, password)
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    resp = client.delete(f"/reservations/{created['id']}", headers=auth_headers(token))
    assert resp.status_code == 403


def test_get_reservation_detail_unauthenticated_returns_401(client: TestClient):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    resp = client.get(f"/reservations/{created['id']}")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Group B — Cross-status 409
# ---------------------------------------------------------------------------

def test_deny_already_approved_reservation_returns_409(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    client.post(f"/reservations/{reservation_id}/approve", headers=approver_headers)
    resp = client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "Changed my mind"},
        headers=approver_headers,
    )
    assert resp.status_code == 409
    client.delete(f"/reservations/{reservation_id}", headers=approver_headers)


def test_approve_already_denied_reservation_returns_409(client: TestClient, approver_headers):
    created = client.post("/reservations", json=VALID_PAYLOAD).json()
    reservation_id = created["id"]

    client.post(
        f"/reservations/{reservation_id}/deny",
        json={"reason": "Not suitable"},
        headers=approver_headers,
    )
    resp = client.post(f"/reservations/{reservation_id}/approve", headers=approver_headers)
    assert resp.status_code == 409
    client.delete(f"/reservations/{reservation_id}", headers=approver_headers)


# ---------------------------------------------------------------------------
# Group C — 404 on approve/deny non-existent
# ---------------------------------------------------------------------------

def test_approve_nonexistent_reservation_returns_404(client: TestClient, approver_headers):
    resp = client.post("/reservations/99999/approve", headers=approver_headers)
    assert resp.status_code == 404


def test_deny_nonexistent_reservation_returns_404(client: TestClient, approver_headers):
    resp = client.post(
        "/reservations/99999/deny",
        json={"reason": "Does not exist"},
        headers=approver_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Group D — List filter params
# ---------------------------------------------------------------------------

def test_list_reservations_filter_by_status(client: TestClient, approver_headers):
    r1 = client.post("/reservations", json={**VALID_PAYLOAD, "date": "2028-01-10"}).json()
    r2 = client.post(
        "/reservations",
        json={**VALID_PAYLOAD, "date": "2028-01-11", "event_name": "Second Event"},
    ).json()

    client.post(f"/reservations/{r1['id']}/approve", headers=approver_headers)

    pending = client.get("/reservations?status=PENDING", headers=approver_headers).json()
    approved = client.get("/reservations?status=APPROVED", headers=approver_headers).json()

    assert all(r["status"] == "PENDING" for r in pending)
    assert all(r["status"] == "APPROVED" for r in approved)
    assert any(r["id"] == r2["id"] for r in pending)
    assert any(r["id"] == r1["id"] for r in approved)

    client.delete(f"/reservations/{r1['id']}", headers=approver_headers)
    client.delete(f"/reservations/{r2['id']}", headers=approver_headers)


def test_list_reservations_filter_by_date(client: TestClient, approver_headers):
    target_date = "2028-02-15"
    r1 = client.post("/reservations", json={**VALID_PAYLOAD, "date": target_date}).json()
    r2 = client.post(
        "/reservations",
        json={**VALID_PAYLOAD, "date": "2028-02-16", "event_name": "Other"},
    ).json()

    filtered = client.get(f"/reservations?date={target_date}", headers=approver_headers).json()

    assert all(r["date"] == target_date for r in filtered)
    assert any(r["id"] == r1["id"] for r in filtered)
    assert all(r["id"] != r2["id"] for r in filtered)

    client.delete(f"/reservations/{r1['id']}", headers=approver_headers)
    client.delete(f"/reservations/{r2['id']}", headers=approver_headers)


# ---------------------------------------------------------------------------
# Group E — ICS utility coverage
# ---------------------------------------------------------------------------

def test_generate_ics_returns_valid_calendar():
    """generate_ics returns parseable iCalendar bytes with one VEVENT."""
    from datetime import date as date_type
    from src.utils.ics import generate_ics
    from icalendar import Calendar

    ics_bytes = generate_ics(
        event_name="Test Event",
        event_date=date_type(2027, 6, 15),
        start_time="18:00",
        end_time="21:00",
        organizer_email="test@example.com",
    )

    assert isinstance(ics_bytes, bytes)
    cal = Calendar.from_ical(ics_bytes)
    events = [c for c in cal.walk() if c.name == "VEVENT"]
    assert len(events) == 1


def test_generate_ics_correct_dtstart_dtend():
    """DTSTART and DTEND match the provided date and times."""
    from datetime import date as date_type, datetime
    from src.utils.ics import generate_ics
    from icalendar import Calendar

    ics_bytes = generate_ics(
        event_name="Party",
        event_date=date_type(2027, 1, 15),
        start_time="18:00",
        end_time="21:00",
        organizer_email="org@example.com",
    )

    cal = Calendar.from_ical(ics_bytes)
    event = next(c for c in cal.walk() if c.name == "VEVENT")
    dtstart = event.get("DTSTART").dt
    dtend = event.get("DTEND").dt

    assert dtstart == datetime(2027, 1, 15, 18, 0)
    assert dtend == datetime(2027, 1, 15, 21, 0)


# ---------------------------------------------------------------------------
# Group F — APPROVED reservation triggers conflict flag
# ---------------------------------------------------------------------------

def test_approved_reservation_triggers_conflict_flag(client: TestClient, approver_headers):
    payload1 = {**VALID_PAYLOAD, "date": "2028-03-20"}
    r1 = client.post("/reservations", json=payload1).json()
    client.post(f"/reservations/{r1['id']}/approve", headers=approver_headers)

    payload2 = {**VALID_PAYLOAD, "date": "2028-03-20", "event_name": "Conflicting Event"}
    r2 = client.post("/reservations", json=payload2).json()
    assert r2["has_conflict"] is True

    client.delete(f"/reservations/{r1['id']}", headers=approver_headers)
    client.delete(f"/reservations/{r2['id']}", headers=approver_headers)


# ---------------------------------------------------------------------------
# Group G — needs_access=True approved triggers access notify branch
# ---------------------------------------------------------------------------

def test_approve_with_needs_access_succeeds(client: TestClient, approver_headers):
    """Approving a needs_access=True reservation completes successfully (notify path exercised)."""
    payload = {**VALID_PAYLOAD, "needs_access": True}
    created = client.post("/reservations", json=payload).json()
    assert created["needs_access"] is True

    resp = client.post(f"/reservations/{created['id']}/approve", headers=approver_headers)
    assert resp.status_code == 200

    detail = client.get(f"/reservations/{created['id']}", headers=approver_headers).json()
    assert detail["status"] == "APPROVED"
    client.delete(f"/reservations/{created['id']}", headers=approver_headers)
