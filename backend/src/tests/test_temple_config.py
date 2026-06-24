"""Tests for the temple recommend configuration router."""
from fastapi.testclient import TestClient
from sqlmodel import Session

from src.models import TempleRecommendConfig, Permissions, Permission


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ensure_config(session: Session) -> TempleRecommendConfig:
    config = session.get(TempleRecommendConfig, 1)
    if config is None:
        config = TempleRecommendConfig(id=1)
        session.add(config)
        session.commit()
        session.refresh(config)
    return config


# ---------------------------------------------------------------------------
# GET /temple-config (public)
# ---------------------------------------------------------------------------

def test_get_config_public_accessible(client: TestClient, db_session: Session):
    _ensure_config(db_session)
    response = client.get("/temple-config/")
    assert response.status_code == 200
    payload = response.json()
    assert "location_name" in payload
    assert "timezone" in payload


def test_get_config_returns_defaults(client: TestClient, db_session: Session):
    config = _ensure_config(db_session)
    response = client.get("/temple-config/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == 1
    assert payload["timezone"] == config.timezone


def test_get_config_returns_404_if_not_seeded(client: TestClient, db_session: Session):
    # Delete the config if it exists
    existing = db_session.get(TempleRecommendConfig, 1)
    if existing:
        db_session.delete(existing)
        db_session.commit()
    response = client.get("/temple-config/")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /temple-config (requires MANAGE_APPOINTMENTS)
# ---------------------------------------------------------------------------

def test_patch_config_requires_auth(client: TestClient, db_session: Session):
    _ensure_config(db_session)
    response = client.patch("/temple-config/", json={"location_name": "New Location"})
    assert response.status_code == 401


def test_patch_config_requires_manage_appointments(client: TestClient, db_session: Session, userpass):
    _ensure_config(db_session)
    user, password = userpass
    token = _login(client, user.email, password)
    response = client.patch(
        "/temple-config/",
        json={"location_name": "Changed"},
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_patch_config_updates_fields(client: TestClient, db_session: Session, admin):
    _ensure_config(db_session)
    user, password = admin
    token = _login(client, user.email, password)
    response = client.patch(
        "/temple-config/",
        json={"location_name": "New Stake Center", "slot_buffer_mins": 10},
        headers=_auth(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["location_name"] == "New Stake Center"
    assert payload["slot_buffer_mins"] == 10


def test_patch_config_rejects_invalid_timezone(client: TestClient, db_session: Session, admin):
    _ensure_config(db_session)
    user, password = admin
    token = _login(client, user.email, password)
    response = client.patch(
        "/temple-config/",
        json={"timezone": "Not/A/Valid/Timezone"},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_patch_config_accepts_valid_timezone(client: TestClient, db_session: Session, admin):
    _ensure_config(db_session)
    user, password = admin
    token = _login(client, user.email, password)
    response = client.patch(
        "/temple-config/",
        json={"timezone": "America/New_York"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json()["timezone"] == "America/New_York"


def test_patch_config_singleton_not_duplicated(client: TestClient, db_session: Session, admin):
    """PATCH must update the singleton row, not create a new one."""
    _ensure_config(db_session)
    user, password = admin
    token = _login(client, user.email, password)
    client.patch(
        "/temple-config/",
        json={"location_name": "First Update"},
        headers=_auth(token),
    )
    client.patch(
        "/temple-config/",
        json={"location_name": "Second Update"},
        headers=_auth(token),
    )
    from sqlmodel import select, func
    count = db_session.exec(
        select(func.count()).select_from(TempleRecommendConfig)
    ).one()
    assert count == 1
    response = client.get("/temple-config/")
    assert response.json()["location_name"] == "Second Update"
