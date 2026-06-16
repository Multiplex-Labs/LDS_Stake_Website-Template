from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import Ward, Calling, UserCalling


def _login(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/auth/login", data={"username": email, "password": password})
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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


# ---------------------------------------------------------------------------
# Auth guard tests — all write endpoints require MANAGE_WARDS
# ---------------------------------------------------------------------------

def test_create_ward_requires_auth(client: TestClient):
    response = client.post("/wards/", json={"name": "Test Ward", "start_time": 9.0})
    assert response.status_code == 401


def test_update_ward_requires_auth(client: TestClient, db_session: Session):
    ward = Ward(name="Auth Ward", bishop_id=None, start_time=9.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)
    response = client.put(f"/wards/{ward.id}", json={"name": "Changed", "start_time": 10.0})
    assert response.status_code == 401


def test_delete_ward_requires_auth(client: TestClient, db_session: Session):
    ward = Ward(name="Auth Delete Ward", bishop_id=None, start_time=9.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)
    response = client.delete(f"/wards/{ward.id}")
    assert response.status_code == 401


def test_create_ward_requires_manage_wards(client: TestClient, userpass):
    user, password = userpass
    token = _login(client, user.email, password)
    response = client.post(
        "/wards/",
        json={"name": "Perm Ward", "start_time": 9.0},
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_update_ward_requires_manage_wards(client: TestClient, db_session: Session, userpass):
    user, password = userpass
    ward = Ward(name="Perm Update Ward", bishop_id=None, start_time=9.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)
    token = _login(client, user.email, password)
    response = client.put(
        f"/wards/{ward.id}",
        json={"name": "Changed", "start_time": 10.0},
        headers=_auth(token),
    )
    assert response.status_code == 403


def test_delete_ward_requires_manage_wards(client: TestClient, db_session: Session, userpass):
    user, password = userpass
    ward = Ward(name="Perm Delete Ward", bishop_id=None, start_time=9.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)
    token = _login(client, user.email, password)
    response = client.delete(f"/wards/{ward.id}", headers=_auth(token))
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /wards/ — happy path
# ---------------------------------------------------------------------------

def test_create_ward_returns_ward_with_bishop_slot(client: TestClient, db_session: Session, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/wards/",
        json={"name": "Brand New Ward", "start_time": 10.5},
        headers=_auth(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Brand New Ward"
    assert payload["start_time"] == 10.5
    assert payload["bishop_id"] is not None
    assert payload["bishop_slot_number"] is not None
    uc = db_session.get(UserCalling, payload["bishop_id"])
    assert uc is not None
    assert uc.user_id is None


# ---------------------------------------------------------------------------
# PUT /wards/{id}
# ---------------------------------------------------------------------------

def test_update_ward_returns_404_for_unknown_id(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.put(
        "/wards/99999",
        json={"name": "Ghost", "start_time": 9.0},
        headers=_auth(token),
    )
    assert response.status_code == 404


def test_update_ward_persists_all_fields(client: TestClient, db_session: Session, admin):
    user, password = admin
    token = _login(client, user.email, password)
    ward = Ward(name="Before", bishop_id=None, start_time=9.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)
    response = client.put(
        f"/wards/{ward.id}",
        json={"name": "After", "start_time": 13.5, "location": "North"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "After"
    assert payload["start_time"] == 13.5
    assert payload["location"] == "North"


# ---------------------------------------------------------------------------
# DELETE /wards/{id}
# ---------------------------------------------------------------------------

def test_delete_ward_returns_404_for_unknown_id(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.delete("/wards/99999", headers=_auth(token))
    assert response.status_code == 404


def test_delete_ward_removes_bishop_slot_and_updates_max_slots(
    client: TestClient, db_session: Session, admin
):
    user, password = admin
    token = _login(client, user.email, password)

    bishop_calling = db_session.exec(select(Calling).where(Calling.name == "Bishop")).first()
    assert bishop_calling is not None
    original_max_slots = bishop_calling.max_slots

    uc = UserCalling(calling_id=bishop_calling.id, slot_number=original_max_slots + 1, user_id=None)
    db_session.add(uc)
    db_session.commit()
    db_session.refresh(uc)
    uc_id = uc.id

    ward = Ward(name="To Delete Ward", bishop_id=uc_id, start_time=9.0)
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)
    ward_id = ward.id

    response = client.delete(f"/wards/{ward_id}", headers=_auth(token))
    assert response.status_code == 204

    db_session.expire_all()
    assert db_session.get(Ward, ward_id) is None
    assert db_session.get(UserCalling, uc_id) is None

    db_session.refresh(bishop_calling)
    assert bishop_calling.max_slots == original_max_slots


# ---------------------------------------------------------------------------
# WardPayload validation
# ---------------------------------------------------------------------------

def test_create_ward_rejects_blank_name(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/wards/",
        json={"name": "   ", "start_time": 9.0},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_create_ward_rejects_out_of_range_start_time(client: TestClient, admin):
    user, password = admin
    token = _login(client, user.email, password)
    response = client.post(
        "/wards/",
        json={"name": "Valid Name", "start_time": 25.0},
        headers=_auth(token),
    )
    assert response.status_code == 422
