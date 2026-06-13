"""Tests for display_group and display_order fields on Calling."""

from fastapi.testclient import TestClient


def _login(client: TestClient, email: str, password: str) -> str:
    r = client.post("/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_create_calling_with_display_fields(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    r = client.post(
        "/callings/",
        json={"name": "Sunday School President", "max_slots": 1, "is_public": True, "display_group": "Sunday School", "display_order": 10, "group_order": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["display_group"] == "Sunday School"
    assert body["display_order"] == 10
    assert body["group_order"] == 1


def test_create_calling_display_fields_default_null(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    r = client.post(
        "/callings/",
        json={"name": "Unnamed Role", "max_slots": 1, "is_public": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["display_group"] is None
    assert body["display_order"] is None
    assert body["group_order"] is None


def test_update_calling_sets_display_fields(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    create = client.post(
        "/callings/",
        json={"name": "Ward Mission Leader", "max_slots": 1, "is_public": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    calling_id = create.json()["id"]

    r = client.put(
        f"/callings/{calling_id}",
        json={"name": "Ward Mission Leader", "max_slots": 1, "is_public": True, "display_group": "Missionary", "display_order": 5, "group_order": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["display_group"] == "Missionary"
    assert body["display_order"] == 5
    assert body["group_order"] == 1


def test_update_calling_clears_display_fields(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    create = client.post(
        "/callings/",
        json={"name": "Elders Quorum President", "max_slots": 1, "is_public": True, "display_group": "EQ", "display_order": 1, "group_order": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    calling_id = create.json()["id"]

    r = client.put(
        f"/callings/{calling_id}",
        json={"name": "Elders Quorum President", "max_slots": 1, "is_public": True, "display_group": None, "display_order": None, "group_order": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["display_group"] is None
    assert body["display_order"] is None
    assert body["group_order"] is None


def test_get_callings_anonymous_does_not_see_display_group_of_private(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    client.post(
        "/callings/",
        json={"name": "Private Grouped Calling", "max_slots": 1, "is_public": False, "display_group": "Secret", "display_order": 99},
        headers={"Authorization": f"Bearer {token}"},
    )
    r = client.get("/callings/")
    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    assert "Private Grouped Calling" not in names


def test_display_fields_present_in_get_response(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    # "Stake Clerk" is now a system calling bootstrapped at startup with display_order=5.
    # The POST would fail (400 duplicate name), so we verify the existing system calling instead.
    r = client.get("/callings/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    match = next((c for c in r.json() if c["name"] == "Stake Clerk"), None)
    assert match is not None
    assert match["display_group"] == "Stake Presidency"
    assert match["display_order"] == 5
    assert match["group_order"] == 1
