"""Tests for GET /presidency-assignments/ and PUT /presidency-assignments/{calling_id}."""

from typing import Tuple

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import Calling, Permissions, Permission, PresidencyAssignment, User, UserCalling, Ward
from src.routers.presidency import _parse_responsibilities, _parse_wards_overseen


PRESIDENCY_CALLING_NAMES = {"Stake President", "First Counselor", "Second Counselor"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def login_client(client: TestClient, email: str, password: str) -> str:
    r = client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def auth_headers(client: TestClient, email: str, password: str) -> dict:
    token = login_client(client, email, password)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# authenticated GET returns exactly 3 rows
# ---------------------------------------------------------------------------

def test_get_returns_three_rows(client: TestClient, userpass: Tuple):
    user, password = userpass
    headers = auth_headers(client, user.email, password)

    r = client.get("/presidency-assignments/", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 3

    returned_names = {item["calling_name"] for item in data}
    assert returned_names == PRESIDENCY_CALLING_NAMES


# ---------------------------------------------------------------------------
# unauthenticated GET returns 401
# ---------------------------------------------------------------------------

def test_get_unauthenticated_returns_401(client: TestClient):
    r = client.get("/presidency-assignments/")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET with a holder assigned shows current_holder
# ---------------------------------------------------------------------------

def test_get_with_holder(client: TestClient, db_session: Session, userpass: Tuple):
    user, password = userpass

    # Look up the "Stake President" calling
    calling = db_session.exec(
        select(Calling).where(Calling.name == "Stake President")
    ).first()
    assert calling is not None, "Stake President calling must exist"

    # Remove any existing UserCalling rows for this calling to get a clean state
    existing_ucs = db_session.exec(
        select(UserCalling).where(UserCalling.calling_id == calling.id)
    ).all()
    for uc in existing_ucs:
        db_session.delete(uc)
    db_session.commit()

    # Assign the test user to the Stake President calling
    uc = UserCalling(calling_id=calling.id, user_id=user.id, slot_number=1)
    db_session.add(uc)
    db_session.commit()
    db_session.refresh(uc)

    try:
        headers = auth_headers(client, user.email, password)
        r = client.get("/presidency-assignments/", headers=headers)
        assert r.status_code == 200
        data = r.json()

        sp_row = next((item for item in data if item["calling_name"] == "Stake President"), None)
        assert sp_row is not None
        assert sp_row["current_holder"] is not None
        assert sp_row["current_holder"]["fname"] == user.fname
        assert sp_row["current_holder"]["lname"] == user.lname
    finally:
        db_session.delete(uc)
        db_session.commit()


# ---------------------------------------------------------------------------
# admin PUT succeeds and round-trip GET reflects the update
# ---------------------------------------------------------------------------

def test_put_success_and_round_trip(
    client: TestClient, db_session: Session, admin: Tuple
):
    admin_user, admin_password = admin
    headers = auth_headers(client, admin_user.email, admin_password)

    # Find the calling_id for "First Counselor"
    calling = db_session.exec(
        select(Calling).where(Calling.name == "First Counselor")
    ).first()
    assert calling is not None

    payload = {
        "responsibilities": ["Sunday School", "Emergency Preparedness"],
        "ward_ids": [],
    }
    r = client.put(
        f"/presidency-assignments/{calling.id}",
        json=payload,
        headers=headers,
    )
    assert r.status_code == 200, f"PUT failed: {r.text}"
    body = r.json()
    assert body["calling_name"] == "First Counselor"
    assert body["responsibilities"] == ["Sunday School", "Emergency Preparedness"]
    assert body["wards_overseen"] == []

    # Round-trip GET should reflect the update
    r2 = client.get("/presidency-assignments/", headers=headers)
    assert r2.status_code == 200
    fc_row = next(
        (item for item in r2.json() if item["calling_name"] == "First Counselor"), None
    )
    assert fc_row is not None
    assert fc_row["responsibilities"] == ["Sunday School", "Emergency Preparedness"]


# ---------------------------------------------------------------------------
# unauthenticated PUT returns 401
# ---------------------------------------------------------------------------

def test_put_unauthenticated_returns_401(client: TestClient, db_session: Session):
    calling = db_session.exec(
        select(Calling).where(Calling.name == "Stake President")
    ).first()
    assert calling is not None

    r = client.put(
        f"/presidency-assignments/{calling.id}",
        json={"responsibilities": None, "ward_ids": []},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# PUT without MANAGE_ASSIGNMENTS returns 403
# ---------------------------------------------------------------------------

def test_put_without_permission_returns_403(
    client: TestClient, db_session: Session, userpass: Tuple
):
    user, password = userpass
    headers = auth_headers(client, user.email, password)

    calling = db_session.exec(
        select(Calling).where(Calling.name == "Stake President")
    ).first()
    assert calling is not None

    r = client.put(
        f"/presidency-assignments/{calling.id}",
        json={"responsibilities": None, "ward_ids": []},
        headers=headers,
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# PUT to unknown calling_id returns 404
# ---------------------------------------------------------------------------

def test_put_unknown_calling_id_returns_404(client: TestClient, admin: Tuple):
    admin_user, admin_password = admin
    headers = auth_headers(client, admin_user.email, admin_password)

    r = client.put(
        "/presidency-assignments/99999",
        json={"responsibilities": None, "ward_ids": []},
        headers=headers,
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# PUT with invalid ward ID returns 400
# ---------------------------------------------------------------------------

def test_put_invalid_ward_id_returns_400(
    client: TestClient, db_session: Session, admin: Tuple
):
    admin_user, admin_password = admin
    headers = auth_headers(client, admin_user.email, admin_password)

    calling = db_session.exec(
        select(Calling).where(Calling.name == "Second Counselor")
    ).first()
    assert calling is not None

    r = client.put(
        f"/presidency-assignments/{calling.id}",
        json={"responsibilities": None, "ward_ids": [99999]},
        headers=headers,
    )
    assert r.status_code == 400
    assert "Invalid ward IDs" in r.json()["detail"]


# ---------------------------------------------------------------------------
# PUT with real ward IDs persists and GET returns them
# ---------------------------------------------------------------------------

def test_put_with_ward_ids_round_trip(
    client: TestClient, db_session: Session, admin: Tuple
):
    """PUT with real ward IDs persists and GET returns them."""
    admin_user, admin_password = admin
    headers = auth_headers(client, admin_user.email, admin_password)

    # Find the calling_id for "First Counselor"
    calling = db_session.exec(
        select(Calling).where(Calling.name == "First Counselor")
    ).first()
    assert calling is not None

    # Verify wards 1 and 2 exist in the test DB (seeded by load_wards() in conftest)
    ward1 = db_session.get(Ward, 1)
    ward2 = db_session.get(Ward, 2)
    assert ward1 is not None, "Ward id=1 must exist (seeded from wards.csv)"
    assert ward2 is not None, "Ward id=2 must exist (seeded from wards.csv)"

    payload = {
        "responsibilities": None,
        "ward_ids": [1, 2],
    }
    r = client.put(
        f"/presidency-assignments/{calling.id}",
        json=payload,
        headers=headers,
    )
    assert r.status_code == 200, f"PUT failed: {r.text}"
    put_body = r.json()
    assert put_body["wards_overseen"] == [1, 2]

    # Round-trip GET should reflect the stored ward IDs
    r2 = client.get("/presidency-assignments/", headers=headers)
    assert r2.status_code == 200
    fc_row = next(
        (item for item in r2.json() if item["calling_name"] == "First Counselor"), None
    )
    assert fc_row is not None
    assert fc_row["wards_overseen"] == [1, 2]


# ---------------------------------------------------------------------------
# Gap 1: Legacy comma-string migration
# ---------------------------------------------------------------------------

def test_legacy_comma_string_responsibilities(
    client: TestClient, db_session: Session, userpass: Tuple
):
    """A row with a raw comma-separated responsibilities value (pre-JSON migration)
    must be returned as a proper list by GET without error."""
    user, password = userpass
    headers = auth_headers(client, user.email, password)

    calling = db_session.exec(
        select(Calling).where(Calling.name == "Second Counselor")
    ).first()
    assert calling is not None

    # Directly set a legacy comma string on the DB row (not valid JSON)
    row = db_session.exec(
        select(PresidencyAssignment).where(
            PresidencyAssignment.calling_id == calling.id
        )
    ).first()
    assert row is not None

    row.responsibilities = "Sunday School,Emergency Preparedness"
    db_session.add(row)
    db_session.commit()

    r = client.get("/presidency-assignments/", headers=headers)
    assert r.status_code == 200

    sc_row = next(
        (item for item in r.json() if item["calling_name"] == "Second Counselor"), None
    )
    assert sc_row is not None
    assert sc_row["responsibilities"] == ["Sunday School", "Emergency Preparedness"]

    # Restore to clean state
    row.responsibilities = None
    db_session.add(row)
    db_session.commit()


# ---------------------------------------------------------------------------
# Gap 2: Corrupt wards_overseen returns 200 with empty list, not 500
# ---------------------------------------------------------------------------

def test_corrupt_wards_overseen_returns_200_with_empty_list(
    client: TestClient, db_session: Session, userpass: Tuple
):
    """A corrupt wards_overseen value must cause GET to return HTTP 200
    with wards_overseen == [] for that row — not a 500."""
    user, password = userpass
    headers = auth_headers(client, user.email, password)

    calling = db_session.exec(
        select(Calling).where(Calling.name == "Stake President")
    ).first()
    assert calling is not None

    row = db_session.exec(
        select(PresidencyAssignment).where(
            PresidencyAssignment.calling_id == calling.id
        )
    ).first()
    assert row is not None

    row.wards_overseen = "not-json"
    db_session.add(row)
    db_session.commit()

    r = client.get("/presidency-assignments/", headers=headers)
    assert r.status_code == 200

    sp_row = next(
        (item for item in r.json() if item["calling_name"] == "Stake President"), None
    )
    assert sp_row is not None
    assert sp_row["wards_overseen"] == []

    # Restore to clean state
    row.wards_overseen = None
    db_session.add(row)
    db_session.commit()


# ---------------------------------------------------------------------------
# Gap 3: Unit tests for _parse_responsibilities and _parse_wards_overseen
# ---------------------------------------------------------------------------

def test_parse_responsibilities_valid_json_list():
    assert _parse_responsibilities('["A", "B"]') == ["A", "B"]


def test_parse_responsibilities_legacy_comma_fallback():
    assert _parse_responsibilities("A,B,C") == ["A", "B", "C"]


def test_parse_responsibilities_none_returns_empty():
    assert _parse_responsibilities(None) == []


def test_parse_responsibilities_filters_blank_strings():
    assert _parse_responsibilities('["A", " ", ""]') == ["A"]


def test_parse_wards_overseen_valid_json_list():
    assert _parse_wards_overseen('[1, 2]') == [1, 2]


def test_parse_wards_overseen_corrupt_returns_empty():
    assert _parse_wards_overseen("not-json") == []


# ---------------------------------------------------------------------------
# Gap 4: Empty array round-trip
# ---------------------------------------------------------------------------

def test_empty_responsibilities_round_trip(
    client: TestClient, db_session: Session, admin: Tuple
):
    """PUT with responsibilities=[] stores None in the DB, which GET reads
    back as [] — the round-trip must be stable."""
    admin_user, admin_password = admin
    headers = auth_headers(client, admin_user.email, admin_password)

    calling = db_session.exec(
        select(Calling).where(Calling.name == "Stake President")
    ).first()
    assert calling is not None

    # First set something non-empty so the round-trip is meaningful
    r_set = client.put(
        f"/presidency-assignments/{calling.id}",
        json={"responsibilities": ["Placeholder"], "ward_ids": []},
        headers=headers,
    )
    assert r_set.status_code == 200

    # Now PUT with empty arrays
    r = client.put(
        f"/presidency-assignments/{calling.id}",
        json={"responsibilities": [], "ward_ids": []},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["responsibilities"] == []

    # GET must also return []
    r2 = client.get("/presidency-assignments/", headers=headers)
    assert r2.status_code == 200
    sp_row = next(
        (item for item in r2.json() if item["calling_name"] == "Stake President"), None
    )
    assert sp_row is not None
    assert sp_row["responsibilities"] == []


# ---------------------------------------------------------------------------
# Gap 6: Whitespace / blank string filtering via PUT
# ---------------------------------------------------------------------------

def test_put_filters_blank_responsibilities(
    client: TestClient, db_session: Session, admin: Tuple
):
    """PUT with responsibilities containing blank/whitespace-only strings
    must return only the non-blank entries."""
    admin_user, admin_password = admin
    headers = auth_headers(client, admin_user.email, admin_password)

    calling = db_session.exec(
        select(Calling).where(Calling.name == "First Counselor")
    ).first()
    assert calling is not None

    r = client.put(
        f"/presidency-assignments/{calling.id}",
        json={"responsibilities": ["Sunday School", " ", ""], "ward_ids": []},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["responsibilities"] == ["Sunday School"]
