import os

from typing import List
from sqlmodel import Session, col, select
from fastapi import HTTPException
from datetime import datetime, timezone
from logging import getLogger

logger = getLogger("application")

from ..models import (
    Calling,
    CallingProposal,
    User,
    Ward,
    KanbanUpdate,
    KanbanStages,
    CallingApproval,
    CallingInterview,
    UserCalling
)

from .discord_bot import DiscordBotHandle


def can_approve_proposal(
    user: User,
) -> bool:
    """
    Determine if a user has the authority to approve or reject calling proposals.
    
    This function checks the user's current callings to see if they hold any positions
    that grant approval authority in the calling proposal process. Approval authority
    is typically reserved for stake leadership positions that oversee calling assignments.
    
    Args:
        user (User): The user object containing their callings and permissions.
        
    Returns:
        bool: True if the user can approve/reject proposals, False otherwise.
        
    Note:
        The approving callings are: high councilor, stake president, first councilor, 
        and second councilor. This reflects the ecclesiastical hierarchy where stake
        presidency and high council have oversight over calling proposals.
    """
    # Gather all relevant Permissions objects for the user
    approver_callings = ["high councilor", "stake president", "first counselor", "second counselor"]
    callings = [calling.calling.name.lower() for calling in user.callings]
    if not callings:
        callings = []
    return any(calling in approver_callings for calling in callings)

def is_high_councilor(user: User) -> bool:
    """
    Check if a user currently holds the calling of high councilor.
    
    High councilors are members of the stake high council, which is a governing body
    that assists the stake presidency in overseeing stake operations, including
    the approval process for calling proposals.
    
    Args:
        user (User): The user object to check for high councilor calling.
        
    Returns:
        bool: True if the user is a high councilor, False otherwise.
        
    Note:
        This function performs a case-insensitive check against the user's callings.
        The calling name must exactly match "high councilor" (case insensitive).
    """
    callings = [calling.calling.name.lower() for calling in user.callings]
    if not callings:
        callings = []
    return "high councilor" in callings

def is_stake_presidency(user: User) -> bool:
    """
    Check if a user is a member of the stake presidency.
    
    The stake presidency consists of the stake president and his counselors (first
    and second councilors). These individuals have the highest authority in stake
    governance and are responsible for final approvals in the calling process.
    
    Args:
        user (User): The user object to check for stake presidency membership.
        
    Returns:
        bool: True if the user is in the stake presidency, False otherwise.
        
    Note:
        This function checks for the callings: "stake president", "first councilor",
        and "second councilor". The check is case-insensitive.
    """
    callings = [calling.calling.name.lower() for calling in user.callings]
    if not callings:
        callings = []
    return any(calling in ["stake president", "first counselor", "second counselor"] for calling in callings)

def get_stake_presidency(session: Session) -> List[User]:
    """
    Retrieve all users who are currently serving in the stake presidency.
    
    The stake presidency is composed of the stake president and his counselors. This
    function queries the database to find all users who hold any of these callings,
    which are critical for the approval process in calling proposals.
    
    Args:
        session (Session): The database session to use for the query.
        
    Returns:
        List[User]: A list of User objects representing the members of the stake presidency.
        
    Note:
        The function checks for the callings "stake president", "first counselor",
        and "second counselor". The search is case-insensitive.
    """
    statement = select(User).where(
        User.callings.any(
            UserCalling.calling.has(
                Calling.name.ilike("stake president") |
                Calling.name.ilike("first counselor") |
                Calling.name.ilike("second counselor")
            )
        )
    )
    return session.exec(statement).all()
def get_high_councilors(session: Session) -> List[User]:
    """
    Retrieve all users who are currently serving as high councilors.
    
    High councilors are members of the stake high council, which assists the stake
    presidency in overseeing stake operations, including the approval process for
    calling proposals. This function queries the database to find all users with the
    high councilor calling.
    
    Args:
        session (Session): The database session to use for the query.
        
    Returns:
        List[User]: A list of User objects representing the high councilors.
        
    Note:
        The function checks for the calling "high councilor" in a case-insensitive manner.
    """
    statement = select(User).where(
        User.callings.any(
            UserCalling.calling.has(Calling.name.ilike("high councilor"))
        )
    )
    return session.exec(statement).all()
def _latest_update(updates: list) -> KanbanUpdate:
    return max(updates, key=lambda u: (u.updated_at, u.id))


def _get_stage_last_entered_at(proposal_id: int, stage: KanbanStages, session: Session):
    """Return the updated_at of the most recent KanbanUpdate that moved this proposal TO stage."""
    updates = session.exec(
        select(KanbanUpdate).where(
            KanbanUpdate.proposal_id == proposal_id,
            KanbanUpdate.to_stage == stage,
        )
    ).all()
    if not updates:
        return None
    return _latest_update(updates).updated_at


def get_current_proposal_status(proposal: CallingProposal, session: Session) -> KanbanStages:
    """Return the current kanban stage of a calling proposal.

    The current stage is the `to_stage` of the most recent KanbanUpdate row,
    ordered by (updated_at, id). Using timestamp + id rather than the numeric
    stage value means backward-movement updates are correctly reflected — a
    revert creates a new row with a lower stage value but a later timestamp.
    """
    updates = session.exec(
        select(KanbanUpdate).where(KanbanUpdate.proposal_id == proposal.id)
    ).all()
    if not updates:
        raise HTTPException(status_code=404, detail="No kanban updates found for proposal")
    return _latest_update(updates).to_stage


def ensure_interview_row(proposal_id: int, session: Session, *, reset: bool = False) -> None:
    """Ensure a CallingInterview row exists for the proposal.

    If reset=True, clears interviewer_id and interview_date so a new interview
    can be scheduled. Does not commit — caller is responsible for committing.
    """
    interview = session.exec(
        select(CallingInterview).where(CallingInterview.proposal_id == proposal_id)
    ).first()
    if interview:
        if reset:
            interview.interviewer_id = None
            interview.interview_date = None
            session.add(interview)
    else:
        session.add(CallingInterview(proposal_id=proposal_id, interviewer_id=None))

def create_kanban_update(proposal_id: int, updater_id: int, from_stage: KanbanStages, to_stage: KanbanStages, session: Session, discord_bot: DiscordBotHandle) -> KanbanUpdate:
    """
    Create and persist a new KanbanUpdate record for a proposal stage change.
    
    This helper function creates a new KanbanUpdate entry in the database to track
    when a calling proposal moves from one stage to another in the kanban workflow.
    It automatically sets the current timestamp and commits the change to the database.
    
    Args:
        proposal_id (int): The ID of the calling proposal being updated.
        updater_id (int): The ID of the user performing the update.
        from_stage (KanbanStages): The stage the proposal is moving from.
        to_stage (KanbanStages): The stage the proposal is moving to.
        session (Session): The database session to use for the operation.
        
    Returns:
        KanbanUpdate: The newly created and committed KanbanUpdate object,
        refreshed from the database with any auto-generated fields.
        
    Note:
        This function commits the transaction immediately. The updated_at timestamp
        is automatically set to the current UTC time when the object is created.
    """
    logger.debug(f"Creating KanbanUpdate for proposal {proposal_id}, from {from_stage} to {to_stage} by user {updater_id}")
    update = KanbanUpdate(
        proposal_id=proposal_id,
        updater_id=updater_id,
        from_stage=from_stage,
        to_stage=to_stage
    )
    session.add(update)
    session.commit()
    session.refresh(update)

    ward = session.get(Ward, update.proposal.ward_id) if update.proposal and update.proposal.ward_id else None

    discord_bot.submit_kanban_update(
        update,
        ward=ward.name if ward else "(unknown)",
    )
    if to_stage == KanbanStages.HC_APPROVAL:
        logger.info(f"Submitting approval request for proposal ID {proposal_id} to high council via discord")
        hc = get_high_councilors(session)
        for u in hc:
            discord_bot.request_kanban_approval(
                proposal_id=proposal_id,
                approver_email=u.email,
                person=update.proposal.fname + " " + update.proposal.lname,
                calling=update.proposal.proposed_calling,
                ward=ward.name if ward else "(unknown)",
                details_url=f"{os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')}/calling-proposals/{proposal_id}"
            )
    elif to_stage == KanbanStages.SP_APPROVAL:
        logger.info(f"Submitting approval request for proposal ID {proposal_id} to stake presidency via discord")
        sp = get_stake_presidency(session)
        for u in sp:
            discord_bot.request_kanban_approval(
                proposal_id=proposal_id,
                approver_email=u.email,
                person=update.proposal.fname + " " + update.proposal.lname,
                calling=update.proposal.proposed_calling,
                ward=ward.name if ward else "(unknown)",
                details_url=f"{os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')}/calling-proposals/{proposal_id}"
            )
    return update
def update_proposal_status(proposal:CallingProposal, session: Session, discord_bot: DiscordBotHandle) -> List[KanbanUpdate]:
    """
    Automatically advance a calling proposal through the kanban workflow based on business rules.
    
    This function implements the automated progression logic for calling proposals. It checks
    the current status and determines if the proposal can move to the next stage based on
    approvals, interviews, and other criteria. The function handles the following transitions:
    
    - SP_APPROVAL → HC_APPROVAL: When stake presidency approvals meet the threshold
    - HC_APPROVAL → INTERVIEW: When high council approvals meet the threshold
    - INTERVIEW → SUSTAIN: When the interview is completed (interviewer assigned and date passed)
    
    Later stages (SUSTAIN, SET_APART, LCR_UPDATE, DONE) are manually set by users and
    not handled by this automated logic.
    
    Args:
        proposal (CallingProposal): The calling proposal to potentially advance.
        session (Session): The database session to use for queries and updates.
        
    Returns:
        List[KanbanUpdate]: A list of KanbanUpdate objects created during the advancement
        process. Empty list if no advancement occurred.
        
    Note:
        - Approval thresholds are configurable via environment variables:
          SP_APPROVAL_THRESHOLD (default: 2), HC_APPROVAL_THRESHOLD (default: 3)
        - All approvals in the current stage must be positive for advancement
        - The updater_id for automatic updates is set to the most recent approver
        - For INTERVIEW stage, a CallingInterview record is created when advancing from HC_APPROVAL
        - This function commits changes to the database for each stage advancement
        
    Side Effects:
        - Creates and commits KanbanUpdate records
        - May create CallingInterview records
        - Modifies the proposal's effective status through updates
    """
    kanban_updates = session.exec(
        select(KanbanUpdate).where(KanbanUpdate.proposal_id == proposal.id)
    ).all()
    if not kanban_updates:
        return []
    status = _latest_update(kanban_updates).to_stage
    updates = []
    all_approvals = session.exec(
        select(CallingApproval).where(CallingApproval.proposal_id == proposal.id)
    ).all()

    if status == KanbanStages.SP_APPROVAL:
        sp_entries = [u for u in kanban_updates if u.to_stage == KanbanStages.SP_APPROVAL]
        stage_entry_time = _latest_update(sp_entries).updated_at if sp_entries else None
        logger.debug(f"Checking SP approvals for proposal {proposal.id} since {stage_entry_time}")
        sp_approvals = [
            a for a in all_approvals
            if a.approver_user
            and is_stake_presidency(a.approver_user)
            and (stage_entry_time is None or a.created_at >= stage_entry_time)
        ]
        logger.debug(f"Found {len(sp_approvals)} SP approvals for proposal {proposal.id}")
        if len(sp_approvals) >= int(os.getenv("SP_APPROVAL_THRESHOLD", "2")) and all(a.approved for a in sp_approvals):
            logger.debug(f"Found enough SP approvals for proposal {proposal.id}")
            sorted_approvals = sorted(sp_approvals, key=lambda a: a.created_at, reverse=True)
            latest_approver_id = sorted_approvals[0].approver_id
            update = create_kanban_update(
                proposal_id=proposal.id,
                updater_id=latest_approver_id,
                from_stage=status,
                to_stage=KanbanStages.HC_APPROVAL,
                session=session,
                discord_bot=discord_bot
            )
            updates.append(update)
            kanban_updates = list(kanban_updates) + [update]
            status = KanbanStages.HC_APPROVAL

    if status == KanbanStages.HC_APPROVAL:
        hc_entries = [u for u in kanban_updates if u.to_stage == KanbanStages.HC_APPROVAL]
        stage_entry_time = _latest_update(hc_entries).updated_at if hc_entries else None
        hc_approvals = [
            a for a in all_approvals
            if a.approver_user
            and is_high_councilor(a.approver_user)
            and (stage_entry_time is None or a.created_at >= stage_entry_time)
        ]
        if len(hc_approvals) >= int(os.getenv("HC_APPROVAL_THRESHOLD", "3")) and all(a.approved for a in hc_approvals):
            sorted_approvals = sorted(hc_approvals, key=lambda a: a.created_at, reverse=True)
            latest_approver_id = sorted_approvals[0].approver_id
            ensure_interview_row(proposal.id, session)
            update = create_kanban_update(
                proposal_id=proposal.id,
                updater_id=latest_approver_id,
                from_stage=status,
                to_stage=KanbanStages.INTERVIEW,
                session=session,
                discord_bot=discord_bot
            )
            updates.append(update)
            status = KanbanStages.INTERVIEW

    if status == KanbanStages.INTERVIEW:
        # Check to see if the interview has been completed
        statement = select(CallingInterview).where(
            CallingInterview.proposal_id == proposal.id
        )
        interview = session.exec(statement).first()
        if (
            interview and 
            interview.interviewer_id and 
            interview.interview_date < datetime.now(timezone.utc)
            ):
            update = create_kanban_update(
                proposal_id=proposal.id,
                updater_id=interview.interviewer_id,
                from_stage=status,
                to_stage=KanbanStages.SUSTAIN,
                session=session,
                discord_bot=discord_bot
            )
            updates.append(update)
            status = KanbanStages.SUSTAIN
    
    # The remainder of stages:
    # SUSTAIN, SET_APART, LCR_UPDATE, DONE
    # Will be manully set by users, and are not calculated by business logic

    return updates