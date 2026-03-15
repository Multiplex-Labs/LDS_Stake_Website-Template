from logging import getLogger
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from datetime import datetime, timezone

from ..utils import CallingUser
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
    initial_update = KanbanUpdate(
        proposal_id=proposal.id,  # Will be set after proposal is added to session
        updater_id=current_user.id,
        from_stage=None,  # No previous stage
        to_stage=KanbanStages.SUBMITTED
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
    current_user: User = Depends(CallingUser())
):
    """Get all comments for a calling proposal"""
    pass

@router.put("/proposals/{proposal_id}/comments/{comment_id}", response_model=CallingComment)
def edit_comment(
    proposal_id: int,
    comment_id: int,
    comment_data: CallingComment,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Edit an existing comment on a calling proposal"""
    pass

@router.delete("/proposals/{proposal_id}/comments/{comment_id}")
def delete_comment(
    proposal_id: int,
    comment_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Delete a comment from a calling proposal"""
    pass

# CallingApproval endpoints
@router.post("/proposals/{proposal_id}/approvals", response_model=CallingApproval)
def add_approval(
    proposal_id: int,
    approval: CallingApproval,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Add an approval (approve/reject) to a calling proposal"""
    pass


@router.get("/proposals/{proposal_id}/approvals", response_model=list[CallingApproval])
def get_approvals(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Get all approvals for a calling proposal"""
    pass


# CallingInterview endpoints
@router.post("/proposals/{proposal_id}/interviews", response_model=CallingInterview)
def schedule_interview(
    proposal_id: int,
    interview: CallingInterview,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Schedule an interview for a calling proposal"""
    pass


@router.get("/proposals/{proposal_id}/interviews", response_model=list[CallingInterview])
def get_interviews(
    proposal_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Get all interviews for a calling proposal"""
    pass


# Kanban board view
@router.get("/board")
def get_kanban_board(
    session: Session = Depends(get_session),
    current_user: User = Depends(CallingUser())
):
    """Get kanban board view with proposals grouped by stage"""
    pass

