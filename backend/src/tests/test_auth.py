import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session
from typing import Tuple

from src.models import User



def test_login_sets_cookie_and_returns_token(client: TestClient, userpass:Tuple[User,str]):
    user, password = userpass

    response = client.post(
        "/auth/login",
        data={"username": user.email, "password": password},
    )

    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body.get("token_type") == "bearer"
    # TestClient stores cookies on the client object
    assert "refresh_token" in client.cookies


def test_me_requires_auth_and_returns_user(client: TestClient, userpass:Tuple[User,str]):
    user, password = userpass

    login = client.post(
        "/auth/login",
        data={"username": user.email, "password": password},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    r = client.get("/auth/me", headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert j["email"] == user.email
    assert j["id"] == user.id


def test_refresh_updates_cookie_and_returns_token(client: TestClient, userpass:Tuple[User,str]):
    user, password = userpass

    login = client.post(
        "/auth/login",
        data={"username": user.email, "password": password},
    )
    assert login.status_code == 200

    r = client.get("/auth/refresh")
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in client.cookies


def test_logout_removes_session_and_cookie(client: TestClient, userpass:Tuple[User,str]):
    user, password = userpass

    login = client.post(
        "/auth/login",
        data={"username": user.email, "password": password},
    )
    assert login.status_code == 200
    assert "refresh_token" in client.cookies

    # Logout current device
    r = client.post("/auth/logout", json={"all_devices": False})
    assert r.status_code == 200
    # After logout the cookie should be cleared or empty
    ct = client.cookies.get("refresh_token")
    assert not ct
