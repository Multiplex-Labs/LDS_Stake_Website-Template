from typing import Generator

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import Ward, Calling, UserCalling


def test_list_wards_returns_created_ward(client: TestClient, db_session: Session):
    ward = Ward(name="Test Ward", bishop_id=None, start_time=9.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)

    response = client.get("/wards/")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert any(item["id"] == ward.id and item["name"] == ward.name for item in payload)


def test_get_ward_by_id_returns_ward(client: TestClient, db_session: Session):
    ward = Ward(name="View Ward", bishop_id=None, start_time=9.0)
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


def test_ward_without_bishop_returns_null_bishop_slot_number(client: TestClient, db_session: Session):
    ward = Ward(name="No Bishop Ward", bishop_id=None, start_time=11.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)

    response = client.get(f"/wards/{ward.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["bishop_slot_number"] is None


def test_ward_with_bishop_returns_correct_bishop_slot_number(client: TestClient, db_session: Session):
    bishop_calling = db_session.exec(select(Calling).where(Calling.name == "Bishop")).first()
    assert bishop_calling is not None, "Bishop calling must be created by system setup"

    uc = UserCalling(calling_id=bishop_calling.id, slot_number=99, user_id=None)
    db_session.add(uc)
    db_session.commit()
    db_session.refresh(uc)

    ward = Ward(name="Bishop Slot Ward", bishop_id=uc.id, start_time=10.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)

    response = client.get(f"/wards/{ward.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["bishop_slot_number"] == 99


def test_ward_with_location_returns_location_in_response(client: TestClient, db_session: Session):
    ward = Ward(name="South Chapel Ward", bishop_id=None, start_time=9.0, location="South")
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)

    response = client.get(f"/wards/{ward.id}")

    assert response.status_code == 200
    assert response.json()["location"] == "South"


def test_ward_with_null_location_returns_null_in_response(client: TestClient, db_session: Session):
    ward = Ward(name="No Location Ward", bishop_id=None, start_time=9.0, location=None)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)

    response = client.get(f"/wards/{ward.id}")

    assert response.status_code == 200
    assert response.json()["location"] is None


def test_loaded_wards_have_bishop_id_set(db_session: Session):
    """Regression: load_wards() previously used wrong kwarg (bishop_calling_id) causing bishop_id to be NULL."""
    bishop_calling = db_session.exec(select(Calling).where(Calling.name == "Bishop")).first()
    if bishop_calling is None:
        return  # System callings not set up; skip
    bishop_uc_ids = {
        uc.id
        for uc in db_session.exec(
            select(UserCalling).where(UserCalling.calling_id == bishop_calling.id)
        ).all()
    }
    if not bishop_uc_ids:
        return  # No bishop slots created; skip
    wards_linked = db_session.exec(
        select(Ward).where(Ward.bishop_id.in_(bishop_uc_ids))
    ).all()
    assert len(wards_linked) > 0, (
        "load_wards() should create at least one ward with bishop_id pointing to a Bishop UserCalling"
    )
