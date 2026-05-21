from logging import getLogger

from fastapi import APIRouter

logger = getLogger("application")


router = APIRouter(prefix="/hello", tags=["hello"])

@router.get("/")
def say_hello():
    """A simple endpoint to test that the API is working."""
    logger.info("Hello endpoint was called")
    return {"message": "Hello, world!"}