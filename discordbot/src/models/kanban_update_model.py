from pydantic import BaseModel

class KanbanUpdateRequest(BaseModel):
    """
    A request body for updating the Kanban board.
    """
    id: int
    person: str
    calling: str
    ward: str
    updater: str
    from_stage: str | None
    to_stage: str
    updated_at: str