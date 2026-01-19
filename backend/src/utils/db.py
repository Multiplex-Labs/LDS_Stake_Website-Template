from datetime import datetime, timezone
from sqlmodel import select, delete, Session, func
from ..db import ORM
from ..models import UserSession, User
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
            logger.info("Default admin user created with email 'admin@admin.com'"
                        " and password from INITIAL_ADMIN_PASSWORD environment variable."
                        " Please change the password upon first login.")