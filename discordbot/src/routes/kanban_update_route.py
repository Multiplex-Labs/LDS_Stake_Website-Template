from logging import getLogger

from fastapi import APIRouter, Request

from ..models import KanbanUpdateRequest, KanbanApprovalRequest

logger = getLogger("application")


router = APIRouter(prefix="/kanban", tags=["kanban"])


@router.post("/")
def submit_update(update: KanbanUpdateRequest, request: Request):
    """
    Submit an update for the Kanban board.
    """
    logger.info("Received Kanban update id: %s", update.id)
    # Send message to Kanban update channel
    request.app.state.bot.kanban_hook.send_kanban_update(update)
    return {"message": "Kanban updated successfully!"}

@router.post("/request-approval/")
async def request_approval(approval_request: KanbanApprovalRequest, request: Request):
    """
    Submit a request for approval of a Kanban update.
    """
    logger.info("Received Kanban approval request for proposal id: %s", approval_request.proposal_id)
    # Send approval request to approver
    await request.app.state.bot.kanban_hook.send_approval_request(approval_request)
    return {"message": "Kanban update approval requested successfully!"}