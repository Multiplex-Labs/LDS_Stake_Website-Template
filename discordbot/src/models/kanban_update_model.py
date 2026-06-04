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

class KanbanApprovalRequest(BaseModel):
    """
    A request body for a request for approval of a Kanban update.
    """
    proposal_id: int
    approver_email: str
    person: str
    calling: str
    ward: str
    url: str