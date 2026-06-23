from sqlmodel import Field, Relationship
from typing import List
from enum import IntEnum, auto
from datetime import datetime, timezone
from .base import BaseModel

class KanbanStages(IntEnum):
    SP_APPROVAL = 0
    HC_APPROVAL = auto()
    INTERVIEW = auto()
    SUSTAIN = auto()
    SET_APART = auto()
    LCR_UPDATE = auto()
    DONE = auto()


class KanbanUpdate(BaseModel, table=True):
    id: int = Field(default=None, primary_key=True)
    proposal_id: int = Field(foreign_key="callingproposal.id", index=True)
    updater_id: int = Field(foreign_key="user.id", index=True)
    from_stage: KanbanStages | None = Field(default=None, nullable=True)
    to_stage: KanbanStages
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    proposal: "CallingProposal" = Relationship(back_populates="updates")  # type: ignore
    updater_user: "User" = Relationship(back_populates="kanban_updates")  # type: ignore

class CallingProposal(BaseModel, table=True):
    id: int = Field(default=None, primary_key=True)
    fname: str
    lname: str
    spouse_name: str
    proposed_calling: str
    ward_id: int
    submitter: int = Field(foreign_key="user.id", index=True)
    is_release: bool = Field(default=False)
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    submitter_user: "User" = Relationship(back_populates="proposals_submitted")  # type: ignore
    updates: List["KanbanUpdate"] = Relationship(back_populates="proposal")  # type: ignore
    comments: List["CallingComment"] = Relationship(back_populates="proposal")  # type: ignore
    approvals: List["CallingApproval"] = Relationship(back_populates="proposal")  # type: ignore
    interviews: List["CallingInterview"] = Relationship(back_populates="proposal")  # type: ignore
    
class CallingComment(BaseModel, table=True):
    id: int = Field(default=None, primary_key=True)
    proposal_id: int = Field(foreign_key="callingproposal.id", index=True)
    commenter_id: int = Field(foreign_key="user.id", index=True)
    comment_text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    edited_at: datetime = Field(default=None, nullable=True)

    # Relationships
    proposal: "CallingProposal" = Relationship(back_populates="comments")  # type: ignore
    commenter_user: "User" = Relationship(back_populates="comments_made")  # type: ignore

class CallingApproval(BaseModel, table=True):
    id: int = Field(default=None, primary_key=True)
    proposal_id: int = Field(foreign_key="callingproposal.id", index=True)
    approver_id: int = Field(foreign_key="user.id", index=True)
    approved: bool
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Relationships
    proposal: "CallingProposal" = Relationship(back_populates="approvals")  # type: ignore
    approver_user: "User" = Relationship(back_populates="approvals_made")  # type: ignore

class CallingInterview(BaseModel, table=True):
    id: int = Field(default=None, primary_key=True)
    proposal_id: int = Field(foreign_key="callingproposal.id", index=True)
    interviewer_id: int = Field(foreign_key="user.id", index=True, nullable=True)
    interview_date: datetime = Field(default=None, nullable=True)

    # Relationships
    proposal: "CallingProposal" = Relationship(back_populates="interviews")  # type: ignore
    interviewer_user: "User" = Relationship(back_populates="interviews_conducted")  # type: ignore