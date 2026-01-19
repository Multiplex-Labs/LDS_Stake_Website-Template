from sqlmodel import SQLModel, Session
from fastapi.testclient import TestClient
from ..app import app
from ..db.orm import ORM, get_session

import pytest
import os


@pytest.fixture(scope="module", name="db_session")
def db_session_fixture():
    """Fixture to provide a database session for tests."""
    # Setup ORM to use in-memory SQLite for testing
    os.environ["DATABASE_PATH"] = ""
    orm = ORM(engine_kind="sqlite")
    with get_session() as session:
        yield session
    # Teardown: drop all tables after tests complete
    SQLModel.metadata.drop_all(orm.engine)

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