from logging import getLogger
from fastapi import APIRouter, Depends, HTTPException, Request
from collections import defaultdict
from sqlmodel import Session, Field, col, select
from datetime import datetime, timezone

from ..utils import (
    CallingUser,
    BISHOP_CALLING_NAME,
    can_approve_proposal,
    get_current_proposal_status,
    create_kanban_update,
    update_proposal_status,
    ensure_interview_row,
    user_has_calling,
    user_has_permission,
    get_bishops_ward,
    get_stake_presidency,
)
from ..utils.calling_kanban import _stage_scoped_approval_counts
from ..db import get_session
from ..models import (
    BaseModel,
    KanbanStages,
    KanbanUpdate,
    CallingProposal,
    CallingComment,
    CallingApproval,
    CallingInterview,
    User,
    Ward,
    Permission
)

logger = getLogger("application")
router = APIRouter(prefix="/calling-kanban", tags=["calling-kanban"])


class CallingProposalWithCounts(BaseModel):
    id: int
    fname: str
    lname: str
    spouse_name: str
    proposed_calling: str
    ward_id: int
    submitter: int
    is_release: bool
    submitted_at: datetime
    updated_at: datetime
    stage_approval_count: int = Field(ge=0)
    stage_denial_count: int = Field(ge=0)

    @classmethod
    def from_proposal(cls, proposal: CallingProposal, stage_approval_count: int, stage_denial_count: int) -> "CallingProposalWithCounts":
        return cls(
            id=proposal.id,
            fname=proposal.fname,
            lname=proposal.lname,
            spouse_name=proposal.spouse_name,
            proposed_calling=proposal.proposed_calling,
            ward_id=proposal.ward_id,
            submitter=proposal.submitter,
            is_release=proposal.is_release,
            submitted_at=proposal.submitted_at,
            updated_at=proposal.updated_at,
            stage_approval_count=stage_approval_count,
            stage_denial_count=stage_denial_count,
        )


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
    request: Request,
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
    ward = session.get(Ward, proposal.ward_id) if proposal.ward_id else None
    request.app.state.discord_bot.submit_kanban_update(
        initial_update,
        ward=ward.name if ward else "(unknown)",
    )  # Notify Discord bot of new proposal and its initial stage
    #  Request Approvals from Stake Presidency if this is not release
    if not proposal.is_release:
        logger.info(f"Submitting approval request for proposal ID {proposal.id} to stake presidency via discord")
        sp = get_stake_presidency(session)
        for u in sp:
            request.app.state.discord_bot.submit_kanban_update(
                initial_update,
                ward=ward.name if ward else "(unknown)",
            )  # Notify Discord bot of new proposal and its initial stage
            request.app.state.discord_bot.request_kanban_approval(
                proposal_id=proposal.id,
                approver_email=u.email,
                person=proposal.fname + " " + proposal.lname,
                calling=proposal.proposed_calling,
                ward=ward.name if ward else "(unknown)",
                details_url=f"{request.base_url}calling-kanban/proposals/{proposal.id}"
            )
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
    request: Request,
    from_stage: KanbanStages | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """If from_stage is provided and does not match the proposal's current stage, a 409 is
    returned so the caller can detect a race between auto-advance and a concurrent drag.
    """
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    current_stage = get_current_proposal_status(proposal, session)
    if from_stage is not None and current_stage != from_stage:
        raise HTTPException(status_code=409, detail="Proposal has moved since you last loaded the board")
    if current_stage == KanbanStages.DONE:
        raise HTTPException(status_code=400, detail="Proposal is already at final stage")
    next_stage = KanbanStages(current_stage.value + 1)
    if next_stage == KanbanStages.INTERVIEW:
        ensure_interview_row(proposal_id, session)
    create_kanban_update(
        session=session,
        proposal_id=proposal_id,
        updater_id=current_user.id,
        from_stage=current_stage,
        to_stage=next_stage,
        discord_bot=request.app.state.discord_bot
    )
    return {"detail": f"Proposal advanced to {next_stage}"}

# CallingApproval endpoints
@router.post("/proposals/{proposal_id}/approvals", response_model=CallingApproval)
def add_approval(
    request: Request,
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
    update_proposal_status(proposal, session, request.app.state.discord_bot)  # Update proposal status based on new approval
    return approval    

@router.post("/proposals/{proposal_id}/approvals/bot", response_model=CallingApproval)
def add_approval_bot(
    request: Request,
    proposal_id: int,
    approved: bool,
    approver_email: str,
    session: Session = Depends(get_session),
    _: User = Depends(CallingUser(permissions=Permission.DISCORD_BOT))
):
    """Add an approval (approve/reject) to a calling proposal"""
    # Get proposal
    user = session.exec(select(User).where(User.email == approver_email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Approver not found")
    if not can_approve_proposal(user):
        raise HTTPException(status_code=403, detail="Approver is not authorized to approve/reject proposals")
    
    return add_approval(request, proposal_id, approved, session, user)

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
    request: Request,
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
    update_proposal_status(proposal, session, request.app.state.discord_bot)  # Update proposal status based on changed approval
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
    request: Request,
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
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if get_current_proposal_status(proposal, session) != KanbanStages.INTERVIEW:
        raise HTTPException(status_code=400, detail="Proposal is not at interview stage")
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
        to_stage=KanbanStages.SUSTAIN,
        discord_bot=request.app.state.discord_bot
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
    request: Request,
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
            to_stage=KanbanStages.LCR_UPDATE,
            discord_bot=request.app.state.discord_bot
        )
    else:
        create_kanban_update(
            session=session,
            proposal_id=proposal_id,
            updater_id=current_user.id,
            from_stage=KanbanStages.SUSTAIN,
            to_stage=KanbanStages.SET_APART,
            discord_bot=request.app.state.discord_bot
        )
    return proposal

@router.post("/proposals/{proposal_id}/set-apart", response_model=CallingProposal)
def set_apart_proposal(
    request: Request,
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
        to_stage=KanbanStages.LCR_UPDATE,
        discord_bot=request.app.state.discord_bot
    )
    return proposal

@router.post("/proposals/{proposal_id}/lcr", response_model=CallingProposal)
def update_lcr_proposal(
    request: Request,
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
        to_stage=KanbanStages.DONE,
        discord_bot=request.app.state.discord_bot
    )
    return proposal

@router.post("/proposals/{proposal_id}/revert", response_model=CallingProposal)
def revert_proposal(
    request: Request,
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """Revert a calling proposal one stage backwards.

    Releases may not be reverted below INTERVIEW (their starting stage).
    New callings may not be reverted below SP_APPROVAL.
    DONE proposals are terminal and cannot be reverted.
    Reverting to INTERVIEW resets the CallingInterview record so a new
    interviewer can be assigned.
    """
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    current_stage = get_current_proposal_status(proposal, session)

    if current_stage == KanbanStages.DONE:
        raise HTTPException(status_code=400, detail="Cannot revert a completed proposal")

    # Releases start at INTERVIEW; new callings start at SP_APPROVAL
    min_stage = KanbanStages.INTERVIEW if proposal.is_release else KanbanStages.SP_APPROVAL
    if current_stage == min_stage:
        raise HTTPException(status_code=400, detail="Proposal is already at its initial stage")

    prev_stage = KanbanStages(current_stage.value - 1)

    # Reset the interview whenever INTERVIEW is either end of the transition so a
    # new interviewer can be assigned. Committed atomically with the stage revert below.
    if KanbanStages.INTERVIEW in (current_stage, prev_stage):
        ensure_interview_row(proposal_id, session, reset=True)

    create_kanban_update(
        session=session,
        proposal_id=proposal_id,
        updater_id=current_user.id,
        from_stage=current_stage,
        to_stage=prev_stage,
        discord_bot=request.app.state.discord_bot
    )
    return proposal


@router.delete("/proposals/{proposal_id}")
def delete_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
):
    """Hard-delete a calling proposal and all its child rows in a single transaction.

    Returns 404 if the proposal does not exist.
    Returns 409 if the proposal's current stage is DONE.
    """
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    # Guard against proposals whose initial KanbanUpdate was never committed — calling
    # get_current_proposal_status on such a proposal would raise a misleading 404.
    updates = session.exec(
        select(KanbanUpdate)
        .where(KanbanUpdate.proposal_id == proposal_id)
        .order_by(KanbanUpdate.updated_at, KanbanUpdate.id)
    ).all()
    if not updates:
        logger.error("Proposal %s has no KanbanUpdate rows — data integrity violation", proposal_id)
        raise HTTPException(
            status_code=500,
            detail="Proposal is in an inconsistent state and cannot be deleted",
        )

    current_stage = updates[-1].to_stage
    if current_stage == KanbanStages.DONE:
        raise HTTPException(status_code=409, detail="Cannot delete a completed proposal")

    # Delete child rows in dependency order before removing the parent
    for row in session.exec(select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)).all():
        session.delete(row)
    for row in session.exec(select(CallingApproval).where(CallingApproval.proposal_id == proposal_id)).all():
        session.delete(row)
    for row in session.exec(select(CallingComment).where(CallingComment.proposal_id == proposal_id)).all():
        session.delete(row)
    for row in updates:
        session.delete(row)

    try:
        session.delete(proposal)
        session.commit()
    except Exception as exc:
        session.rollback()
        logger.error("Failed to delete proposal %s: %s", proposal_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to delete proposal. The operation was rolled back.",
        ) from exc

    return {"detail": "Proposal deleted"}


# Kanban board view
@router.get("/board", response_model=dict[KanbanStages, list[CallingProposalWithCounts]])
def get_kanban_board(
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Return active proposals grouped by kanban stage; access mirrors list_proposals."""
    proposals = session.exec(_proposal_statement_for_user(current_user, session)).all()
    board: dict[KanbanStages, list[CallingProposalWithCounts]] = {stage: [] for stage in KanbanStages}
    if not proposals:
        return board

    proposal_ids = [p.id for p in proposals]
    all_updates = session.exec(
        select(KanbanUpdate).where(col(KanbanUpdate.proposal_id).in_(proposal_ids))
    ).all()
    updates_by_proposal: dict[int, list[KanbanUpdate]] = defaultdict(list)
    for u in all_updates:
        updates_by_proposal[u.proposal_id].append(u)

    all_approvals = session.exec(
        select(CallingApproval).where(col(CallingApproval.proposal_id).in_(proposal_ids))
    ).all()
    approvals_by_proposal: dict[int, list[CallingApproval]] = defaultdict(list)
    for a in all_approvals:
        approvals_by_proposal[a.proposal_id].append(a)

    for proposal in proposals:
        updates = updates_by_proposal.get(proposal.id, [])
        if not updates:
            logger.warning("get_kanban_board: proposal %s has no KanbanUpdate rows; skipping", proposal.id)
            continue
        stage = max(updates, key=lambda u: (u.updated_at, u.id)).to_stage
        if stage in board:
            proposal_updates = updates_by_proposal.get(proposal.id, [])
            proposal_approvals = approvals_by_proposal.get(proposal.id, [])
            approved, denied = _stage_scoped_approval_counts(proposal_updates, proposal_approvals, stage)
            board[stage].append(CallingProposalWithCounts.from_proposal(
                proposal, stage_approval_count=approved, stage_denial_count=denied
            ))
    return board

