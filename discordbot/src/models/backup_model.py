from pydantic import BaseModel


class BackupRequest(BaseModel):
    """Request body for posting a markdown backup as a PDF to Discord."""
    markdown: str
    filename: str | None = None
