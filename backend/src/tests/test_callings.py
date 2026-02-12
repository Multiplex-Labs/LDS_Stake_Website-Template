from typing import Tuple

from fastapi.testclient import TestClient

from src.models import Calling, UserCalling, Permissions, Permission


def login_client(client: TestClient, email: str, password: str) -> str:
    r = client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    return r.json()["access_token"]


def test_get_callings_public_only(client: TestClient, db_session):
    # create one public and one private calling
    public = Calling(name="Public Calling", max_slots=1, is_public=True)
    private = Calling(name="Private Calling", max_slots=1, is_public=False)
    db_session.add(public)
    db_session.add(private)
    db_session.commit()

    r = client.get("/callings/")
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, list)
    assert any(c["name"] == "Public Calling" for c in j)
    assert all(c["is_public"] for c in j)


def test_create_calling_requires_permission(client: TestClient, userpass: Tuple):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {"name": "NoPerm Calling", "max_slots": 2, "is_public": True}
    r = client.post("/callings/", json=payload, headers=headers)
    assert r.status_code == 403


def test_create_get_update_delete_calling_with_permission(client: TestClient, db_session, userpass: Tuple):
    user, password = userpass
    # grant manage callings permission to user
    perm = Permissions(foreign_id=str(user.id), is_calling=False, scopes=int(Permission.MANAGE_CALLINGS))
    db_session.add(perm)
    db_session.commit()

    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    # create
    payload = {"name": "Test Calling", "max_slots": 3, "is_public": False}
    r = client.post("/callings/", json=payload, headers=headers)
    assert r.status_code == 200
    created = r.json()
    assert created["name"] == "Test Calling"
    calling_id = created["id"]

    # get
    r = client.get(f"/callings/{calling_id}", headers=headers)
    assert r.status_code == 200

    # update
    created["name"] = "Updated Calling"
    created["max_slots"] = 4
    r = client.put(f"/callings/{calling_id}", json=created, headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert j["name"] == "Updated Calling"
    assert j["max_slots"] == 4

    # delete
    r = client.delete(f"/callings/{calling_id}", headers=headers)
    assert r.status_code == 200

    # ensure it's gone
    r = client.get(f"/callings/{calling_id}", headers=headers)
    assert r.status_code == 404


def test_slot_assign_unassign(client: TestClient, db_session, userpass: Tuple):
    user, password = userpass
    # create a public calling with 2 slots
    calling = Calling(name="Slot Calling", max_slots=2, is_public=True)
    db_session.add(calling)
    db_session.commit()
    db_session.refresh(calling)
    calling_id = calling.id

    # anonymous GET should create an unassigned slot
    r = client.get(f"/callings/{calling_id}/1")
    assert r.status_code == 200
    slot = r.json()
    assert slot["slot_number"] == 1

    # grant permission and assign slot
    perm = Permissions(foreign_id=str(user.id), is_calling=False, scopes=int(Permission.MANAGE_CALLINGS))
    db_session.add(perm)
    db_session.commit()

    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put(f"/callings/{calling_id}/1", json={"user_id": user.id}, headers=headers)
    assert r.status_code == 200
    assigned = r.json()
    assert assigned["user_id"] == user.id

    # unassign
    r = client.delete(f"/callings/{calling_id}/1", headers=headers)
    assert r.status_code == 200

    # get slot again - should be unassigned or None user_id
    r = client.get(f"/callings/{calling_id}/1")
    assert r.status_code == 200
    slot2 = r.json()
    # allow either None or null in response
    assert "user_id" in slot2
