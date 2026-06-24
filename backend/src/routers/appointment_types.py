from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Field, SQLModel, Session, select, func

from ..models import Permission, AppointmentType, Booking, BookingStatus
from ..db import get_session
from ..utils import CallingUser, CURATED_ICONS

router = APIRouter(prefix="/appointment-types", tags=["appointment-types"])


class AppointmentTypeCreate(SQLModel):
    name: str
    description: str = ""
    duration_mins: int = Field(default=30, ge=1)
    details: str = ""
    icon_name: str = "Calendar"
    is_active: bool = True


class AppointmentTypeUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration_mins: Optional[int] = Field(default=None, ge=1)
    details: Optional[str] = None
    icon_name: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class ReorderItem(SQLModel):
    id: int
    display_order: int


class AppointmentTypePatchResponse(SQLModel):
    type: AppointmentType
    warnings: List[str]


@router.get("/")
def list_appointment_types(
    session: Session = Depends(get_session),
) -> List[AppointmentType]:
    """Return all active appointment types ordered by display_order. Public endpoint."""
    return list(
        session.exec(
            select(AppointmentType)
            .where(AppointmentType.is_active == True)
            .order_by(AppointmentType.display_order)
        ).all()
    )


@router.post("/")
def create_appointment_type(
    body: AppointmentTypeCreate,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> AppointmentType:
    """Create a new appointment type. Requires MANAGE_APPOINTMENTS."""
    if body.icon_name not in CURATED_ICONS:
        raise HTTPException(
            status_code=422,
            detail=f"icon_name must be one of the curated icons: {sorted(CURATED_ICONS)}",
        )

    existing = session.exec(
        select(AppointmentType).where(AppointmentType.name == body.name)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="An appointment type with that name already exists.")

    max_order_result = session.exec(
        select(func.max(AppointmentType.display_order))
    ).one()
    next_order = (max_order_result or 0) + 1

    appt_type = AppointmentType(
        name=body.name,
        description=body.description,
        duration_mins=body.duration_mins,
        details=body.details,
        icon_name=body.icon_name,
        is_active=body.is_active,
        display_order=next_order,
        system_defined=False,
    )
    session.add(appt_type)
    session.commit()
    session.refresh(appt_type)
    return appt_type


@router.patch("/{type_id}")
def update_appointment_type(
    type_id: int,
    body: AppointmentTypeUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> AppointmentTypePatchResponse:
    """Update an appointment type. Returns warnings if duration changed with future bookings."""
    appt_type = session.get(AppointmentType, type_id)
    if not appt_type:
        raise HTTPException(status_code=404, detail="Appointment type not found")

    update_data = body.model_dump(exclude_none=True)
    warnings: List[str] = []

    if "icon_name" in update_data and update_data["icon_name"] not in CURATED_ICONS:
        raise HTTPException(
            status_code=422,
            detail=f"icon_name must be one of the curated icons: {sorted(CURATED_ICONS)}",
        )

    if "name" in update_data and update_data["name"] != appt_type.name:
        existing = session.exec(
            select(AppointmentType)
            .where(AppointmentType.name == update_data["name"])
            .where(AppointmentType.id != type_id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="An appointment type with that name already exists.")

    if "duration_mins" in update_data and update_data["duration_mins"] != appt_type.duration_mins:
        now = datetime.utcnow()
        future_confirmed = session.exec(
            select(Booking).where(
                Booking.appointment_type_id == type_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.start_datetime > now,
            )
        ).first()
        if future_confirmed:
            warnings.append(
                "Duration changed but there are future CONFIRMED bookings for this type. "
                "Those bookings retain their original time slots."
            )

    for key, value in update_data.items():
        setattr(appt_type, key, value)

    session.add(appt_type)
    session.commit()
    session.refresh(appt_type)
    return AppointmentTypePatchResponse(type=appt_type, warnings=warnings)


@router.delete("/{type_id}", status_code=204)
def delete_appointment_type(
    type_id: int,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> None:
    """Delete an appointment type. Returns 409 if system_defined=True."""
    appt_type = session.get(AppointmentType, type_id)
    if not appt_type:
        raise HTTPException(status_code=404, detail="Appointment type not found")
    if appt_type.system_defined:
        raise HTTPException(status_code=409, detail="System-defined appointment types cannot be deleted.")
    session.delete(appt_type)
    session.commit()


@router.post("/reorder", status_code=200)
def reorder_appointment_types(
    body: List[ReorderItem],
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> List[AppointmentType]:
    """Bulk update display_order values. Requires MANAGE_APPOINTMENTS."""
    updated = []
    for item in body:
        appt_type = session.get(AppointmentType, item.id)
        if not appt_type:
            raise HTTPException(status_code=404, detail=f"Appointment type {item.id} not found")
        appt_type.display_order = item.display_order
        session.add(appt_type)
        updated.append(appt_type)
    session.commit()
    for appt_type in updated:
        session.refresh(appt_type)
    return updated
