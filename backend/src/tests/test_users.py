from typing import Tuple

from fastapi.testclient import TestClient

from src.models import User


def login_client(client: TestClient, email: str, password: str) -> str:
    r = client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    return r.json()["access_token"]


def test_get_user_returns_user(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}
    r = client.get(f"/users/{user.id}", headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert j["email"] == user.email
    assert j["id"] == user.id

def test_get_user_noauth(client: TestClient, userpass: Tuple[User, str]):
    user, _ = userpass

    r = client.get(f"/users/{user.id}")
    assert r.status_code == 404


def test_update_user_self_can_update(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch current user representation and modify a field
    r = client.get(f"/users/{user.id}", headers=headers)
    assert r.status_code == 200
    payload = r.json()
    payload["fname"] = "UpdatedFirst"

    # PUT requires the full RequestSafeUser shape; using response as a template works
    put_rsp = client.put(f"/users/{user.id}", json=payload, headers=headers)
    assert put_rsp.status_code == 200
    j = put_rsp.json()
    assert j["fname"] == "UpdatedFirst"


def test_change_password_self(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    new_password = "NewPassw0rd!"
    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": new_password},
        headers=headers,
    )
    assert r.status_code == 200

    # Verify we can log in with the new password
    login = client.post(
        "/auth/login",
        data={"username": user.email, "password": new_password},
    )
    assert login.status_code == 200


def test_delete_self_removes_user(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.delete(f"/users/{user.id}", headers=headers)
    assert r.status_code == 200

    # After deletion the user should not be found
    get_r = client.get(f"/users/{user.id}")
    assert get_r.status_code == 404

def test_get_users(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/users/", headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, list)
    assert any(u["id"] == user.id for u in j)

def test_get_users_noauth(client: TestClient):
    r = client.get("/users/")
    # This will get all users that have public callings.
    # We haven't set up any test users, so we should get an empty list
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, list)
    assert len(j) == 0
