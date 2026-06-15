from logging import getLogger

from fastapi import APIRouter, Request

from ..models import BackupRequest

logger = getLogger("application")


router = APIRouter(prefix="/backups", tags=["backups"])


@router.post("/")
def post_backup(request_body: BackupRequest, request: Request):
    """Receive markdown and post a PDF to the `backups` channel via the bot hook."""
    logger.info("Received backup request, filename: %s", request_body.filename)
    # Schedule the backup send on the bot loop and return immediately
    filename = request_body.filename or "backup.pdf"
    request.app.state.bot.backups_hook.send_backup(request_body.markdown, filename)
    return {"message": "Backup created"}
