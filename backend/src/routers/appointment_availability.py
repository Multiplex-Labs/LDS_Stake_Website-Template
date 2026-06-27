import calendar as _cal
import json
import os
from datetime import datetime, date as _date, timedelta
from logging import getLogger
from typing import List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import model_validator
from sqlmodel import Field, SQLModel, Session, select

from ..models import (
    Permission,
    TempleRecommendConfig,
    AppointmentType,
    AvailabilityWindow,
    AvailabilityException,
    Booking,
    BookingStatus,
    Permissions,
    UserCalling,
    User,
)
from ..db import get_session
from ..utils import CallingUser

logger = getLogger(__name__)

router = APIRouter(prefix="/appointment-availability", tags=["appointment-availability"])

# TODO: Add slowapi rate limiting on public endpoints when middleware is set up.


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_interviewer_user_ids(session: Session) -> set:
    """Return user IDs of all active users assigned to callings with MANAGE_APPOINTMENTS (512)."""
    perm_rows = session.exec(
        select(Permissions).where(Permissions.is_calling == True)
    ).all()
    calling_ids = [
        int(p.foreign_id)
        for p in perm_rows
        if p.scopes & int(Permission.MANAGE_APPOINTMENTS)
    ]
    interviewer_user_ids: set = set()
    for cid in calling_ids:
        ucs = session.exec(
            select(UserCalling).where(
                UserCalling.calling_id == cid,
                UserCalling.user_id.is_not(None),
            )
        ).all()
        for uc in ucs:
            interviewer_user_ids.add(uc.user_id)
    return interviewer_user_ids


def _matches_freq(d: _date, rule: dict, start: _date) -> bool:
    """Check if d matches the frequency pattern, ignoring end conditions."""
    freq = rule.get("freq", "weekly")
    interval = max(1, int(rule.get("interval", 1)))

    if freq == "daily":
        delta = (d - start).days
        return delta >= 0 and delta % interval == 0

    if freq == "weekly":
        days = rule.get("days") or []
        if d.weekday() not in days:
            return False
        return ((d - start).days // 7) % interval == 0

    if freq == "monthly":
        month_delta = (d.year - start.year) * 12 + (d.month - start.month)
        if month_delta < 0 or month_delta % interval != 0:
            return False
        if rule.get("month_by") == "day":
            return d.day == int(rule.get("month_day", start.day))
        # Default: by weekday
        mw = rule.get("month_weekday") or {"n": 1, "day": 6}
        n, day = int(mw.get("n", 1)), int(mw.get("day", 6))
        if d.weekday() != day:
            return False
        if n == -1:
            last = _cal.monthrange(d.year, d.month)[1]
            test = _date(d.year, d.month, last)
            while test.weekday() != day:
                test = _date(d.year, d.month, test.day - 1)
            return d == test
        return (n - 1) * 7 < d.day <= n * 7

    if freq == "yearly":
        year_delta = d.year - start.year
        return year_delta >= 0 and year_delta % interval == 0 and d.month == start.month and d.day == start.day

    return False


def _matches_recurrence(d: _date, rule_str: str, start: Optional[_date] = None) -> bool:
    """Return True if date d matches the given recurrence rule."""
    if rule_str == "first_sunday_monthly":
        return d.weekday() == 6 and d.day <= 7

    try:
        rule = json.loads(rule_str)
    except (json.JSONDecodeError, ValueError):
        return False

    anchor = start or d
    if d < anchor:
        return False

    end_type = rule.get("end_type", "never")
    if end_type == "on":
        end_str = rule.get("end_date")
        if end_str and d > _date.fromisoformat(end_str):
            return False
    elif end_type == "after":
        end_count = int(rule.get("end_count", 0))
        count = 0
        cur = anchor
        MAX_ITER = 3650
        iterations = 0
        while cur <= d:
            if iterations > MAX_ITER:
                logger.error(
                    "_matches_recurrence: exceeded max iterations for rule %r", rule_str
                )
                return False
            if _matches_freq(cur, rule, anchor):
                count += 1
            cur += timedelta(days=1)
            iterations += 1
        if count > end_count:
            return False

    return _matches_freq(d, rule, anchor)


def _generate_slots(
    session: Session,
    appointment_type_id: int,
    date_from: _date,
    date_to: _date,
) -> List[dict]:
    """Core slot generation algorithm."""
    config = session.get(TempleRecommendConfig, 1)
    if not config:
        return []

    try:
        tz = ZoneInfo(config.timezone)
    except ZoneInfoNotFoundError:
        logger.error(
            "_generate_slots: invalid timezone %r in TempleRecommendConfig", config.timezone
        )
        return []

    now_utc = datetime.now(tz=ZoneInfo("UTC"))
    appt_type = session.get(AppointmentType, appointment_type_id)
    if not appt_type or not appt_type.is_active:
        return []

    duration = appt_type.duration_mins
    buffer = config.slot_buffer_mins
    cutoff_dt = now_utc + timedelta(hours=config.booking_cutoff_hours)

    interviewer_user_ids = _get_interviewer_user_ids(session)
    if not interviewer_user_ids:
        return []

    recurring_global_excs = session.exec(
        select(AvailabilityException).where(
            AvailabilityException.is_global == True,
            AvailabilityException.recurrence != None,
        )
    ).all()

    slots: List[dict] = []
    current_date = date_from

    while current_date <= date_to:
        dow = current_date.weekday()  # 0=Mon, 6=Sun

        # Skip if a global exception covers this date (one-time or recurring)
        global_exc = session.exec(
            select(AvailabilityException).where(
                AvailabilityException.date == current_date,
                AvailabilityException.is_global == True,
                AvailabilityException.recurrence == None,
            )
        ).first()
        if not global_exc:
            global_exc = next(
                (e for e in recurring_global_excs if _matches_recurrence(current_date, e.recurrence, e.date)),
                None,
            )
        if global_exc:
            current_date += timedelta(days=1)
            continue

        # Personal exceptions for this date
        personal_excs = session.exec(
            select(AvailabilityException).where(
                AvailabilityException.date == current_date,
                AvailabilityException.is_global == False,
            )
        ).all()
        personal_exc_user_ids = {
            pe.user_id for pe in personal_excs if pe.user_id in interviewer_user_ids
        }

        for user_id in interviewer_user_ids:
            if user_id in personal_exc_user_ids:
                continue

            windows = session.exec(
                select(AvailabilityWindow).where(
                    AvailabilityWindow.user_id == user_id,
                    AvailabilityWindow.day_of_week == dow,
                    AvailabilityWindow.is_active == True,
                )
            ).all()

            # Filter by valid_from / valid_until
            windows = [
                w for w in windows
                if (w.valid_from is None or w.valid_from <= current_date)
                and (w.valid_until is None or w.valid_until >= current_date)
            ]
            if not windows:
                continue

            # Existing bookings for this interviewer on this date (active statuses)
            existing_bookings = session.exec(
                select(Booking).where(
                    Booking.interviewer_user_id == user_id,
                    Booking.booking_date == current_date,
                    Booking.status.in_([
                        BookingStatus.PENDING_EMAIL_CONFIRM,
                        BookingStatus.CONFIRMED,
                    ]),
                )
            ).all()
            booked_intervals = [
                (b.start_minute_of_day, b.end_minute_of_day + buffer)
                for b in existing_bookings
            ]

            user = session.get(User, user_id)

            for window in windows:
                try:
                    minute = window.start_minute
                    while minute + duration <= window.end_minute:
                        slot_end = minute + duration
                        conflict = any(
                            not (slot_end <= bs or minute >= be)
                            for bs, be in booked_intervals
                        )
                        if not conflict:
                            local_dt = datetime(
                                current_date.year,
                                current_date.month,
                                current_date.day,
                                minute // 60,
                                minute % 60,
                                tzinfo=tz,
                            )
                            utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
                            if utc_dt >= cutoff_dt:
                                slots.append({
                                    "slot_datetime_utc": utc_dt.isoformat(),
                                    "interviewer_user_id": user_id,
                                    "interviewer_name": (
                                        f"{user.fname} {user.lname}" if user else "Unknown"
                                    ),
                                })
                        minute += duration + buffer
                except Exception:
                    logger.error(
                        "_generate_slots: error processing window %d for user %d",
                        window.id,
                        user_id,
                        exc_info=True,
                    )
                    continue

        current_date += timedelta(days=1)

    return sorted(slots, key=lambda s: s["slot_datetime_utc"])


# ---------------------------------------------------------------------------
# Pydantic models for request bodies
# ---------------------------------------------------------------------------

class AvailabilityWindowCreate(SQLModel):
    user_id: int
    day_of_week: int = Field(ge=0, le=6)
    start_minute: int = Field(ge=0, lt=1440)
    end_minute: int = Field(ge=0, lt=1440)
    valid_from: Optional[_date] = None
    valid_until: Optional[_date] = None
    is_active: bool = True

    @model_validator(mode="after")
    def check_minute_range(self) -> "AvailabilityWindowCreate":
        if self.start_minute >= self.end_minute:
            raise ValueError("end_minute must be greater than start_minute")
        return self


class AvailabilityWindowUpdate(SQLModel):
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    start_minute: Optional[int] = Field(default=None, ge=0, lt=1440)
    end_minute: Optional[int] = Field(default=None, ge=0, lt=1440)
    valid_from: Optional[_date] = None
    valid_until: Optional[_date] = None
    is_active: Optional[bool] = None


def _validate_recurrence(rule_str: str) -> bool:
    if rule_str == "first_sunday_monthly":
        return True
    try:
        rule = json.loads(rule_str)
        if rule.get("freq") not in {"daily", "weekly", "monthly", "yearly"}:
            return False
        if rule.get("end_type") == "after" and int(rule.get("end_count", 0)) < 1:
            return False
        return True
    except (json.JSONDecodeError, AttributeError, TypeError, ValueError):
        return False


class AvailabilityExceptionCreate(SQLModel):
    date: Optional[_date] = None
    reason: str
    is_global: bool = False
    user_id: Optional[int] = None
    recurrence: Optional[str] = None


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------

@router.get("/slots")
def get_slots(
    type_id: int = Query(...),
    date_from: _date = Query(...),
    date_to: _date = Query(...),
    session: Session = Depends(get_session),
) -> List[dict]:
    """Return available booking slots for a given appointment type and date range.
    Maximum date range is 7 days. Public endpoint."""
    if (date_to - date_from).days > 7:
        raise HTTPException(status_code=422, detail="date_to - date_from must be 7 days or fewer.")
    if date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before or equal to date_to.")

    config = session.get(TempleRecommendConfig, 1)
    if config:
        max_date = _date.today() + timedelta(days=config.booking_window_days)
        if date_from > max_date:
            raise HTTPException(
                status_code=422,
                detail=f"date_from is beyond the booking window of {config.booking_window_days} days.",
            )

    appt_type = session.get(AppointmentType, type_id)
    if not appt_type:
        raise HTTPException(status_code=404, detail="Appointment type not found")

    return _generate_slots(session, type_id, date_from, date_to)


@router.get("/available-dates")
def get_available_dates(
    type_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    session: Session = Depends(get_session),
) -> dict:
    """Return a set of dates in the given month that have at least one available slot. Public endpoint."""
    import calendar
    _, last_day = calendar.monthrange(year, month)
    month_from = _date(year, month, 1)
    month_to = _date(year, month, last_day)

    # Clamp to today onwards and to booking window
    today = _date.today()
    config = session.get(TempleRecommendConfig, 1)
    max_date = today + timedelta(days=config.booking_window_days if config else 60)

    date_from = max(month_from, today)
    date_to = min(month_to, max_date)

    if date_from > date_to:
        return {"available_dates": []}

    # Generate in weekly chunks to avoid the 7-day limit being a problem here
    available: set = set()
    chunk_start = date_from
    while chunk_start <= date_to:
        chunk_end = min(chunk_start + timedelta(days=6), date_to)
        slots = _generate_slots(session, type_id, chunk_start, chunk_end)
        for slot in slots:
            dt = datetime.fromisoformat(slot["slot_datetime_utc"])
            # Convert to local date
            if config:
                local_dt = dt.astimezone(ZoneInfo(config.timezone))
            else:
                local_dt = dt
            available.add(local_dt.date().isoformat())
        chunk_start = chunk_end + timedelta(days=1)

    return {"available_dates": sorted(available)}


# ---------------------------------------------------------------------------
# Admin: health
# ---------------------------------------------------------------------------

@router.get("/health")
def get_availability_health(
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> List[dict]:
    """Return per-type next available slot info. Requires MANAGE_APPOINTMENTS."""
    config = session.get(TempleRecommendConfig, 1)
    today = _date.today()
    lookahead_days = config.booking_window_days if config else 60
    search_to = today + timedelta(days=lookahead_days)

    appt_types = session.exec(
        select(AppointmentType).where(AppointmentType.is_active == True)
    ).all()

    results = []
    for appt_type in appt_types:
        # Search week by week for the next slot
        next_slot = None
        chunk_start = today
        while chunk_start <= search_to and next_slot is None:
            chunk_end = min(chunk_start + timedelta(days=6), search_to)
            slots = _generate_slots(session, appt_type.id, chunk_start, chunk_end)
            if slots:
                next_slot = slots[0]["slot_datetime_utc"]
            chunk_start = chunk_end + timedelta(days=1)

        days_until = None
        if next_slot:
            next_dt = datetime.fromisoformat(next_slot).date()
            days_until = (next_dt - today).days

        results.append({
            "appointment_type_id": appt_type.id,
            "appointment_type_name": appt_type.name,
            "next_slot_utc": next_slot,
            "days_until_next_slot": days_until,
        })

    return results


# ---------------------------------------------------------------------------
# Admin: availability windows
# ---------------------------------------------------------------------------

@router.get("/windows")
def list_windows(
    user_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> List[AvailabilityWindow]:
    """Return availability windows, optionally filtered by user_id. Requires MANAGE_APPOINTMENTS."""
    stmt = select(AvailabilityWindow)
    if user_id is not None:
        stmt = stmt.where(AvailabilityWindow.user_id == user_id)
    return list(session.exec(stmt).all())


@router.post("/windows")
def create_window(
    body: AvailabilityWindowCreate,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> AvailabilityWindow:
    """Create a new availability window. Requires MANAGE_APPOINTMENTS."""
    window = AvailabilityWindow(
        user_id=body.user_id,
        day_of_week=body.day_of_week,
        start_minute=body.start_minute,
        end_minute=body.end_minute,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        is_active=body.is_active,
    )
    session.add(window)
    session.commit()
    session.refresh(window)
    return window


@router.patch("/windows/{window_id}")
def update_window(
    window_id: int,
    body: AvailabilityWindowUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> AvailabilityWindow:
    """Update an availability window. Requires MANAGE_APPOINTMENTS."""
    window = session.get(AvailabilityWindow, window_id)
    if not window:
        raise HTTPException(status_code=404, detail="Availability window not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(window, key, value)

    if window.end_minute <= window.start_minute:
        raise HTTPException(status_code=422, detail="end_minute must be greater than start_minute.")

    session.add(window)
    session.commit()
    session.refresh(window)
    return window


@router.delete("/windows/{window_id}", status_code=204)
def delete_window(
    window_id: int,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> None:
    """Delete an availability window. Requires MANAGE_APPOINTMENTS."""
    window = session.get(AvailabilityWindow, window_id)
    if not window:
        raise HTTPException(status_code=404, detail="Availability window not found")
    session.delete(window)
    session.commit()


# ---------------------------------------------------------------------------
# Admin: availability exceptions
# ---------------------------------------------------------------------------

@router.get("/exceptions")
def list_exceptions(
    is_global: Optional[bool] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> List[AvailabilityException]:
    """Return availability exceptions. Optionally filtered by is_global or user_id. Requires MANAGE_APPOINTMENTS."""
    stmt = select(AvailabilityException)
    if is_global is not None:
        stmt = stmt.where(AvailabilityException.is_global == is_global)
    if user_id is not None:
        stmt = stmt.where(AvailabilityException.user_id == user_id)
    return list(session.exec(stmt).all())


@router.post("/exceptions")
def create_exception(
    body: AvailabilityExceptionCreate,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> AvailabilityException:
    """Create an availability exception. Requires MANAGE_APPOINTMENTS.
    If is_global=True, user_id must be None. If is_global=False, user_id must be set."""
    if body.is_global and body.user_id is not None:
        raise HTTPException(status_code=422, detail="Global exceptions must not have a user_id.")
    if not body.is_global and body.user_id is None:
        raise HTTPException(status_code=422, detail="Non-global exceptions must have a user_id.")
    if body.recurrence is not None and not _validate_recurrence(body.recurrence):
        raise HTTPException(status_code=422, detail=f"Unsupported recurrence rule: {body.recurrence}")
    if body.recurrence is None and body.date is None:
        raise HTTPException(status_code=422, detail="Either date or recurrence must be provided.")

    exc = AvailabilityException(
        date=body.date,
        reason=body.reason,
        is_global=body.is_global,
        user_id=body.user_id,
        recurrence=body.recurrence,
    )
    session.add(exc)
    session.commit()
    session.refresh(exc)
    return exc


@router.delete("/exceptions/{exception_id}", status_code=204)
def delete_exception(
    exception_id: int,
    session: Session = Depends(get_session),
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> None:
    """Delete an availability exception. Requires MANAGE_APPOINTMENTS."""
    exc = session.get(AvailabilityException, exception_id)
    if not exc:
        raise HTTPException(status_code=404, detail="Availability exception not found")
    session.delete(exc)
    session.commit()


# ---------------------------------------------------------------------------
# Admin: Google Calendar health
# ---------------------------------------------------------------------------

@router.get("/calendar-health")
def get_calendar_health(
    _: object = Depends(CallingUser(permissions=[Permission.MANAGE_APPOINTMENTS])),
) -> dict:
    """Probe the configured Google Calendar and return its status.

    Returns one of three shapes:
      {"status": "ok", "calendar_id": "<id>"}       — service is configured and reachable
      {"status": "unconfigured"}                     — env vars are absent; integration disabled
      {"status": "error", "detail": "<message>"}    — env vars are set but the API call failed

    Requires MANAGE_APPOINTMENTS permission.
    """
    from ..utils.google_calendar import get_calendar_service, get_misconfiguration_error

    cal_id = os.getenv("GOOGLE_CALENDAR_ID")

    service = get_calendar_service()
    if service is None:
        err = get_misconfiguration_error()
        return {"status": "error", "detail": err} if err else {"status": "unconfigured"}

    try:
        service.calendarList().get(calendarId=cal_id).execute()
        return {"status": "ok", "calendar_id": cal_id}
    except Exception as exc:
        logger.error("[calendar-health] probe failed: %s", exc)
        return {"status": "error", "detail": str(exc)}
