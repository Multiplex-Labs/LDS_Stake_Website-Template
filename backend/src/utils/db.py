from datetime import datetime, timezone
from enum import IntFlag
from typing import Any, Type
from fastapi import HTTPException
from sqlmodel import SQLModel, select, delete, Session, func
from ..db import ORM
from ..models import (
    UserSession, User, Permission, Permissions, Calling, Assignment
)
from .security import hash_password
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

def create_default_admin_user():
    """Creates a default admin user if no users exist in the database."""
    orm = ORM()
    with Session(orm.engine) as db:
        statement = select(func.count()).select_from(User)
        user_count = db.exec(statement).one()
        if user_count == 0:
            # Create a default admin user
            logger.warning("No users found in database. Creating default admin user.")
            password = os.getenv("INITIAL_ADMIN_PASSWORD", None)
            if password is None:
                logger.error("INITIAL_ADMIN_PASSWORD is not set. Cannot create default admin user.")
                raise ValueError("INITIAL_ADMIN_PASSWORD environment variable must be set to create default admin user on first launch.")
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
            
def _create_calling_if_not_exists(session: Session, name: str, max_slots: int, is_public: bool) -> Calling:
    """
    Helper function to create a calling if it doesn't already exist.
    """
    statement = select(Calling).where(Calling.name == name)
    calling = session.exec(statement).first()
    if calling is None:
        logger.info(f"Creating '{name}' calling.")
        calling = Calling(name=name, max_slots=max_slots, is_public=is_public, system_defined=True)
        session.add(calling)
        session.commit()
        session.refresh(calling)
    return calling

def create_system_callings_and_assignments():
    """Creates system callings and assignments if they don't exist."""
    orm = ORM()
    with Session(orm.engine) as session:
        # Check if the "High Councilor" calling exists
        _create_calling_if_not_exists(session, "High Councilor", max_slots=15, is_public=True)

        # Check if the "Stake President" calling existst
        _create_calling_if_not_exists(session, "Stake President", max_slots=1, is_public=True)

        # Check if the "First Counselor" calling exists
        _create_calling_if_not_exists(session, "First Counselor", max_slots=1, is_public=True)

        # Check if the "Second Counselor" calling exists
        _create_calling_if_not_exists(session, "Second Counselor", max_slots=1, is_public=True)

        # Check if the "Executive Secretary" calling exists
        _create_calling_if_not_exists(session, "Executive Secretary", max_slots=1, is_public=True)

        
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