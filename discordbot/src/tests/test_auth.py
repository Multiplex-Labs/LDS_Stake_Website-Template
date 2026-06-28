import os

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from ..utils.auth import require_backend_token
from ..routes.hello import router as hello_router

_TOKEN = os.environ["BACKEND_TOKEN"]

# Minimal FastAPI app — no bot lifecycle needed for auth tests
_app = FastAPI()

from fastapi import APIRouter

_protected = APIRouter()

@_protected.get("/protected")
def protected_endpoint(_: None = Depends(require_backend_token)):
    return {"ok": True}

_app.include_router(_protected)
_app.include_router(hello_router)


@pytest.fixture
def client():
    return TestClient(_app, raise_server_exceptions=False)


def test_missing_auth_header_returns_401(client):
    r = client.get("/protected")
    assert r.status_code == 401


def test_wrong_token_returns_401(client):
    r = client.get("/protected", headers={"Authorization": "Bearer wrong-token"})
    assert r.status_code == 401


def test_empty_bearer_token_returns_401(client):
    r = client.get("/protected", headers={"Authorization": "Bearer "})
    assert r.status_code == 401


def test_valid_token_returns_200(client):
    r = client.get("/protected", headers={"Authorization": f"Bearer {_TOKEN}"})
    assert r.status_code == 200


def test_hello_requires_no_auth(client):
    r = client.get("/hello/")
    assert r.status_code == 200
