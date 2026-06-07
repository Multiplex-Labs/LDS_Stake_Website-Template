from typing import Tuple

from fastapi.testclient import TestClient
from sqlalchemy import select

from src.models import User, UserCalling, Calling


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


def test_delete_self_is_forbidden(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.delete(f"/users/{user.id}", headers=headers)
    assert r.status_code == 400
    assert "own account" in r.json()["detail"]

def test_get_users(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/users/", headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, list)
    assert any(u["id"] == user.id for u in j)

def test_get_users_noauth(client: TestClient, db_session):
    r = client.get("/users/")
    # This will get all users that have public callings.
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, list)
    for u in j:
        # All returned users should have at least one public calling
        has_public_calling = False
        for calling_data in u["callings"]:
            calling = db_session.exec(
                select(Calling).where(Calling.id == calling_data["calling_id"])
            ).first()
            # For some reason this is returning a tuple, idk why.
            print(calling[0])
            if calling[0] and calling[0].is_public:
                has_public_calling = True
                break
        assert has_public_calling


# --- Password complexity enforcement tests (Task 3.1) ---

def test_change_password_missing_uppercase_rejected(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": "password1!"},
        headers=headers,
    )
    assert r.status_code == 422


def test_change_password_missing_digit_rejected(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": "Password!"},
        headers=headers,
    )
    assert r.status_code == 422


def test_change_password_missing_special_char_rejected(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": "Password1"},
        headers=headers,
    )
    assert r.status_code == 422


def test_change_password_too_long_rejected(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    too_long = "A1!" + "a" * 126  # 129 characters total
    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": too_long},
        headers=headers,
    )
    assert r.status_code == 422


def test_change_password_compliant_accepted(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": "Secure1!"},
        headers=headers,
    )
    assert r.status_code == 200


def test_change_password_too_short_rejected(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": "Abc1!xy"},  # 7 chars, all complexity rules met
        headers=headers,
    )
    assert r.status_code == 422


def test_change_password_max_length_accepted(client: TestClient, userpass: Tuple[User, str]):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    at_limit = "A1!" + "a" * 125  # exactly 128 characters
    r = client.patch(
        f"/users/{user.id}/password",
        json={"old_password": password, "new_password": at_limit},
        headers=headers,
    )
    assert r.status_code == 200


# --- Password complexity enforcement tests (Task 3.2) ---

def _create_user_payload(email: str, password: str) -> dict:
    return {"email": email, "password": password, "fname": "Test", "lname": "User", "active": True, "force_password_reset": True}


def test_create_user_weak_password_rejected(client: TestClient, admin: Tuple[User, str]):
    admin_user, admin_password = admin
    token = login_client(client, admin_user.email, admin_password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/users/", json=_create_user_payload("weakpass@example.com", "nouppernordigit"), headers=headers)
    assert r.status_code == 422


def test_create_user_missing_uppercase_rejected(client: TestClient, admin: Tuple[User, str]):
    admin_user, admin_password = admin
    token = login_client(client, admin_user.email, admin_password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/users/", json=_create_user_payload("nouppercase@example.com", "password1!"), headers=headers)
    assert r.status_code == 422


def test_create_user_missing_digit_rejected(client: TestClient, admin: Tuple[User, str]):
    admin_user, admin_password = admin
    token = login_client(client, admin_user.email, admin_password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/users/", json=_create_user_payload("nodigit@example.com", "Password!"), headers=headers)
    assert r.status_code == 422


def test_create_user_missing_special_char_rejected(client: TestClient, admin: Tuple[User, str]):
    admin_user, admin_password = admin
    token = login_client(client, admin_user.email, admin_password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/users/", json=_create_user_payload("nospecial@example.com", "Password1"), headers=headers)
    assert r.status_code == 422


def test_create_user_too_short_rejected(client: TestClient, admin: Tuple[User, str]):
    admin_user, admin_password = admin
    token = login_client(client, admin_user.email, admin_password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/users/", json=_create_user_payload("tooshort@example.com", "Abc1!xy"), headers=headers)
    assert r.status_code == 422


def test_get_user_nonexistent_returns_404(client: TestClient, admin: Tuple[User, str]):
    admin_user, admin_password = admin
    token = login_client(client, admin_user.email, admin_password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/users/99999", headers=headers)
    assert r.status_code == 404


