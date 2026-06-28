import os
from typing import Tuple

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from src.models import SiteSettings, Permissions, Permission
from src.routers.settings import get_reply_to_email


def login_client(client: TestClient, email: str, password: str) -> str:
    r = client.post("/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture
def settings_manager(client, userpass, db_session):
    user, password = userpass
    perm = Permissions(
        foreign_id=str(user.id),
        is_calling=False,
        scopes=int(Permission.MANAGE_SITE_SETTINGS),
    )
    db_session.add(perm)
    db_session.commit()
    yield user, password


def _clear_settings(db_session: Session) -> None:
    existing = db_session.get(SiteSettings, 1)
    if existing:
        db_session.delete(existing)
        db_session.commit()


# ---------------------------------------------------------------------------
# GET /settings
# ---------------------------------------------------------------------------

def test_get_settings_defaults_when_no_row(client: TestClient, db_session: Session):
    _clear_settings(db_session)
    r = client.get("/settings")
    assert r.status_code == 200
    j = r.json()
    assert j["stake_name"] == "Logan Married Student 2nd Stake"
    assert j["sacrament_times"] == ["8:30am", "10:00am", "11:30am", "1:00pm"]
    assert j["hidden_pages"] == []


def test_get_settings_returns_db_values(client: TestClient, db_session: Session):
    _clear_settings(db_session)
    row = SiteSettings(
        id=1,
        stake_name="Test Stake",
        stake_address="123 Main St",
        contact_email="contact@test.com",
        reply_to_email="reply@test.com",
        hero_title="Test Title",
        hero_subtitle="Test Subtitle",
        sacrament_times=["9:00am"],
        hidden_pages=["resources"],
    )
    db_session.add(row)
    db_session.commit()

    r = client.get("/settings")
    assert r.status_code == 200
    j = r.json()
    assert j["stake_name"] == "Test Stake"
    assert j["stake_address"] == "123 Main St"
    assert j["contact_email"] == "contact@test.com"
    assert j["reply_to_email"] == "reply@test.com"
    assert j["sacrament_times"] == ["9:00am"]
    assert j["hidden_pages"] == ["resources"]

    _clear_settings(db_session)


# ---------------------------------------------------------------------------
# PUT /settings — auth / permission guards
# ---------------------------------------------------------------------------

def test_put_settings_unauthenticated_returns_401(client: TestClient):
    r = client.put("/settings", json={"stake_name": "New Name"})
    assert r.status_code == 401


def test_put_settings_no_permissions_returns_403(client: TestClient, userpass: Tuple):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}
    r = client.put("/settings", json={"stake_name": "New Name"}, headers=headers)
    assert r.status_code == 403


def test_put_settings_wrong_permission_returns_403(client: TestClient, userpass: Tuple, db_session: Session):
    user, password = userpass
    perm = Permissions(
        foreign_id=str(user.id),
        is_calling=False,
        scopes=int(Permission.MANAGE_USERS),
    )
    db_session.add(perm)
    db_session.commit()

    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}
    r = client.put("/settings", json={"stake_name": "New Name"}, headers=headers)
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# PUT /settings — happy path
# ---------------------------------------------------------------------------

def test_put_settings_updates_stake_name(client: TestClient, db_session: Session, settings_manager: Tuple):
    _clear_settings(db_session)
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"stake_name": "Updated Stake"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["stake_name"] == "Updated Stake"

    _clear_settings(db_session)


def test_put_settings_partial_update_preserves_other_fields(
    client: TestClient, db_session: Session, settings_manager: Tuple
):
    _clear_settings(db_session)
    row = SiteSettings(
        id=1,
        stake_name="Original Name",
        stake_address="Original Address",
        contact_email="original@test.com",
        sacrament_times=[],
        hidden_pages=[],
    )
    db_session.add(row)
    db_session.commit()

    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"stake_name": "New Name"}, headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert j["stake_name"] == "New Name"
    assert j["stake_address"] == "Original Address"

    _clear_settings(db_session)


def test_put_settings_round_trip(client: TestClient, db_session: Session, settings_manager: Tuple):
    _clear_settings(db_session)
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    client.put("/settings", json={"stake_name": "Round Trip Stake"}, headers=headers)

    r = client.get("/settings")
    assert r.status_code == 200
    assert r.json()["stake_name"] == "Round Trip Stake"

    _clear_settings(db_session)


# ---------------------------------------------------------------------------
# PUT /settings — validator rejections
# ---------------------------------------------------------------------------

def test_put_settings_invalid_contact_email_returns_422(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"contact_email": "notanemail"}, headers=headers)
    assert r.status_code == 422


def test_put_settings_invalid_time_format_returns_422(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"sacrament_times": ["9 am"]}, headers=headers)
    assert r.status_code == 422


def test_put_settings_invalid_time_minutes_returns_422(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"sacrament_times": ["10:99am"]}, headers=headers)
    assert r.status_code == 422


def test_put_settings_unknown_hidden_page_returns_422(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"hidden_pages": ["nonexistent-page"]}, headers=headers)
    assert r.status_code == 422


def test_put_settings_duplicate_sacrament_times_returns_422(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"sacrament_times": ["10:00am", "10:00am"]}, headers=headers)
    assert r.status_code == 422


def test_put_settings_duplicate_hidden_pages_returns_422(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"hidden_pages": ["resources", "resources"]}, headers=headers)
    assert r.status_code == 422


def test_put_settings_empty_reply_to_email_accepted(
    client: TestClient, db_session: Session, settings_manager: Tuple
):
    _clear_settings(db_session)
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.put("/settings", json={"reply_to_email": ""}, headers=headers)
    assert r.status_code == 200
    assert r.json()["reply_to_email"] == ""

    _clear_settings(db_session)


# ---------------------------------------------------------------------------
# POST /settings/upload/{image_type} — auth guards
# ---------------------------------------------------------------------------

def test_upload_unauthenticated_returns_401(client: TestClient):
    r = client.post(
        "/settings/upload/logo",
        files={"file": ("logo.jpg", b"data", "image/jpeg")},
    )
    assert r.status_code == 401


def test_upload_no_permission_returns_403(client: TestClient, userpass: Tuple):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post(
        "/settings/upload/logo",
        files={"file": ("logo.jpg", b"data", "image/jpeg")},
        headers=headers,
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /settings/upload/{image_type} — validation
# ---------------------------------------------------------------------------

def test_upload_invalid_mime_type_returns_400(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post(
        "/settings/upload/logo",
        files={"file": ("doc.pdf", b"pdf content", "application/pdf")},
        headers=headers,
    )
    assert r.status_code == 400


def test_upload_oversized_file_returns_400(client: TestClient, settings_manager: Tuple):
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    big = b"x" * (5 * 1024 * 1024 + 1)
    r = client.post(
        "/settings/upload/logo",
        files={"file": ("big.jpg", big, "image/jpeg")},
        headers=headers,
    )
    assert r.status_code == 400


def test_upload_valid_jpeg_sets_logo_url(
    client: TestClient, db_session: Session, settings_manager: Tuple
):
    _clear_settings(db_session)
    user, password = settings_manager
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    small_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 16
    r = client.post(
        "/settings/upload/logo",
        files={"file": ("logo.jpg", small_jpeg, "image/jpeg")},
        headers=headers,
    )
    assert r.status_code == 200
    j = r.json()
    assert j["logo_url"] is not None
    assert "logo" in j["logo_url"]

    _clear_settings(db_session)


# ---------------------------------------------------------------------------
# get_reply_to_email utility function
# ---------------------------------------------------------------------------

def test_get_reply_to_email_returns_db_value(db_session: Session):
    _clear_settings(db_session)
    row = SiteSettings(
        id=1,
        reply_to_email="db-reply@test.com",
        sacrament_times=[],
        hidden_pages=[],
    )
    db_session.add(row)
    db_session.commit()

    result = get_reply_to_email(db_session)
    assert result == "db-reply@test.com"

    _clear_settings(db_session)


def test_get_reply_to_email_falls_back_to_env(db_session: Session):
    _clear_settings(db_session)
    os.environ["REPLY_TO_EMAIL"] = "env-reply@test.com"
    try:
        result = get_reply_to_email(db_session)
        assert result == "env-reply@test.com"
    finally:
        del os.environ["REPLY_TO_EMAIL"]
