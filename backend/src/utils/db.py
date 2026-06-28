from datetime import datetime, timezone
from enum import IntFlag
from typing import Any, Optional, Type, List
from fastapi import HTTPException
from sqlmodel import SQLModel, select, delete, Session, func
from ..db import ORM
from ..models import (
    UserSession, Assignment,
    SpeakingTopic, SpeakingAssignment,
    User, Permissions, Permission, MAX_VALID_SCOPES,
    Calling, PresidencyAssignment, UserCalling
)
from .security import hash_password
from .usercalling import HC_CALLING_NAME, SUPERADMIN_CALLING_NAME, STAKE_PRESIDENCY_CALLING_NAMES
from logging import getLogger

import asyncio
import os

logger = getLogger("application")


def cleanup_expired_sessions():
    """Removes all expired or revoked sessions from the database."""
    with Session(ORM().engine) as session:
        # Define the threshold
        now = datetime.now(timezone.utc)

        # Statement: Delete rows where expires_at is in the past OR is_revoked is True
        statement = delete(UserSession).where(
            (UserSession.expires_at < now)
        )

        results = session.exec(statement)
        session.commit()

        # Accessing rowcount via the underlying SQLAlchemy result
        count = results.rowcount
        if count > 0:
            logger.info(f"Cleaned up {count} expired sessions.")


async def session_cleanup_loop():
    """Background task that periodically cleans up expired sessions."""
    while True:
        try:
            cleanup_expired_sessions()
        except Exception as e:
            logger.error(f"Error during session cleanup: {e}")
        await asyncio.sleep(86400)  # Sleep for 24 hours


def cleanup_speaking_assignments():
    """
    Cleans up all speaking assignments + topics older than 1 year from the current month.
    """
    with Session(ORM().engine) as session:
        now = datetime.now(timezone.utc)
        cutoff_date = datetime(now.year - 1, now.month, 1, tzinfo=timezone.utc)

        assn_statement = delete(SpeakingAssignment).where(
            SpeakingAssignment.month < cutoff_date
        )

        topic_statement = delete(SpeakingTopic).where(
            SpeakingTopic.month < cutoff_date
        )

        assn_results = session.exec(assn_statement)
        topic_results = session.exec(topic_statement)
        session.commit()

        assn_count = assn_results.rowcount
        topic_count = topic_results.rowcount
        if assn_count > 0:
            logger.info(f"Cleaned up {assn_count} old speaking assignments.")
        if topic_count > 0:
            logger.info(f"Cleaned up {topic_count} old speaking topics.")


async def speaking_assignment_cleanup_loop():
    """Background task that periodically cleans up old speaking assignments."""
    while True:
        try:
            cleanup_speaking_assignments()
        except Exception as e:
            logger.error(f"Error during speaking assignment cleanup: {e}")
        await asyncio.sleep(2592000)  # Sleep for 30 days


def create_default_admin_user():
    """Creates a default admin user if no users exist in the database."""
    orm = ORM()
    with Session(orm.engine) as db:
        statement = select(func.count()).select_from(User)
        user_count = db.exec(statement).one()
        if user_count == 0:
            # Create a default admin user
            logger.warning(
                "No users found in database. Creating default admin user.")
            password = os.getenv("INITIAL_ADMIN_PASSWORD", None)
            if password is None:
                logger.error(
                    "INITIAL_ADMIN_PASSWORD is not set. Cannot create default admin user.")
                raise ValueError(
                    "INITIAL_ADMIN_PASSWORD environment variable must be set to create default admin user on first launch.")
            default_admin = User(
                email="admin@admin.com",
                fname="Admin",
                lname="User",
                password_hash=hash_password(password),
                force_password_reset=True,
                active=True,
            )
            db.add(default_admin)
            db.commit()
            db.refresh(default_admin)

            admin_permissions = Permissions(
                foreign_id=str(default_admin.id),
                is_calling=False,
                scopes=~Permission.NONE  # All permissions
            )
            db.add(admin_permissions)
            db.commit()
            logger.info("Default admin user created with email 'admin@admin.com'"
                        " and password from INITIAL_ADMIN_PASSWORD environment variable."
                        " Please change the password upon first login.")

def create_discord_bot_user() -> Optional[User]:
    """Creates a default discord bot user if it doesn't exist."""
    discord_bot_password = os.getenv("DISCORD_BOT_PASSWORD", None)
    if discord_bot_password is None:
        logger.warning(
            "DISCORD_BOT_PASSWORD is not set. Cannot create discord bot user.")
        return None
    orm = ORM()
    with Session(orm.engine) as db:
        statement = select(User).where(
                User.email == "discord-bot@localhost")
        user = db.exec(statement).one_or_none()
        if not user:
            # Create a default discord bot user
            logger.info(
                "Discord bot user not found. Creating default discord bot user.")
            user = User(
                email="discord-bot@localhost",
                fname="Discord",
                lname="Bot",
                # TODO: Get the password from an environment variable
                password_hash=hash_password(discord_bot_password),  # Replace with actual password
                force_password_reset=False,
                active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            bot_permissions = Permissions(
                foreign_id=str(user.id),
                is_calling=False,
                scopes=Permission.DISCORD_BOT
            )
            db.add(bot_permissions)
            db.commit()
        return user

def _create_calling_if_not_exists(
        session: Session,
        name: str,
        max_slots: int,
        is_public: bool,
        permissions: List[Permission] = [],
        display_group: Optional[str] = None,
        display_order: Optional[int] = None,
        lock_slots: bool = False,
        group_order: Optional[int] = None,
) -> Calling:
    """
    Helper function to create a calling if it doesn't already exist.
    """
    statement = select(Calling).where(Calling.name == name)
    calling = session.exec(statement).first()
    if calling is None:
        logger.info(f"Creating '{name}' calling.")
        calling = Calling(
            name=name, max_slots=max_slots, is_public=is_public,
            system_defined=True, display_group=display_group,
            display_order=display_order, lock_slots=lock_slots,
            group_order=group_order,
        )
        session.add(calling)
        session.commit()
        session.refresh(calling)
    else:
        updates = {
            "max_slots": max_slots,
            "is_public": is_public,
            "display_group": display_group,
            "display_order": display_order,
            "lock_slots": lock_slots,
            "group_order": group_order,
        }
        if any(getattr(calling, k) != v for k, v in updates.items()):
            for k, v in updates.items():
                setattr(calling, k, v)
            session.add(calling)
            session.commit()
            session.refresh(calling)
    if len(permissions) > 0:
        # Assign permissions to the calling
        permFlag = Permission.NONE
        for p in permissions:
            permFlag |= p
        existing_perms_statement = select(Permissions).where(
            Permissions.foreign_id == str(calling.id),
            Permissions.is_calling == True
        )
        existing_perms = session.exec(existing_perms_statement).first()
        if existing_perms:
            existing_perms.scopes = permFlag
            session.add(existing_perms)
            session.commit()
        else:
            calling_perm = Permissions(foreign_id=str(
                calling.id), is_calling=True, scopes=int(permFlag))
            session.add(calling_perm)
            session.commit()
    return calling


def create_system_callings_and_assignments():
    """Creates system callings and assignments if they don't exist."""
    orm = ORM()
    with Session(orm.engine) as session:
        _create_calling_if_not_exists(
            session, HC_CALLING_NAME, max_slots=12, is_public=True,
            permissions=[Permission.SUBMIT_CALLING_PROPOSALS, Permission.VIEW_CALLING_PROPOSALS],
            display_group="High Council", display_order=1, group_order=2,
        )

        _create_calling_if_not_exists(
            session, "Stake President", max_slots=1, is_public=True,
            permissions=[~Permission.NONE],
            display_group="Stake Presidency", display_order=1, group_order=1,
        )

        _create_calling_if_not_exists(
            session, "Stake First Counselor", max_slots=1, is_public=True,
            permissions=[~Permission.NONE],
            display_group="Stake Presidency", display_order=2, group_order=1,
        )

        _create_calling_if_not_exists(
            session, "Stake Second Counselor", max_slots=1, is_public=True,
            permissions=[~Permission.NONE],
            display_group="Stake Presidency", display_order=3, group_order=1,
        )

        _create_calling_if_not_exists(
            session, "Stake Executive Secretary", max_slots=1, is_public=True,
            permissions=[~Permission.NONE],
            display_group="Stake Presidency", display_order=4, group_order=1,
        )

        _create_calling_if_not_exists(
            session, "Stake Clerk", max_slots=1, is_public=True,
            permissions=[~Permission.NONE],
            display_group="Stake Presidency", display_order=5, group_order=1,
        )

        superadmin_calling = _create_calling_if_not_exists(
            session, SUPERADMIN_CALLING_NAME, max_slots=1, is_public=False,
            permissions=[~Permission.NONE],
            lock_slots=True,
        )

        admin_user = session.exec(select(User).where(User.email == "admin@admin.com")).first()
        if admin_user is not None:
            existing_slot = session.exec(
                select(UserCalling).where(
                    UserCalling.calling_id == superadmin_calling.id,
                    UserCalling.slot_number == 1,
                )
            ).first()
            if existing_slot is None:
                session.add(UserCalling(calling_id=superadmin_calling.id, slot_number=1, user_id=admin_user.id))
                session.commit()
            elif existing_slot.user_id is None:
                existing_slot.user_id = admin_user.id
                session.add(existing_slot)
                session.commit()

            # Ensure admin's direct user-level permissions always include all valid flags.
            # This self-heals when new Permission values are added.
            admin_perms = session.exec(
                select(Permissions).where(
                    Permissions.foreign_id == str(admin_user.id),
                    Permissions.is_calling == False,
                )
            ).first()
            if admin_perms is not None and admin_perms.scopes != MAX_VALID_SCOPES:
                admin_perms.scopes = MAX_VALID_SCOPES
                session.add(admin_perms)
                session.commit()

        create_presidency_assignments(session)


def create_presidency_assignments(session: Optional[Session] = None):
    """Creates PresidencyAssignment rows for the three presidency callings if they don't exist.

    Can be called with an existing session (e.g. from create_system_callings_and_assignments)
    or standalone (opens its own session when session=None).
    """
    def _ensure_rows(s: Session):
        try:
            for name in STAKE_PRESIDENCY_CALLING_NAMES:
                calling = s.exec(select(Calling).where(Calling.name == name)).first()
                if calling is None:
                    logger.warning(f"create_presidency_assignments: calling '{name}' not found, skipping.")
                    continue
                existing = s.exec(
                    select(PresidencyAssignment).where(PresidencyAssignment.calling_id == calling.id)
                ).first()
                if existing is None:
                    logger.info(f"Creating PresidencyAssignment row for '{name}'.")
                    row = PresidencyAssignment(calling_id=calling.id)
                    s.add(row)
            s.commit()
        except Exception:
            logger.exception(
                "create_presidency_assignments: failed to seed rows, rolling back."
            )
            s.rollback()
            raise

    if session is not None:
        _ensure_rows(session)
    else:
        orm = ORM()
        with Session(orm.engine) as s:
            _ensure_rows(s)


CURATED_ICONS = {
    "Shield", "ShieldCheck", "Rings", "Heart", "Star", "Users", "User",
    "Calendar", "CalendarCheck", "Clock", "Key", "Home", "Building2",
    "BookOpen", "Flag", "Landmark", "Crown", "Sparkles", "Award", "Badge",
    "CheckCircle", "Globe", "MapPin", "Church", "Scroll",
}

DEFAULT_APPOINTMENT_TYPES = [
    {
        "name": "Renew Temple Recommend",
        "description": "Interview to renew your temple recommend.",
        "duration_mins": 10,
        "details": "If you have any questions that haven't yet been answered, please call. Otherwise, we look forward to seeing you for your appointment.",
        "icon_name": "ShieldCheck",
        "display_order": 1,
    },
    {
        "name": "Ecclesiastical Endorsement",
        "description": "Ecclesiastical endorsement interview with the Stake President.",
        "duration_mins": 10,
        "details": "If you have any questions that haven't yet been answered, please call. Otherwise, we look forward to seeing you for your appointment.",
        "icon_name": "Award",
        "display_order": 2,
    },
    {
        "name": "Sealing (Not Endowed)",
        "description": "For those being sealed who have not yet been endowed.",
        "duration_mins": 30,
        "details": "Sign up for this appointment if you are being Sealed AND 1. you have NOT been endowed OR 2. your fiance IS a member of our stake and is NOT endowed. Otherwise sign up for a \"Sealing (Endowed)\" appointment. You only need to sign up for one appointment for both of you.",
        "icon_name": "Rings",
        "display_order": 3,
    },
    {
        "name": "Sealing (Endowed)",
        "description": "For those being sealed who are already endowed.",
        "duration_mins": 30,
        "details": "Sign up for this appointment if you are endowed AND 1. your fiancé is not a member of our stake. OR 2. your fiance is endowed and a member of our stake. Otherwise sign up for a \"Sealing (Not Endowed)\" appointment. You will only need one appointment for both of you. Please bring your Fiancé/Fiancée with you if possible.",
        "icon_name": "Rings",
        "display_order": 4,
    },
    {
        "name": "Endowment",
        "description": "First-time endowment interview.",
        "duration_mins": 30,
        "details": "Sign up for this appointment if you are going to the temple for the first time to receive your endowment.",
        "icon_name": "Landmark",
        "display_order": 5,
    },
    {
        "name": "Melchizedek Priesthood",
        "description": "Interview to receive the Melchizedek Priesthood.",
        "duration_mins": 30,
        "details": "Sign up for this interview if you have met with the Bishop and are ready to meet with the Stake President to receive the Melchizedek Priesthood.",
        "icon_name": "Crown",
        "display_order": 6,
    },
    {
        "name": "Other",
        "description": "Any other reason to meet with the Stake President.",
        "duration_mins": 30,
        "details": "Sign up for this appointment if you need to meet with the Stake President for any reason other than a Temple Recommend, Priesthood Ordination, Mission, or an Ecclesiastical Endorsement.",
        "icon_name": "Calendar",
        "display_order": 7,
    },
]


def upsert_temple_recommend_config():
    """Creates the singleton TempleRecommendConfig row (id=1) with defaults if it doesn't exist."""
    from ..models import TempleRecommendConfig
    orm = ORM()
    with Session(orm.engine) as session:
        existing = session.get(TempleRecommendConfig, 1)
        if existing is None:
            config = TempleRecommendConfig(id=1)
            session.add(config)
            session.commit()


def create_default_appointment_types():
    """Idempotent upsert-by-name of 6 system-defined appointment types."""
    from ..models import AppointmentType
    orm = ORM()
    with Session(orm.engine) as session:
        for data in DEFAULT_APPOINTMENT_TYPES:
            existing = session.exec(
                select(AppointmentType).where(AppointmentType.name == data["name"])
            ).first()
            if existing is None:
                session.add(AppointmentType(**data, system_defined=True))
        session.commit()


def pre_populate_fast_sunday_exceptions():
    """Idempotently creates global AvailabilityException rows for Fast Sundays (first Sunday of each month)
    for the current year and next year."""
    import calendar as cal_module
    from datetime import date
    from ..models import AvailabilityException
    orm = ORM()
    today = date.today()
    years = [today.year, today.year + 1]
    with Session(orm.engine) as session:
        for year in years:
            for month in range(1, 13):
                first_day = date(year, month, 1)
                day_of_week = first_day.weekday()  # 0=Mon, 6=Sun
                days_until_sunday = (6 - day_of_week) % 7
                fast_sunday = date(year, month, 1 + days_until_sunday)
                existing = session.exec(
                    select(AvailabilityException).where(
                        AvailabilityException.date == fast_sunday,
                        AvailabilityException.is_global == True,
                        AvailabilityException.reason == "Fast Sunday",
                    )
                ).first()
                if existing is None:
                    session.add(AvailabilityException(
                        date=fast_sunday,
                        reason="Fast Sunday",
                        is_global=True,
                        user_id=None,
                    ))
        session.commit()


def upsert_site_settings():
    """Creates the singleton SiteSettings row (id=1) with defaults if it doesn't exist."""
    from ..models import SiteSettings
    orm = ORM()
    with Session(orm.engine) as session:
        existing = session.get(SiteSettings, 1)
        if existing is None:
            config = SiteSettings(
                id=1,
                sacrament_times=["8:30am", "10:00am", "11:30am", "1:00pm"],
                hidden_pages=[],
            )
            session.add(config)
            session.commit()


def validate_unique_field(
    session: Session,
    model: Type[SQLModel],
    field_name: str,
    value: Any,
    exclude_id: Any = None
):
    """
    Returns True if the value is unique (or None), 
    raises 400 if it belongs to another record.
    """
    if value is None:
        return True

    statement = select(model).where(getattr(model, field_name) == value)


    if exclude_id is not None:
        statement = statement.where(model.id != exclude_id)

    existing = session.exec(statement).first()

    if existing:
        # Format the field name for the error message (e.g., "phone_number" -> "Phone number")
        display_name = field_name.replace("_", " ").capitalize()
        raise HTTPException(
            status_code=400,
            detail=f"{display_name} already in use."
        )
    return True
