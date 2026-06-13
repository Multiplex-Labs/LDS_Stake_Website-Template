"""Tests for create_system_callings_and_assignments() update path (B7)."""


def test_create_system_callings_updates_stale_fields(client, db_session):
    from sqlmodel import select
    from src.models import Calling
    from src.utils import create_system_callings_and_assignments

    # Find HC calling seeded by startup
    calling = db_session.exec(select(Calling).where(Calling.name == "High Councilor")).first()
    assert calling is not None

    original_max_slots = calling.max_slots
    calling.max_slots = original_max_slots + 99
    calling.is_public = False
    db_session.add(calling)
    db_session.commit()

    # Re-run bootstrap — it should correct the stale fields
    create_system_callings_and_assignments()

    # Expire identity map so we get fresh data from DB
    db_session.expire_all()
    corrected = db_session.exec(select(Calling).where(Calling.name == "High Councilor")).first()
    assert corrected.max_slots == original_max_slots
    assert corrected.is_public is True
