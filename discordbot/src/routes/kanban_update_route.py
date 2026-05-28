from logging import getLogger

from fastapi import APIRouter, Request

from ..models import KanbanUpdateRequest

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