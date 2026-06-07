from datetime import datetime, timezone
from enum import IntFlag
from typing import Any, Optional, Type, List
from fastapi import HTTPException
from sqlmodel import SQLModel, select, delete, Session, func
from ..db import ORM
from ..models import (
    UserSession, Assignment,
    SpeakingTopic, SpeakingAssignment,
    User, Permissions, Permission,
    Calling, PresidencyAssignment
)
from .security import hash_password
from .usercalling import HC_CALLING_NAME
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
        permissions: List[Permission] = []
) -> Calling:
    """
    Helper function to create a calling if it doesn't already exist.
    """
    statement = select(Calling).where(Calling.name == name)
    calling = session.exec(statement).first()
    if calling is None:
        logger.info(f"Creating '{name}' calling.")
        calling = Calling(name=name, max_slots=max_slots,
                          is_public=is_public, system_defined=True)
        session.add(calling)
        session.commit()
        session.refresh(calling)
    else:
        # Let's update any existing fields if need-be
        updated = False
        if calling.max_slots != max_slots:
            calling.max_slots = max_slots
            updated = True
        if calling.is_public != is_public:
            calling.is_public = is_public
            updated = True
        if updated:
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
            session, HC_CALLING_NAME, max_slots=15, is_public=True,
            permissions=[
                Permission.SUBMIT_CALLING_PROPOSALS, Permission.VIEW_CALLING_PROPOSALS
            ]
        )

        # Check if the "Stake President" calling existst
        _create_calling_if_not_exists(
            session, "Stake President", max_slots=1, is_public=True,
            permissions=[~Permission.NONE]  # All permissions
        )

        # Check if the "First Counselor" calling exists
        _create_calling_if_not_exists(
            session, "First Counselor", max_slots=1, is_public=True,
            permissions=[~Permission.NONE]  # All permissions
        )

        # Check if the "Second Counselor" calling exists
        _create_calling_if_not_exists(
            session, "Second Counselor", max_slots=1, is_public=True,
            permissions=[~Permission.NONE]  # All permissions
        )

        # Check if the "Executive Secretary" calling exists
        _create_calling_if_not_exists(
            session, "Executive Secretary", max_slots=1, is_public=True,
            permissions=[~Permission.NONE]  # All permissions
        )

        # Create presidency assignment rows for the three presidency callings
        create_presidency_assignments(session)


def create_presidency_assignments(session: Optional[Session] = None):
    """Creates PresidencyAssignment rows for the three presidency callings if they don't exist.

    Can be called with an existing session (e.g. from create_system_callings_and_assignments)
    or standalone (opens its own session when session=None).
    """
    PRESIDENCY_CALLINGS = ["Stake President", "First Counselor", "Second Counselor"]

    def _ensure_rows(s: Session):
        for name in PRESIDENCY_CALLINGS:
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

    if session is not None:
        _ensure_rows(session)
    else:
        orm = ORM()
        with Session(orm.engine) as s:
            _ensure_rows(s)


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

    # If updating, don't flag the record as a duplicate of itself
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
