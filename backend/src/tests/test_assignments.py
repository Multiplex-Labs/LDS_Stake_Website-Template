from typing import Tuple
import secrets

from fastapi.testclient import TestClient

from src.models import Assignment, Calling, UserCalling, Permissions, Permission


def login_client(client: TestClient, email: str, password: str) -> str:
    r = client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    return r.json()["access_token"]


def test_get_assignments_requires_auth_and_returns_list(
        client: TestClient,
        db_session,
        high_councilor_assignment: Assignment,
        userpass: Tuple
        ):

    # unauthenticated should be 401
    r = client.get("/assignments/")
    assert r.status_code == 401

    # create a user and login
    # use conftest's user fixture by creating a fresh one here
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}  

    r = client.get("/assignments/", headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, list)
    assert len(j) >= 1  # At least the high councilor assignment from the fixture should be present
    assert "high_councilor_id" in j[0]
    assert "responsibility" in j[0]
    assert "committee" in j[0]


def test_get_assignment_slot_creates_assignment(client: TestClient,
                                                db_session, 
                                                userpass: Tuple,
                                                high_councilor_assignment: Assignment):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}


    # GET slot should create a usercalling and an assignment
    r = client.get("/assignments/slot/15", headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert "high_councilor_id" in j
    assert "responsibility" in j
    assert "committee" in j


def test_update_assignment_requires_permission_and_allows_with_permission(
        client: TestClient,
        db_session,
        userpass: Tuple,
        high_councilor_assignment: Assignment
        ):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}


    # try update without permission
    payload = {"high_councilor_id": high_councilor_assignment["high_councilor_id"], "responsibility": "Serve", "committee": "Alpha"}
    r = client.put(
        f"/assignments/slot/{high_councilor_assignment.high_councilor.slot_number}",
        json=payload,
        headers=headers
        )
    assert r.status_code == 403

    # grant permission and try again
    perm = Permissions(foreign_id=str(user.id), is_calling=False, scopes=int(Permission.MANAGE_ASSIGNMENTS))
    db_session.add(perm)
    db_session.commit()

    r = client.put("/assignments/slot/1", json=payload, headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert j["responsibility"] == "Serve"
    assert j["committee"] == "Alpha"
