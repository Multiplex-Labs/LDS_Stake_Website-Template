"""Tests for lock_slots field and SuperAdmin calling bootstrap."""
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from src.models import Calling, UserCalling, User


def _login(client: TestClient, email: str, password: str) -> str:
    r = client.post("/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_superadmin_calling_exists_at_startup(client: TestClient, db_session: Session):
    calling = db_session.exec(select(Calling).where(Calling.name == "SuperAdmin")).first()
    assert calling is not None
    assert calling.system_defined is True
    assert calling.is_public is False
    assert calling.lock_slots is True
    assert calling.max_slots == 1


def test_superadmin_slot1_assigned_to_admin(client: TestClient, db_session: Session):
    """Verify that when admin@admin.com exists, slot 1 of SuperAdmin is assigned to them.

    The test DB does not run create_default_admin_user(), so we create the admin user
    manually and call create_system_callings_and_assignments() to trigger the assignment logic.
    """
    from src.utils import hash_password, create_system_callings_and_assignments

    # Check if admin@admin.com already has a slot (e.g. from a previous test run in this session)
    calling = db_session.exec(select(Calling).where(Calling.name == "SuperAdmin")).first()
    assert calling is not None

    existing_admin = db_session.exec(select(User).where(User.email == "admin@admin.com")).first()
    if existing_admin is None:
        admin_user = User(
            email="admin@admin.com",
            fname="Admin",
            lname="User",
            password_hash=hash_password("TestAdmin1!"),
            active=True,
            force_password_reset=False,
        )
        db_session.add(admin_user)
        db_session.commit()
        db_session.refresh(admin_user)

        # Re-run bootstrap so the SuperAdmin slot gets assigned to admin@admin.com
        create_system_callings_and_assignments()
        db_session.expire_all()

    calling = db_session.exec(select(Calling).where(Calling.name == "SuperAdmin")).first()
    assert calling is not None
    slot = db_session.exec(
        select(UserCalling).where(
            UserCalling.calling_id == calling.id,
            UserCalling.slot_number == 1,
        )
    ).first()
    assert slot is not None
    assert slot.user_id is not None
    admin = db_session.get(User, slot.user_id)
    assert admin is not None
    assert admin.email == "admin@admin.com"


def test_lock_slots_blocks_unassign(client: TestClient, admin, db_session: Session):
    user, password = admin
    token = _login(client, user.email, password)

    calling = db_session.exec(select(Calling).where(Calling.name == "SuperAdmin")).first()
    assert calling is not None

    r = client.delete(
        f"/callings/{calling.id}/1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_stake_clerk_calling_exists_at_startup(client: TestClient, db_session: Session):
    calling = db_session.exec(select(Calling).where(Calling.name == "Stake Clerk")).first()
    assert calling is not None
    assert calling.is_public is True
    assert calling.display_group == "Stake Presidency"
    assert calling.display_order == 5
    assert calling.group_order == 1


def test_system_callings_have_display_groups(client: TestClient, db_session: Session):
    expected = {
        "Stake President":           ("Stake Presidency", 1, 1),
        "Stake First Counselor":     ("Stake Presidency", 2, 1),
        "Stake Second Counselor":    ("Stake Presidency", 3, 1),
        "Stake Executive Secretary": ("Stake Presidency", 4, 1),
        "Stake Clerk":               ("Stake Presidency", 5, 1),
        "High Councilor":            ("High Council", 1, 2),
    }
    for name, (group, order, g_order) in expected.items():
        calling = db_session.exec(select(Calling).where(Calling.name == name)).first()
        assert calling is not None, f"Calling '{name}' must exist"
        assert calling.display_group == group, f"{name}: expected group {group!r}, got {calling.display_group!r}"
        assert calling.display_order == order, f"{name}: expected order {order}, got {calling.display_order}"
        assert calling.group_order == g_order, f"{name}: expected group_order {g_order}, got {calling.group_order}"


def test_non_locked_calling_can_be_unassigned(client: TestClient, admin, db_session: Session):
    """Verify that a regular (non-locked) calling can still be cleared."""
    from src.models import Calling, UserCalling, User
    user, password = admin

    # Create a regular (non-locked) calling and assign the test user
    calling = Calling(name="Test Removable Calling", max_slots=1, is_public=False, system_defined=False, lock_slots=False)
    db_session.add(calling)
    db_session.commit()
    db_session.refresh(calling)

    # We need a second user to assign (admin is already in SuperAdmin)
    second_user = db_session.exec(
        select(User).where(User.email != "admin@admin.com")
    ).first()
    if second_user is None:
        import os
        from src.utils.security import hash_password
        second_user = User(email="temp@test.com", fname="Temp", lname="User",
                           password_hash=hash_password("TempPass1!"), active=True)
        db_session.add(second_user)
        db_session.commit()
        db_session.refresh(second_user)

    slot = UserCalling(calling_id=calling.id, slot_number=1, user_id=second_user.id)
    db_session.add(slot)
    db_session.commit()

    token = _login(client, user.email, password)
    r = client.delete(
        f"/callings/{calling.id}/1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
