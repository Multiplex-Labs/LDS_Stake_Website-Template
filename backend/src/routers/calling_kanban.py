from logging import getLogger
from fastapi import APIRouter, Depends, HTTPException
from collections import defaultdict
from sqlmodel import Session, col, select
from datetime import datetime, timezone

from ..utils import (
    CallingUser,
    BISHOP_CALLING_NAME,
    can_approve_proposal,
    get_current_proposal_status,
    create_kanban_update,
    update_proposal_status,
    user_has_calling,
    user_has_permission,
    get_bishops_ward
)
from ..db import get_session
from ..models import (
    KanbanStages,
    KanbanUpdate,
    CallingProposal,
    CallingComment,
    CallingApproval,
    CallingInterview,
    User,
    Permission
)

logger = getLogger("application")
router = APIRouter(prefix="/calling-kanban", tags=["calling-kanban"])


def _proposal_statement_for_user(current_user: User, session: Session):
    """Return a SELECT scoped to what current_user is allowed to see, or raise 403."""
    if user_has_permission(current_user, Permission.VIEW_CALLING_PROPOSALS, session):
        return select(CallingProposal)
    if user_has_calling(current_user, BISHOP_CALLING_NAME):
        bishop_ward = get_bishops_ward(session, current_user)
        return select(CallingProposal).where(CallingProposal.ward_id == bishop_ward.id)
    raise HTTPException(status_code=403, detail="Not authorized to view calling proposals")


# CallingProposal endpoints
@router.post("/proposals", response_model=CallingProposal)
def create_proposal(
    proposal: CallingProposal,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.SUBMIT_CALLING_PROPOSALS))
):
    """Create a new calling proposal"""
    logger.debug(f"User {current_user.id} is attempting to create a new calling proposal with data: {proposal}")
    # TODO: Who should be allowed to create calling proposals?
    proposal.submitter = current_user.id
    proposal.id = None  # Ensure ID is not set by client
    proposal.submitted_at = proposal.updated_at = datetime.now(timezone.utc)  # Let defaults handle timestamps
    session.add(proposal)
    session.commit()
    session.refresh(proposal)

    # Create initial KanbanUpdate for the new proposal
    to_stage = KanbanStages.INTERVIEW if proposal.is_release else KanbanStages.SP_APPROVAL
    initial_update = KanbanUpdate(
        proposal_id=proposal.id,  # Will be set after proposal is added to session
        updater_id=current_user.id,
        from_stage=None,  # No previous stage
        to_stage=to_stage
    )
    if proposal.is_release:
        # We need to create the interview record immediately for release proposals since they skip directly to interview stage
        interview = CallingInterview(
                proposal_id=proposal.id,
                interviewer_id = None,
            )
        session.add(interview)

    session.add(initial_update)
    session.commit()
    logger.debug(f"Created new proposal with ID {proposal.id} and initial kanban stage {to_stage}")
    return proposal


@router.get("/proposals", response_model=list[CallingProposal])
def list_proposals(
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """List calling proposals visible to current_user."""
    # TODO: Who should be allowed to view calling proposals?
    proposals = session.exec(_proposal_statement_for_user(current_user, session)).all()
    return proposals


@router.get("/proposals/{proposal_id}", response_model=CallingProposal)
def get_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Get a specific calling proposal by ID"""
    proposal = session.get(CallingProposal, proposal_id)
    if user_has_calling(current_user, BISHOP_CALLING_NAME):
        bishop_ward = get_bishops_ward(session, current_user)
        if not proposal or proposal.ward_id != bishop_ward.id:
            raise HTTPException(status_code=404, detail="Proposal not found")
        return proposal
    if not user_has_permission(current_user, Permission.VIEW_CALLING_PROPOSALS, session) or not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal

@router.put("/proposals/{proposal_id}", response_model=CallingProposal)
def update_proposal(
    proposal_id: int,
    proposal_data: CallingProposal,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Update an existing calling proposal."""
    logger.debug(f"User {current_user.id} is attempting to update calling proposal with ID {proposal_id}, submitter {proposal_data.submitter}, and data: {proposal_data}")
    # Compare against DB submitter — proposal_data.submitter is client-supplied and untrusted.
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if current_user.id != proposal.submitter and not user_has_permission(current_user, Permission.MANAGE_CALLING_PROPOSALS, session):
        raise HTTPException(status_code=403, detail="Not authorized to update this proposal")
    proposal.fname = proposal_data.fname
    proposal.lname = proposal_data.lname
    proposal.spouse_name = proposal_data.spouse_name
    proposal.proposed_calling = proposal_data.proposed_calling
    proposal.ward_id = proposal_data.ward_id
    proposal.is_release = proposal_data.is_release
    proposal.updated_at = datetime.now(timezone.utc)
    
    session.add(proposal)
    session.commit()
    session.refresh(proposal)
    return proposal

# CallingComment endpoints
@router.post("/proposals/{proposal_id}/comments", response_model=CallingComment)
def add_comment(
    proposal_id: int,
    comment: CallingComment,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Add a comment to a calling proposal"""
    comment.proposal_id = proposal_id
    comment.commenter_id = current_user.id
    comment.id = None  # Ensure ID is not set by client
    comment.created_at = datetime.now(timezone.utc)  # Let default handle timestamp
    comment.edited_at = None
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment

@router.get("/proposals/{proposal_id}/comments", response_model=list[CallingComment])
def get_comments(
    proposal_id: int,
    session: Session = Depends(get_session),
    _ = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Get all comments for a calling proposal"""
    statement = select(CallingComment).where(CallingComment.proposal_id == proposal_id)
    comments = session.exec(statement).all()
    return comments

@router.put("/proposals/{proposal_id}/comments/{comment_id}", response_model=CallingComment)
def edit_comment(
    proposal_id: int,
    comment_id: int,
    comment_data: CallingComment,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Edit an existing comment on a calling proposal"""
    comment = session.get(CallingComment, comment_id)
    if not comment or comment.proposal_id != proposal_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.commenter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this comment")
    # Update fields
    comment.comment_text = comment_data.comment_text
    comment.edited_at = datetime.now(timezone.utc)
    
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment

@router.delete("/proposals/{proposal_id}/comments/{comment_id}")
def delete_comment(
    proposal_id: int,
    comment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Delete a comment from a calling proposal"""
    comment = session.get(CallingComment, comment_id)
    if not comment or comment.proposal_id != proposal_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.commenter_id != current_user.id and not user_has_permission(current_user, Permission.MANAGE_CALLING_PROPOSALS, session):
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
    session.delete(comment)
    session.commit()
    return {"detail": "Comment deleted successfully"}

@router.post("/proposals/{proposal_id}/advance")
def force_advance_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS))
):
    """Force advance a calling proposal to the next stage (for testing/admin purposes)"""
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    current_stage = get_current_proposal_status(proposal, session)
    if current_stage == KanbanStages.DONE:
        raise HTTPException(status_code=400, detail="Proposal is already at final stage")
    # Create kanban update to next stage
    next_stage = KanbanStages(current_stage + 1)
    create_kanban_update(
        session=session,
        proposal_id=proposal_id,
        updater_id=current_user.id,
        from_stage=current_stage,
        to_stage=next_stage
    )
    return {"detail": f"Proposal advanced to {next_stage}"}

# CallingApproval endpoints
@router.post("/proposals/{proposal_id}/approvals", response_model=CallingApproval)
def add_approval(
    proposal_id: int,
    approved: bool,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Add an approval (approve/reject) to a calling proposal"""
    if not can_approve_proposal(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to approve/reject proposals")
    # Get proposal
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    # Check if user has already approved/rejected
    statement = select(CallingApproval).where(
        CallingApproval.proposal_id == proposal_id,
        CallingApproval.approver_id == current_user.id
    )
    existing_approval = session.exec(statement).first()
    if existing_approval:
        raise HTTPException(status_code=400, detail="You have already submitted an approval/rejection for this proposal, to update, send a PATCH request to the same endpoint")
    approval = CallingApproval(
        proposal_id=proposal_id,
        approver_id=current_user.id,
        approved=approved,
    )
    session.add(approval)
    session.commit()
    session.refresh(approval)
    update_proposal_status(proposal, session)  # Update proposal status based on new approval
    return approval    


@router.get("/proposals/{proposal_id}/approvals", response_model=list[CallingApproval])
def get_approvals(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Get all approvals for a calling proposal"""
    statement = select(CallingApproval).where(CallingApproval.proposal_id == proposal_id)
    approvals = session.exec(statement).all()
    return approvals

@router.patch("/proposals/{proposal_id}/approvals")
def change_approval_status(
    proposal_id: int,
    approved: bool,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Change an existing approval (approve/reject) for a calling proposal"""
    if not can_approve_proposal(current_user):
        raise HTTPException(status_code=403, detail="Not authorized to approve/reject proposals")
    statement = select(CallingApproval).where(
        CallingApproval.proposal_id == proposal_id,
        CallingApproval.approver_id == current_user.id
    )
    approval = session.exec(statement).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    approval.approved = approved
    approval.created_at = datetime.now(timezone.utc)  # Update timestamp to reflect change
    session.add(approval)
    session.commit()
    session.refresh(approval)
    update_proposal_status(proposal, session)  # Update proposal status based on changed approval
    return approval

# CallingInterview endpoints
@router.post("/proposals/{proposal_id}/interview", response_model=CallingInterview)
def schedule_interview(
    proposal_id: int,
    interviewer_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """Schedule an interview for a calling proposal"""
    statement = select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)
    interview = session.exec(statement).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Proposal not found or at improper stage")

    interviewer = session.get(User, interviewer_id)
    if not interviewer:
        raise HTTPException(status_code=404, detail="Interviewer not found")
    

    interview.proposal_id = proposal_id
    interview.interviewer_id = interviewer_id
    session.add(interview)
    session.commit()
    session.refresh(interview)
    return interview

@router.post("/proposals/{proposal_id}/interview/complete", response_model=CallingInterview)
def complete_interview(
    proposal_id: int,
    completion_date: datetime = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """Mark an interview as completed for a calling proposal"""
    statement = select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)
    interview = session.exec(statement).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Proposal not found or at improper stage")
    if interview.interviewer_id is None:
        raise HTTPException(status_code=400, detail="Interview has not been scheduled with an interviewer yet")
    interview.interview_date = completion_date or datetime.now(timezone.utc)
    session.add(interview)
    session.commit()
    session.refresh(interview)
    # Create kanban update
    create_kanban_update(
        session=session,
        proposal_id=proposal_id,
        updater_id=current_user.id,
        from_stage=KanbanStages.INTERVIEW,
        to_stage=KanbanStages.SUSTAIN
    )
    return interview

@router.get("/proposals/{proposal_id}/interview", response_model=CallingInterview)
def get_interview(
    proposal_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Get interview for a calling proposal"""
    statement = select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)
    interview = session.exec(statement).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview

@router.post("/proposals/{proposal_id}/sustain", response_model=CallingProposal)
def sustain_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """Mark sustaining as completed for a calling proposal"""
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if get_current_proposal_status(proposal, session) != KanbanStages.SUSTAIN:
        raise HTTPException(status_code=400, detail="Proposal is not at sustaining stage")
    # Create kanban update
    if proposal.is_release:
        # For release proposals, there is no set apart stage, so we move directly to LCR update after sustaining
        create_kanban_update(
            session=session,
            proposal_id=proposal_id,
            updater_id=current_user.id,
            from_stage=KanbanStages.SUSTAIN,
            to_stage=KanbanStages.LCR_UPDATE
        )
    else:
        create_kanban_update(
            session=session,
            proposal_id=proposal_id,
            updater_id=current_user.id,
            from_stage=KanbanStages.SUSTAIN,
            to_stage=KanbanStages.SET_APART
        )
    return proposal

@router.post("/proposals/{proposal_id}/set-apart", response_model=CallingProposal)
def set_apart_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """Mark a calling proposal as set apart (finalized)"""
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if get_current_proposal_status(proposal, session) != KanbanStages.SET_APART:
        raise HTTPException(status_code=400, detail="Proposal is not at set apart stage")
    # Create kanban update
    create_kanban_update(
        session=session,
        proposal_id=proposal_id,
        updater_id=current_user.id,
        from_stage=KanbanStages.SET_APART,
        to_stage=KanbanStages.LCR_UPDATE
    )
    return proposal

@router.post("/proposals/{proposal_id}/lcr", response_model=CallingProposal)
def update_lcr_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """Mark proposal as updated in LCR"""
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if get_current_proposal_status(proposal, session) != KanbanStages.LCR_UPDATE:
        raise HTTPException(status_code=400, detail="Proposal is not at LCR update stage")
    # Create kanban update
    create_kanban_update(
        session=session,
        proposal_id=proposal_id,
        updater_id=current_user.id,
        from_stage=KanbanStages.LCR_UPDATE,
        to_stage=KanbanStages.DONE
    )
    return proposal

# Kanban board view
@router.get("/board")
def get_kanban_board(
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Return active proposals grouped by kanban stage; access mirrors list_proposals."""
    proposals = session.exec(_proposal_statement_for_user(current_user, session)).all()
    board: dict[KanbanStages, list[CallingProposal]] = {stage: [] for stage in KanbanStages if stage != KanbanStages.DONE}
    if not proposals:
        return board

    proposal_ids = [p.id for p in proposals]
    all_updates = session.exec(
        select(KanbanUpdate).where(col(KanbanUpdate.proposal_id).in_(proposal_ids))
    ).all()
    updates_by_proposal: dict[int, list[KanbanUpdate]] = defaultdict(list)
    for u in all_updates:
        updates_by_proposal[u.proposal_id].append(u)

    for proposal in proposals:
        updates = updates_by_proposal.get(proposal.id, [])
        if not updates:
            continue
        stage = max(updates, key=lambda u: u.to_stage.value).to_stage
        if stage in board:
            board[stage].append(proposal)
    return board

