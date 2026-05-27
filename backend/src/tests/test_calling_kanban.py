import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.models import (
    CallingProposal, CallingInterview, Calling, UserCalling,
    KanbanStages, Permission, Permissions,
)
from src.utils.calling_kanban import get_current_proposal_status


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


def test_update_proposal_and_permissions(client: TestClient, auth_headers, userpass, db_session: Session):
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

    r = client.put(f"/calling-kanban/proposals/{proposal_id}", json=proposal_update, headers=unauthorized_headers)
    assert r.status_code == 403

    # A user with MANAGE_CALLING_PROPOSALS (but NOT SUBMIT_CALLING_PROPOSALS) must
    # also be able to update the proposal. This guards against the regression where
    # the endpoint required SUBMIT permission at the outer CallingUser guard, which
    # blocked managers who only held the MANAGE permission.
    manager_user, manager_password = userpass
    manager_perm = Permissions(
        foreign_id=str(manager_user.id),
        is_calling=False,
        scopes=int(Permission.MANAGE_CALLING_PROPOSALS),  # MANAGE only, not SUBMIT
    )
    db_session.add(manager_perm)
    db_session.commit()

    manager_token = login_client(client, manager_user.email, manager_password)
    manager_headers = {"Authorization": f"Bearer {manager_token}"}

    proposal_update["fname"] = "ManagedJane"
    r = client.put(f"/calling-kanban/proposals/{proposal_id}", json=proposal_update, headers=manager_headers)
    assert r.status_code == 200, f"Manager with MANAGE_CALLING_PROPOSALS should be able to update: {r.text}"
    assert r.json()["fname"] == "ManagedJane"

    # cleanup the permission row added above
    db_session.delete(manager_perm)
    db_session.commit()


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


def test_advance_from_stage_precondition(client: TestClient, auth_headers, userpass, db_session: Session):
    """from_stage precondition: match succeeds, mismatch returns 409, omitting skips check."""
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    assert r.status_code == 200
    proposal_id = r.json()["id"]

    # Correct from_stage (SP_APPROVAL = 0) — should advance
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/advance?from_stage=0", headers=auth_headers)
    assert r.status_code == 200
    db_session.expire_all()
    assert get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session) == KanbanStages.HC_APPROVAL

    # Stale from_stage (still 0, but proposal is now at HC_APPROVAL = 1) — should 409
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/advance?from_stage=0", headers=auth_headers)
    assert r.status_code == 409

    # No from_stage — bypasses precondition check, advances freely
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/advance", headers=auth_headers)
    assert r.status_code == 200
    db_session.expire_all()
    assert get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session) == KanbanStages.INTERVIEW

    # 403 without permission
    user, password = userpass
    token_no_perm = login_client(client, user.email, password)
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/advance",
                    headers={"Authorization": f"Bearer {token_no_perm}"})
    assert r.status_code == 403


def test_revert_proposal(client: TestClient, auth_headers, userpass, db_session: Session, create_user):
    """Revert moves a proposal back one stage and correctly resets interview state."""
    # Create proposal (starts at SP_APPROVAL)
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    assert r.status_code == 200
    proposal_id = r.json()["id"]

    # Force-advance to HC_APPROVAL
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/advance", headers=auth_headers)
    assert r.status_code == 200

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.HC_APPROVAL

    # Revert back to SP_APPROVAL
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/revert", headers=auth_headers)
    assert r.status_code == 200

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.SP_APPROVAL

    # Cannot revert a new calling below SP_APPROVAL
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/revert", headers=auth_headers)
    assert r.status_code == 400

    # Force-advance to INTERVIEW and verify CallingInterview is created/reset
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/advance", headers=auth_headers)  # → HC_APPROVAL
    assert r.status_code == 200
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/advance", headers=auth_headers)  # → INTERVIEW
    assert r.status_code == 200

    # Set an interviewer so we can verify it gets cleared on revert
    sp, sp_pass = create_user()
    db_session.add(sp)
    db_session.commit()
    db_session.refresh(sp)
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/interview?interviewer_id={sp.id}", headers=auth_headers)
    assert r.status_code == 200

    # Revert to HC_APPROVAL — must reset CallingInterview
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/revert", headers=auth_headers)
    assert r.status_code == 200

    db_session.expire_all()
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.HC_APPROVAL

    interview = db_session.exec(
        select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)
    ).first()
    assert interview is not None
    assert interview.interviewer_id is None
    assert interview.interview_date is None


def test_revert_proposal_permission_and_terminal(client: TestClient, auth_headers, userpass, db_session: Session):
    """Revert returns 403 without MANAGE_CALLING_PROPOSALS and 400 on DONE proposals."""
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    assert r.status_code == 200
    proposal_id = r.json()["id"]

    # 403 without permission
    user, password = userpass
    token = login_client(client, user.email, password)
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/revert",
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403

    # Advance all the way to DONE
    for _ in range(6):
        client.post(f"/calling-kanban/proposals/{proposal_id}/advance", headers=auth_headers)

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.DONE

    # 400 on DONE
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/revert", headers=auth_headers)
    assert r.status_code == 400


def test_revert_does_not_re_advance_on_next_approval(
    client: TestClient, auth_headers, db_session: Session, create_user
):
    """After a revert, pre-existing approvals must NOT auto-advance the proposal."""
    # Set up stake presidency
    sp, sp_pass = create_user()
    fc, fc_pass = create_user()
    for u in (sp, fc):
        db_session.add(u)
    db_session.commit()
    for u in (sp, fc):
        db_session.refresh(u)

    sp_calling = db_session.exec(select(Calling).where(Calling.name == "Stake President")).first()
    fc_calling = db_session.exec(select(Calling).where(Calling.name == "First Counselor")).first()
    db_session.add(UserCalling(user_id=sp.id, calling_id=sp_calling.id, slot_number=1))
    db_session.add(UserCalling(user_id=fc.id, calling_id=fc_calling.id, slot_number=1))
    db_session.commit()

    # Create proposal and collect 2 SP approvals → auto-advances to HC_APPROVAL
    r = client.post("/calling-kanban/proposals", json=create_proposal_payload(), headers=auth_headers)
    proposal_id = r.json()["id"]

    sp_headers = {"Authorization": f"Bearer {login_client(client, sp.email, sp_pass)}"}
    fc_headers = {"Authorization": f"Bearer {login_client(client, fc.email, fc_pass)}"}
    client.post(f"/calling-kanban/proposals/{proposal_id}/approvals?approved=true", headers=sp_headers)
    client.post(f"/calling-kanban/proposals/{proposal_id}/approvals?approved=true", headers=fc_headers)

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.HC_APPROVAL

    # Revert back to SP_APPROVAL
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/revert", headers=auth_headers)
    assert r.status_code == 200

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.SP_APPROVAL

    # Changing an existing SP approval must NOT re-advance (old approvals predate stage re-entry)
    r = client.patch(f"/calling-kanban/proposals/{proposal_id}/approvals?approved=true", headers=sp_headers)
    assert r.status_code == 200

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.SP_APPROVAL, (
        "Historical pre-revert approvals must not count toward the threshold after a revert"
    )


def test_revert_release_cannot_go_below_interview(client: TestClient, auth_headers, db_session: Session):
    """A release proposal cannot be reverted below INTERVIEW (its initial stage)."""
    payload = {**create_proposal_payload(), "is_release": True}
    r = client.post("/calling-kanban/proposals", json=payload, headers=auth_headers)
    assert r.status_code == 200
    proposal_id = r.json()["id"]

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.INTERVIEW

    r = client.post(f"/calling-kanban/proposals/{proposal_id}/revert", headers=auth_headers)
    assert r.status_code == 400


def test_kanban_flow_release_call(
        client: TestClient,
        auth_headers,
        db_session: Session,
        create_user):
    # Create a release proposal
    payload = create_proposal_payload()
    payload["is_release"] = True

    r = client.post("/calling-kanban/proposals", json=payload, headers=auth_headers)
    assert r.status_code == 200
    proposal_id = r.json()["id"]

    # Release proposals start at INTERVIEW
    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.INTERVIEW

    # Ensure a CallingInterview row exists for the proposal (route will now create if missing, but we assert stage correctness first)
    interview = db_session.exec(select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)).first()
    assert interview is not None, "CallingInterview row should be automatically created for release proposal upon creation if it does not exist"

    # Setup an interviewer user
    stake_president, sp_pass = create_user()
    db_session.add(stake_president)
    db_session.commit()
    db_session.refresh(stake_president)

    # Assign a known calling, not required for this endpoint but keeps domain logic consistent
    sp_calling = db_session.exec(select(Calling).where(Calling.name == "Stake President")).first()
    assert sp_calling is not None
    db_session.add(UserCalling(user_id=stake_president.id, calling_id=sp_calling.id, slot_number=1))
    db_session.commit()

    # Schedule and complete interview
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/interview?interviewer_id={stake_president.id}", headers=auth_headers)
    assert r.status_code == 200

    r = client.post(f"/calling-kanban/proposals/{proposal_id}/interview/complete", headers=auth_headers)
    assert r.status_code == 200

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.SUSTAIN

    # Continue through remaining manual kanban states
    r = client.post(f"/calling-kanban/proposals/{proposal_id}/sustain", headers=auth_headers)
    assert r.status_code == 200

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.LCR_UPDATE

    r = client.post(f"/calling-kanban/proposals/{proposal_id}/lcr", headers=auth_headers)
    assert r.status_code == 200

    current_stage = get_current_proposal_status(db_session.get(CallingProposal, proposal_id), db_session)
    assert current_stage == KanbanStages.DONE
