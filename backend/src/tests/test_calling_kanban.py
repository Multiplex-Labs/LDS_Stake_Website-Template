import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from src.models import Permissions, Permission


def login_client(client: TestClient, email: str, password: str) -> str:
    r = client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="function")
def auth_headers(client: TestClient, admin):
    user, password = admin
    token = login_client(client, user.email, password)
    return {"Authorization": f"Bearer {token}"}


def create_proposal_payload():
    return {
        "fname": "Jane",
        "lname": "Doe",
        "spouse_name": "John Doe",
        "proposed_calling": "Sunday School Teacher",
        "ward_id": 1,
        "is_release": False,
    }


def test_create_calling_proposal_forbidden_without_permission(client: TestClient, userpass):
    user, password = userpass
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=headers)
    assert r.status_code == 403


def test_create_get_list_proposal(client: TestClient, auth_headers, db_session: Session):
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    assert r.status_code == 200
    created = r.json()
    print(r.text)
    print(created)
    assert created["fname"] == "Jane"
    assert created["lname"] == "Doe"
    assert "id" in created
    proposal_id = created["id"]

    r = client.get("/calling-kanban/proposals", headers=auth_headers)
    assert r.status_code == 200
    proposals = r.json()
    assert any(p["id"] == proposal_id for p in proposals)

    r = client.get(f"/calling-kanban/proposals/{proposal_id}", headers=auth_headers)
    assert r.status_code == 200
    got = r.json()
    assert got["id"] == proposal_id


def test_update_proposal_and_permissions(client: TestClient, auth_headers, userpass):
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    assert r.status_code == 200
    proposal = r.json()
    proposal_id = proposal["id"]

    # patch the payload to send via update
    proposal_update = proposal.copy()
    proposal_update["fname"] = "UpdatedJane"
    proposal_update["lname"] = "UpdatedDoe"

    r = client.put(f"/calling-kanban/proposals/{proposal_id}", json=proposal_update, headers=auth_headers)
    assert r.status_code == 200
    updated = r.json()
    assert updated["fname"] == "UpdatedJane"
    assert updated["lname"] == "UpdatedDoe"

    # a nonauthorized user should not be able to update an existing proposal
    unauthorized_user, unauthorized_password = userpass
    unauthorized_token = login_client(client, unauthorized_user.email, unauthorized_password)
    unauthorized_headers = {"Authorization": f"Bearer {unauthorized_token}"}

    # change submitter to ensure permission check path is triggered
    proposal_update["submitter"] = updated["submitter"]

    r = client.put(f"/calling-kanban/proposals/{proposal_id}", json=proposal_update, headers=unauthorized_headers)
    assert r.status_code == 403


def test_comment_crud(client: TestClient, auth_headers):
    # create proposal
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    assert r.status_code == 200
    proposal_id = r.json()["id"]

    # add comment
    comment_payload = {"comment_text": "This is a test comment."}
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/comments", json=comment_payload, headers=auth_headers)
    assert r.status_code == 200
    comment = r.json()
    assert comment["comment_text"] == "This is a test comment."
    comment_id = comment["id"]

    # get comments
    r = client.get(f"/calling-kanban/proposals/{proposal_id}/comments", headers=auth_headers)
    assert r.status_code == 200
    comments = r.json()
    assert any(c["id"] == comment_id for c in comments)

    # edit comment
    edit_payload = {"comment_text": "Edited comment text."}
    r = client.put(f"/calling-kanban/proposals/{proposal_id}/comments/{comment_id}", json=edit_payload, headers=auth_headers)
    assert r.status_code == 200
    edited = r.json()
    assert edited["comment_text"] == "Edited comment text."

    # delete comment
    r = client.delete(f"/calling-kanban/proposals/{proposal_id}/comments/{comment_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["detail"] == "Comment deleted successfully"

    # get comments again
    r = client.get(f"/calling-kanban/proposals/{proposal_id}/comments", headers=auth_headers)
    assert r.status_code == 200
    comments = r.json()
    assert not any(c["id"] == comment_id for c in comments)
