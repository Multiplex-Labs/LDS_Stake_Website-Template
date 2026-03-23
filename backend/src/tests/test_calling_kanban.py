import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import Permissions, Permission, CallingProposal


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

def test_kanban_flow_call(
        client: TestClient,
        auth_headers,
        db_session: Session,
        create_user):
    # Create stake presidency users
    from src.models import User, Calling, UserCalling
    from src.utils import hash_password
    import secrets

    # Create stake president
    stake_president, sp_pass = create_user()
    db_session.add(stake_president)
    db_session.commit()
    db_session.refresh(stake_president)

    # Assign stake president calling
    sp_calling = db_session.exec(select(Calling).where(Calling.name == "Stake President")).first()
    assert sp_calling is not None, "Stake President calling must exist in the database for this test"
    
    sp_usercalling = UserCalling(user_id=stake_president.id, calling_id=sp_calling.id, slot_number=1)
    db_session.add(sp_usercalling)
    db_session.commit()

    # Create first councilor
    first_councilor, fc_pass = create_user()
    db_session.add(first_councilor)
    db_session.commit()
    db_session.refresh(first_councilor)

    # Assign first councilor calling
    fc_calling = db_session.exec(select(Calling).where(Calling.name == "First Counselor")).first()
    assert fc_calling is not None, "First Counselor calling must exist in the database for this test"
    
    fc_usercalling = UserCalling(user_id=first_councilor.id, calling_id=fc_calling.id, slot_number=1)
    db_session.add(fc_usercalling)
    db_session.commit()

    # Create high councilors
    hc_calling = db_session.exec(select(Calling).where(Calling.name == "High Councilor")).first()
    assert hc_calling is not None, "High Councilor calling must exist in the database for this test"
    hc_users = []
    for i in range(3):
        hc_user, hc_pass = create_user()
        db_session.add(hc_user)
        db_session.commit()
        db_session.refresh(hc_user)
        hc_users.append((hc_user, hc_pass))

        hc_usercalling = UserCalling(user_id=hc_user.id, calling_id=hc_calling.id, slot_number=i+1)
        db_session.add(hc_usercalling)
        db_session.commit()

    # Create proposal
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    assert r.status_code == 200
    proposal = r.json()
    proposal_id = proposal["id"]

    # Check initial stage is SP_APPROVAL
    from src.utils.calling_kanban import get_current_proposal_status
    from src.models import KanbanStages
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.SP_APPROVAL

    # SP Approvals - need at least 2
    sp_headers = {"Authorization": f"Bearer {login_client(client, stake_president.email, sp_pass)}"}
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/approvals?approved=true", headers=sp_headers)
    assert r.status_code == 200

    fc_headers = {"Authorization": f"Bearer {login_client(client, first_councilor.email, fc_pass)}"}
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/approvals?approved=true", headers=fc_headers)
    assert r.status_code == 200

    # Should now be at HC_APPROVAL
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.HC_APPROVAL

    # HC Approvals - need at least 3
    for hc_user, hc_pass in hc_users:
        hc_headers = {"Authorization": f"Bearer {login_client(client, hc_user.email, hc_pass)}"}
        r = client.post(f"/calling-kanban/proposals/{proposal_id}/approvals?approved=true", headers=hc_headers)
        assert r.status_code == 200

    # Should now be at INTERVIEW
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.INTERVIEW

    # Schedule interview
    interviewer_id = stake_president.id  # Use stake president as interviewer
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/interview?interviewer_id={interviewer_id}", headers=auth_headers)
    assert r.status_code == 200

    # Complete interview
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/interview/complete", headers=auth_headers)
    assert r.status_code == 200

    # Should now be at SUSTAIN
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.SUSTAIN

    # Sustain
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/sustain", headers=auth_headers)
    assert r.status_code == 200

    # Should now be at SET_APART
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.SET_APART

    # Set apart
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/set-apart", headers=auth_headers)
    assert r.status_code == 200

    # Should now be at LCR_UPDATE
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.LCR_UPDATE

    # LCR update
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/lcr", headers=auth_headers)
    assert r.status_code == 200

    # Should now be at DONE
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.DONE