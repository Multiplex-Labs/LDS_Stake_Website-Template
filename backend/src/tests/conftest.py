import secrets
import os
import tempfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from sqlmodel import SQLModel, Session, select
from fastapi.testclient import TestClient
from typing import Tuple

# Set necessary env variables for app initialization
os.environ["JWT_SECRET_KEY"] = secrets.token_hex(32)
os.environ["SSL_ENABLED"] = "false"
os.environ["DEBUG"] = "true"

from src.app import app
from src.db.orm import ORM, get_session
from src.models import *
from src.utils import hash_password, create_system_callings_and_assignments, load_wards

import pytest


@pytest.fixture(scope="session")
def db_engine():
    """Fixture to provide a database engine for tests."""
    # Setup ORM to use tempfile SQLite for testing
    fd, temp_db_path = tempfile.mkstemp(suffix=".db")
    os.environ["DATABASE_PATH"] = temp_db_path
    orm = ORM(engine_kind="sqlite")
    BaseModel.metadata.create_all(orm.engine)
    create_system_callings_and_assignments()
    load_wards()
    yield orm.engine
    # Teardown: close file descriptor and remove temp file
    os.close(fd)
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)


@pytest.fixture(scope="function", name="db_session")
def db_session_fixture(db_engine):
    """Fixture to provide a database session for tests."""
    session = Session(db_engine)
    try:
        yield session
    finally:
        session.rollback()  # Ensure rollback on failure
        session.close()

@pytest.fixture(scope="function", name="client")
def client_fixture(db_session:Session):
    """Fixture to provide a TestClient for FastAPI app."""

    # Dependency Override for get_session
    def get_test_session():
        yield db_session
    app.dependency_overrides[get_session] = get_test_session
    client = TestClient(app)
    yield client
    # Cleanup dependency overrides
    app.dependency_overrides.clear()

@pytest.fixture(scope="session")
def create_user() -> callable:
    """Helper function to create a user and return the user object and plaintext password."""
    def _create_user() -> Tuple[User, str]:
        email = f"{secrets.token_urlsafe(10)}@{secrets.token_urlsafe(10)}.com"
        password = secrets.token_urlsafe(16)
        user = User(
            email=email,
            password_hash=hash_password(password),
            fname="First",
            lname="Last",
            active=True,
            force_password_reset=False,
        )
        return user, password
    return _create_user

@pytest.fixture(scope="function", name="userpass")
def user_fixture(db_session: Session, create_user):
    user, password = create_user()

    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    yield user,password
    # Delete permission row if it exists
    stmt = select(Permissions).where(
        Permissions.foreign_id == str(user.id),
        Permissions.is_calling == False
        )

    perm = db_session.exec(stmt).first()
    if perm:
        db_session.delete(perm)
        db_session.commit()
    db_session.delete(user)
    db_session.commit()

@pytest.fixture(scope="function", name="admin")
def admin_fixture(db_session: Session, create_user):
    user, password = create_user()
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    permFlag = Permission.NONE
    for p in Permission:
        permFlag |= p
    admin_perm = Permissions(foreign_id=str(user.id), is_calling=False, scopes=int(permFlag))
    with Session(ORM().engine) as session:
        session.add(admin_perm)
        session.commit()
    yield user, password
    with Session(ORM().engine) as session:
        session.delete(admin_perm)
        session.commit()

@pytest.fixture(scope="function", name="high_councilor_calling")
def high_councilor_calling_fixture(db_session: Session):
    calling = db_session.exec(
        select(Calling).where(Calling.name == "High Councilor")
    ).first()
    if calling is None:
        calling = Calling(name="High Councilor", max_slots=15, is_public=True)
        db_session.add(calling)
        db_session.commit()
        db_session.refresh(calling)
    yield calling
    # db_session.delete(calling)
    # db_session.commit()

@pytest.fixture(scope="function", name="high_councilor_assignment")
def high_councilor_assignment_fixture(db_session: Session, high_councilor_calling: Calling):
    usercalling = db_session.exec(
        select(UserCalling).where(
            UserCalling.calling_id == high_councilor_calling.id,
            UserCalling.slot_number == 1
        )
    ).first()
    if usercalling is None:
        usercalling = UserCalling(calling_id=high_councilor_calling.id, slot_number=1, user_id=None)
        db_session.add(usercalling)
        db_session.commit()
        db_session.refresh(usercalling)

    assignment = db_session.exec(
        select(Assignment).where(Assignment.high_councilor_id == usercalling.id)
    ).first()
    if assignment is None:
        assignment = Assignment(high_councilor_id=usercalling.id)
        db_session.add(assignment)
        db_session.commit()
    yield assignment
    db_session.delete(assignment)
    db_session.delete(usercalling)
    db_session.commit()


# ---------------------------------------------------------------------------
# Shared appointment-system helpers (used across appointment test modules)
# ---------------------------------------------------------------------------

def login(client: TestClient, email: str, password: str) -> str:
    """Login and return the access token."""
    resp = client.post("/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def auth_headers(token: str) -> dict:
    """Return Bearer auth header dict."""
    return {"Authorization": f"Bearer {token}"}


def ensure_temple_config(
    session: Session,
    booking_cutoff_hours: int = 0,
    slot_buffer_mins: int = 0,
    booking_window_days: int = 60,
    timezone: str = "America/Denver",
) -> "TempleRecommendConfig":
    """Ensure a TempleRecommendConfig singleton exists and reset it to known values."""
    session.expire_all()
    config = session.get(TempleRecommendConfig, 1)
    if config is None:
        config = TempleRecommendConfig(
            id=1,
            timezone=timezone,
            slot_buffer_mins=slot_buffer_mins,
            booking_window_days=booking_window_days,
            booking_cutoff_hours=booking_cutoff_hours,
        )
        session.add(config)
        session.commit()
        session.refresh(config)
    else:
        config.booking_cutoff_hours = booking_cutoff_hours
        config.slot_buffer_mins = slot_buffer_mins
        config.booking_window_days = booking_window_days
        config.timezone = timezone
        session.add(config)
        session.commit()
        session.refresh(config)
    return config


def make_appointment_type(
    session: Session,
    name: str = "Test Interview",
    duration_mins: int = 30,
    is_active: bool = True,
) -> "AppointmentType":
    """Get or create an AppointmentType by name."""
    existing = session.exec(
        select(AppointmentType).where(AppointmentType.name == name)
    ).first()
    if existing:
        # Update active state if needed
        if existing.is_active != is_active:
            existing.is_active = is_active
            session.add(existing)
            session.commit()
            session.refresh(existing)
        return existing
    appt = AppointmentType(
        name=name,
        duration_mins=duration_mins,
        description="Test description",
        details="",
        icon_name="Calendar",
        is_active=is_active,
        display_order=99,
        system_defined=False,
    )
    session.add(appt)
    session.commit()
    session.refresh(appt)
    return appt


def make_interviewer_with_calling(session: Session, user: "User", prefix: str = "Test") -> "Calling":
    """Give the user a calling that has MANAGE_APPOINTMENTS (512) permission.

    Returns the Calling object so callers can clean up if needed.
    The calling name is scoped to the user ID to avoid cross-test collisions.
    """
    calling_name = f"{prefix} Calling {user.id}"
    calling = session.exec(
        select(Calling).where(Calling.name == calling_name)
    ).first()
    if calling is None:
        calling = Calling(name=calling_name, max_slots=1, is_public=False, system_defined=False)
        session.add(calling)
        session.commit()
        session.refresh(calling)

    # Grant MANAGE_APPOINTMENTS (512) to the calling
    perm = session.exec(
        select(Permissions).where(
            Permissions.foreign_id == str(calling.id),
            Permissions.is_calling == True,
        )
    ).first()
    if perm is None:
        perm = Permissions(foreign_id=str(calling.id), is_calling=True, scopes=512)
        session.add(perm)
    else:
        perm.scopes = perm.scopes | 512
        session.add(perm)

    # Assign user to the calling (slot 1)
    uc = session.exec(
        select(UserCalling).where(
            UserCalling.calling_id == calling.id,
            UserCalling.slot_number == 1,
        )
    ).first()
    if uc is None:
        uc = UserCalling(calling_id=calling.id, slot_number=1, user_id=user.id)
        session.add(uc)
    else:
        uc.user_id = user.id
        session.add(uc)

    session.commit()
    return calling


def make_availability_window(
    session: Session,
    user_id: int,
    day_of_week: int,
    start_minute: int = 540,   # 9:00 AM
    end_minute: int = 600,     # 10:00 AM
) -> "AvailabilityWindow":
    """Create and persist an AvailabilityWindow for the given user and day."""
    window = AvailabilityWindow(
        user_id=user_id,
        day_of_week=day_of_week,
        start_minute=start_minute,
        end_minute=end_minute,
        is_active=True,
    )
    session.add(window)
    session.commit()
    session.refresh(window)
    return window


def get_next_weekday(day_of_week: int) -> date:
    """Return the next date matching the given weekday (0=Mon, 6=Sun), never today."""
    today = date.today()
    days_ahead = (day_of_week - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


def build_slot_utc(
    target_date: date,
    hour: int,
    minute: int = 0,
    timezone: str = "America/Denver",
) -> datetime:
    """Return a naive UTC datetime for the given local time on target_date."""
    tz = ZoneInfo(timezone)
    local_dt = datetime(target_date.year, target_date.month, target_date.day, hour, minute, tzinfo=tz)
    return local_dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def cleanup_booking(session: Session, booking: "Booking") -> None:
    """Delete BookingAuditLog rows then the Booking itself (respects FK constraints)."""
    from sqlalchemy import text
    session.exec(text(f"DELETE FROM bookingauditlog WHERE booking_id = {booking.id}"))
    session.exec(text(f"DELETE FROM booking WHERE id = {booking.id}"))
    session.commit()


# ---------------------------------------------------------------------------
# Pytest fixtures built on the shared helpers above
# ---------------------------------------------------------------------------
