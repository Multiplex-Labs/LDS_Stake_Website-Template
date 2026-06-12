
from logging import getLogger
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, delete, select
from ..utils import CallingUser, get_or_make_user_calling, HC_CALLING_NAME, build_permissions_response, get_user_effective_permissions
from ..db import get_session
from ..models import Calling, Permission, BaseModel, UserCalling, Permissions, PermissionsResponse, PermissionsUpdateRequest, User, ResponseSafeUser, Assignment

logger = getLogger("application")

router = APIRouter(prefix="/callings", tags=["callings"])

@router.get("/")
def get_callings(
    current_user = Depends(CallingUser(
        allow_anonymous=True
    )),
    session: Session = Depends(get_session)
):
    """
    Endpoint to get all callings.
    Supports query parameters for filtering and pagination.

    Authenticated users can see all callings,
    while anonymous users can only see callings that are marked as public.
    """
    if current_user is None:
        statement = select(Calling).where(Calling.is_public == True)
    else:
        statement = select(Calling)

    callings = session.exec(statement).all()

    return callings
    
    

@router.post("/")
def create_calling(
    data: Calling,
    _ = Depends(CallingUser(permissions=[Permission.MANAGE_CALLINGS])),
    session: Session = Depends(get_session)
):
    """
    Endpoint to create a new calling.
    Expects a JSON body with the calling details.
    The calling name must be unique.
    """
    # Check for unique name
    existing_calling = session.exec(
        select(Calling).where(Calling.name == data.name)
    ).first()
    if existing_calling:
        raise HTTPException(status_code=400, detail="A calling with this name already exists.")
    
    new_calling = Calling(
        name=data.name,
        max_slots=data.max_slots,
        is_public=data.is_public,
        system_defined=False
    )
    session.add(new_calling)
    session.commit()
    session.refresh(new_calling)

    return new_calling
    

@router.get("/{calling_id}")
def get_calling(
    calling_id: int,
    session: Session = Depends(get_session),
    current_user = Depends(CallingUser(allow_anonymous=True))
    ):
    """
    Endpoint to get a specific calling by its ID.
    Authenticated users can access all callings,
    while anonymous users can only access callings that are marked as public.
    """
    calling = session.get(Calling, calling_id)
    if calling is None or (not calling.is_public and current_user is None):
        raise HTTPException(status_code=404, detail="Calling not found")
    return calling
    

@router.put("/{calling_id}")
def update_calling(
    calling_id: int,
    data: Calling,
    _ = Depends(CallingUser(permissions=[Permission.MANAGE_CALLINGS])),
    session: Session = Depends(get_session)
    ):
    """
    Endpoint to update an existing calling.
    Expects a JSON body with the updated calling details.
    System-defined callings cannot be modified.
    The calling name must be unique if it's being updated.
    """
    calling = session.get(Calling, calling_id)
    if calling is None:
        raise HTTPException(status_code=404, detail="Calling not found")
    if calling.system_defined:
        raise HTTPException(status_code=403, detail="System-defined callings cannot be modified.")
    # Check for unique name if it's being updated
    if data.name != calling.name:
        existing_calling = session.exec(
            select(Calling).where(Calling.name == data.name)
        ).first()
        if existing_calling:
            raise HTTPException(status_code=400, detail="A calling with this name already exists.")
    
    # Update fields
    calling.name = data.name
    calling.max_slots = data.max_slots
    calling.is_public = data.is_public

    session.add(calling)
    session.commit()
    session.refresh(calling)
    return calling

@router.delete("/{calling_id}")
def delete_calling(
    calling_id: int,
    _ = Depends(CallingUser(permissions=[Permission.MANAGE_CALLINGS])),
    session: Session = Depends(get_session)
    ):
    """
    Endpoint to delete a calling by its ID.
    System-defined callings cannot be deleted.
    """
    calling = session.get(Calling, calling_id)
    if calling and calling.system_defined:
        raise HTTPException(status_code=403, detail="System-defined callings cannot be deleted.")
    elif calling:
        # Cascade delete permissions
        session.exec(
            delete(Permissions).where(
            Permissions.foreign_id == str(calling.id),
            Permissions.is_calling == True
            )
        )
        session.delete(calling)
        session.commit()
    return None

@router.get("/{calling_id}/permissions")
def get_calling_permissions(
    calling_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(CallingUser(permissions=[Permission.MANAGE_CALLINGS]))
) -> PermissionsResponse:
    row = session.exec(
        select(Permissions).where(
            Permissions.foreign_id == str(calling_id),
            Permissions.is_calling == True
        )
    ).first()

    if row is None:
        return PermissionsResponse(scopes=0, flags=[])

    return build_permissions_response(row.scopes)

@router.put("/{calling_id}/permissions")
def update_calling_permissions(
    calling_id: int,
    data: PermissionsUpdateRequest,
    session: Session = Depends(get_session),
    calling_user: User = Depends(CallingUser(permissions=[Permission.MANAGE_CALLINGS]))
) -> PermissionsResponse:
    calling = session.get(Calling, calling_id)
    if not calling:
        raise HTTPException(status_code=404, detail="Calling not found.")

    clean_scopes = data.scopes & get_user_effective_permissions(calling_user, session)

    row = session.exec(
        select(Permissions).where(
            Permissions.foreign_id == str(calling_id),
            Permissions.is_calling == True
        )
    ).first()

    if row is None:
        row = Permissions(
            foreign_id=str(calling_id),
            is_calling=True,
            scopes=clean_scopes
        )
    else:
        row.scopes = clean_scopes

    session.add(row)
    session.commit()
    session.refresh(row)

    return build_permissions_response(row.scopes)

@router.get("/{calling_id}/{slot_id}")
def get_calling_slot(
    calling_id: int,
    slot_id: int,
    session: Session = Depends(get_session),
    current_user = Depends(CallingUser(allow_anonymous=True))
    ):
    """
    Endpoint to get the user assigned to a specific calling slot.
    Authenticated users can access all slots,
    while anonymous users can only access slots for callings that are marked as public.
    """
    return get_or_make_user_calling(calling_id, slot_id, session, current_user)

class CallingAssignmentRequest(BaseModel):
    user_id: int
@router.put("/{calling_id}/{slot_id}")
def assign_calling_slot(
    calling_id: int,
    slot_id: int,
    data: CallingAssignmentRequest,
    _ = Depends(CallingUser(permissions=[Permission.MANAGE_CALLINGS])),
    session: Session = Depends(get_session)
    ):
    """
    Endpoint to assign a specific slot to a calling.
    Expects a JSON body with the user ID to assign to the slot.
    Cannot assign a slot that is already filled.
    """
    calling = session.get(Calling, calling_id)
    if calling is None:
        raise HTTPException(status_code=404, detail="Calling not found")
    if slot_id < 1 or slot_id > calling.max_slots:
        raise HTTPException(status_code=400, detail="Slot ID is out of range for this calling.")
    # Enforce one calling per user, but allow re-slotting within the same calling
    user_calling_conflict = session.exec(
        select(UserCalling).where(
            UserCalling.user_id == data.user_id,
            UserCalling.calling_id != calling_id,
        )
    ).first()
    if user_calling_conflict:
        raise HTTPException(status_code=409, detail="This user is already assigned to a calling.")
    # Check if slot is already filled
    existing_assignment = session.exec(
        select(UserCalling).where(UserCalling.calling_id == calling_id, UserCalling.slot_number == slot_id)
        ).first()
    if existing_assignment and existing_assignment.user_id is not None:
        raise HTTPException(status_code=400, detail="This slot is already filled.")
    elif existing_assignment is None:
        # Create new assignment if it doesn't exist
        existing_assignment = UserCalling(
            calling_id=calling_id,
            slot_number=slot_id,
            user_id=data.user_id
        )
    else:
        existing_assignment.user_id = data.user_id
    session.add(existing_assignment)
    # For HC slots, ensure an Assignment row exists so the assignments page picks it up.
    # Flush first to materialise existing_assignment.id before the Assignment FK references it.
    if calling.name == HC_CALLING_NAME:
        session.flush()
        has_assignment = session.exec(
            select(Assignment).where(Assignment.high_councilor_id == existing_assignment.id)
        ).first()
        if has_assignment is None:
            session.add(Assignment(high_councilor_id=existing_assignment.id))
    session.commit()
    session.refresh(existing_assignment)
    return existing_assignment

@router.delete("/{calling_id}/{slot_id}")
def unassign_calling_slot(
    calling_id: int,
    slot_id: int,
    _ = Depends(CallingUser(permissions=[Permission.MANAGE_CALLINGS])),
    session: Session = Depends(get_session)
    ):
    """
    Endpoint to unassign a specific slot from a calling.
    """
    calling = session.get(Calling, calling_id)
    if calling is None:
        raise HTTPException(status_code=404, detail="Calling not found")
    if slot_id < 1 or slot_id > calling.max_slots:
        raise HTTPException(status_code=400, detail="Slot ID is out of range for this calling.")
    existing_assignment = session.exec(
        select(UserCalling).where(UserCalling.calling_id == calling_id, UserCalling.slot_number == slot_id)
        ).first()
    if existing_assignment:
        existing_assignment.user_id = None
        session.add(existing_assignment)
        session.commit()
        session.refresh(existing_assignment)
    return None
