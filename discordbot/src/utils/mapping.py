from typing import Optional
from sqlmodel import select

from ..models import UserMapping
from ..db import get_session

def get_email_from_discord_user_id(discord_user_id: int) -> Optional[str]:
    """Retrieve the email associated with a Discord user ID.
    
    Args:
        discord_user_id: The Discord user ID to look up.
        
    Returns:
        The user's email address if found, None otherwise.
    """
    with get_session() as db:
        statement = select(UserMapping).where(UserMapping.discord_user_id == discord_user_id)
        result = db.exec(statement)
        user_mapping = result.one_or_none()
        if user_mapping:
            return user_mapping.user_email
        else:
            return None
        
def get_discord_user_id_from_email(user_email: str) -> Optional[int]:
    """Retrieve the Discord user ID associated with an email address.
    
    Args:
        user_email: The email address to look up.
        
    Returns:
        The Discord user ID if found, None otherwise.
    """
    with get_session() as db:
        statement = select(UserMapping).where(UserMapping.user_email == user_email)
        result = db.exec(statement)
        user_mapping = result.one_or_none()
        if user_mapping:
            return user_mapping.discord_user_id
        else:
            return None
        
def create_or_update_user_mapping(discord_user_id: int, user_email: str) -> bool:
    """Create a new user mapping or update an existing one.
    
    Args:
        discord_user_id: The Discord user ID to map.
        user_email: The email address to map.
        
    Returns:
        True if the mapping was created or updated successfully, False if the email
        is already mapped to a different Discord user ID.
    """
    with get_session() as db:
        already_used = select(UserMapping).where(UserMapping.user_email == user_email)
        result = db.exec(already_used)
        existing_mapping = result.one_or_none()
        if existing_mapping and existing_mapping.discord_user_id != discord_user_id:
            return False
        statement = select(UserMapping).where(UserMapping.discord_user_id == discord_user_id)
        result = db.exec(statement)
        user_mapping = result.one_or_none()
        if user_mapping:
            user_mapping.user_email = user_email
            db.add(user_mapping)
        else:
            user_mapping = UserMapping(discord_user_id=discord_user_id, user_email=user_email)
            db.add(user_mapping)
        db.commit()

    return True