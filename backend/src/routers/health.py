from fastapi import APIRouter
from logging import getLogger

router = APIRouter()

logger = getLogger("application")

@router.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint."""
    logger.debug("Health check requested")
    return {"status": "ok"}
