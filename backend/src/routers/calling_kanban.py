from logging import getLogger
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from datetime import datetime, timezone

from ..utils import (
    CallingUser,
    can_approve_proposal,
    get_current_proposal_status,
    create_kanban_update,
    update_proposal_status
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


# CallingProposal endpoints
@router.post("/proposals", response_model=CallingProposal)
def create_proposal(
    proposal: CallingProposal,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.SUBMIT_CALLING_PROPOSALS))
):
    """Create a new calling proposal"""
    # TODO: Who should be allowed to create calling proposals?
    proposal.submitter = current_user.id
    proposal.id = None  # Ensure ID is not set by client
    proposal.submitted_at = proposal.updated_at = datetime.now(timezone.utc)  # Let defaults handle timestamps

    # Create initial KanbanUpdate for the new proposal
    to_stage = KanbanStages.INTERVIEW if proposal.is_release else KanbanStages.SP_APPROVAL
    initial_update = KanbanUpdate(
        proposal_id=proposal.id,  # Will be set after proposal is added to session
        updater_id=current_user.id,
        from_stage=None,  # No previous stage
        to_stage=to_stage
    )
    session.add(proposal)
    session.add(initial_update)
    session.commit()
    session.refresh(proposal)
    return proposal


@router.get("/proposals", response_model=list[CallingProposal])
def list_proposals(
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """List all calling proposals"""
    # TODO: Who should be allowed to view calling proposals?
    statement = select(CallingProposal)
    proposals = session.exec(statement).all()
    return proposals


@router.get("/proposals/{proposal_id}", response_model=CallingProposal)
def get_proposal(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Get a specific calling proposal by ID"""
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return proposal

@router.put("/proposals/{proposal_id}", response_model=CallingProposal)
def update_proposal(
    proposal_id: int,
    proposal_data: CallingProposal,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.CREATE_CALLING_PROPOSALS))
):
    """Update an existing calling proposal"""
    # TODO: Should updating a calling proposal reset its stage back to submitted?
    if current_user.id != proposal_data.submitter and not current_user.has_permission(Permission.MANAGE_CALLING_PROPOSALS):
        raise HTTPException(status_code=403, detail="Not authorized to update this proposal")
    proposal = session.get(CallingProposal, proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    # Update fields
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
    if comment.commenter_id != current_user.id and not current_user.has_permission(Permission.MANAGE_CALLING_PROPOSALS):
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
    session.delete(comment)
    session.commit()
    return {"detail": "Comment deleted successfully"}

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
    approval = CallingApproval(
        proposal_id=proposal_id,
        approver_id=current_user.id,
        approved=approved,
    )
    session.add(approval)
    session.commit()
    session.refresh(approval)
    update_proposal_status(session, proposal_id)  # Update proposal status based on new approval
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
    approval.approved = approved
    approval.created_at = datetime.now(timezone.utc)  # Update timestamp to reflect change
    session.add(approval)
    session.commit()
    session.refresh(approval)
    update_proposal_status(session, proposal_id)  # Update proposal status based on changed approval
    return approval

# CallingInterview endpoints
@router.post("/proposals/{proposal_id}/interview", response_model=CallingInterview)
def schedule_interview(
    proposal_id: int,
    interviewer_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser(permissions=Permission.MANAGE_CALLING_PROPOSALS)),
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
    current_user: User = Depends(CallingUser(permissions=Permission.VIEW_CALLING_PROPOSALS))
):
    """Get interview for a calling proposal"""
    statement = select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)
    interview = session.exec(statement).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview


# Kanban board view
@router.get("/board")
def get_kanban_board(
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Get kanban board view with proposals grouped by stage"""
    pass

