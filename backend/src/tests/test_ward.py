from typing import Generator

from fastapi.testclient import TestClient
from sqlmodel import Session

from src.models import Ward


def test_list_wards_returns_created_ward(client: TestClient, db_session: Session):
    ward = Ward(name="Test Ward", bishop_id=None)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)

    response = client.get("/wards/")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert any(item["id"] == ward.id and item["name"] == ward.name for item in payload)


def test_get_ward_by_id_returns_ward(client: TestClient, db_session: Session):
    ward = Ward(name="View Ward", bishop_id=None)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)

    response = client.get(f"/wards/{ward.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == ward.id
    assert payload["name"] == ward.name


def test_get_ward_returns_404_for_unknown_id(client: TestClient):
    response = client.get("/wards/9999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Ward not found"}
