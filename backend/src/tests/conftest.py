import secrets
import os
import tempfile
from sqlmodel import SQLModel, Session, select
from fastapi.testclient import TestClient
from typing import Tuple

# Set necessary env variables for app initialization
os.environ["JWT_SECRET_KEY"] = secrets.token_urlsafe(32)
os.environ["SSL_ENABLED"] = "false"
os.environ["DEBUG"] = "true"

from src.app import app
from src.db.orm import ORM, get_session
from src.models import *
from src.utils import hash_password

import pytest


@pytest.fixture(scope="session", name="db_session")
def db_session_fixture():
    """Fixture to provide a database session for tests."""
    # Setup ORM to use in-memory SQLite for testing
    fd, temp_db_path = tempfile.mkstemp(suffix=".db")
    os.environ["DATABASE_PATH"] = temp_db_path
    orm = ORM(engine_kind="sqlite")
    BaseModel.metadata.create_all(orm.engine)
    with Session(orm.engine) as session:
        yield session
    # Teardown: drop all tables after tests complete
    os.close(fd)
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)

@pytest.fixture(scope="module", name="client")
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
@pytest.fixture(scope="function", name="userpass")
def user_fixture(db_session: Session):
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