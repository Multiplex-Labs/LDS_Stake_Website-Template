"""Tests for the Google Calendar integration module and the calendar-health endpoint.

All tests that exercise get_calendar_service() reset the module-level singleton cache
via the reset_calendar_cache fixture so each test starts from a clean state.

Google API calls are mocked throughout — no real network access occurs.

The calendar-health router imports get_calendar_service lazily inside the route
function (`from ..utils.google_calendar import get_calendar_service`), so we
patch it at the source module (src.utils.google_calendar) — not at the router.
"""
import logging
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

import src.utils.google_calendar as _gc_module
from src.models import Booking, BookingStatus
from src.utils.google_calendar import (
    create_event,
    delete_event,
    get_calendar_service,
    update_event,
)

from .conftest import (
    auth_headers,
    login,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_calendar_cache():
    """Reset the module-level singleton cache before and after every test.

    get_calendar_service() caches its result after the first call. Without resetting
    the cache, tests that configure env vars differently would inherit stale state.

    Also resets _misconfiguration_error (added by the batch-b parallel agent for M-10).
    getattr with a default handles the case where the attribute does not yet exist in
    the module; Python always allows setting arbitrary attributes on modules, so the
    assignment is unconditional and safe in both old and new versions of the module.
    """
    original_cache = _gc_module._service_cache
    original_logged = _gc_module._unconfigured_logged
    # getattr default of None covers the case where the attribute is not yet present.
    original_misc_error = getattr(_gc_module, '_misconfiguration_error', None)

    _gc_module._service_cache = _gc_module._UNINITIALIZED
    _gc_module._unconfigured_logged = False
    # Setting the attribute is safe even when the module does not yet define it.
    _gc_module._misconfiguration_error = None

    yield

    _gc_module._service_cache = original_cache
    _gc_module._unconfigured_logged = original_logged
    _gc_module._misconfiguration_error = original_misc_error


def _make_booking_obj() -> Booking:
    """Return an in-memory (unsaved) Booking instance for calendar unit tests."""
    now = datetime.utcnow() + timedelta(hours=25)
    return Booking(
        id=999,
        appointment_type_id=1,
        interviewer_user_id=1,
        member_name="Calendar Test Member",
        member_email="caltest@example.com",
        member_phone="555-9000",
        booking_date=now.date(),
        start_minute_of_day=now.hour * 60 + now.minute,
        end_minute_of_day=now.hour * 60 + now.minute + 30,
        start_datetime=now,
        end_datetime=now + timedelta(minutes=30),
        status=BookingStatus.CONFIRMED,
        confirmation_token="cal-test-token-unique",
    )


# ---------------------------------------------------------------------------
# test_create_event_success
# ---------------------------------------------------------------------------


def test_create_event_success(monkeypatch):
    """create_event must call events().insert() with the correct calendarId and return the event ID."""
    monkeypatch.setenv("GOOGLE_CALENDAR_ID", "test-calendar@group.calendar.google.com")

    fake_event_id = "fake-event-abc123"
    mock_insert_result = MagicMock()
    mock_insert_result.execute.return_value = {"id": fake_event_id}

    mock_events_obj = MagicMock()
    mock_events_obj.insert.return_value = mock_insert_result

    mock_service = MagicMock()
    mock_service.events.return_value = mock_events_obj

    with patch("src.utils.google_calendar.get_calendar_service", return_value=mock_service):
        booking = _make_booking_obj()
        result = create_event(booking, "Temple Recommend Interview")

    assert result == fake_event_id
    mock_events_obj.insert.assert_called_once()
    insert_kwargs = mock_events_obj.insert.call_args.kwargs
    assert insert_kwargs["calendarId"] == "test-calendar@group.calendar.google.com"
    event_body = insert_kwargs["body"]
    assert "start" in event_body
    assert "end" in event_body


# ---------------------------------------------------------------------------
# test_update_event_uses_patch_not_insert
# ---------------------------------------------------------------------------


def test_update_event_uses_patch_not_insert(monkeypatch):
    """update_event must call events().patch() — not events().insert() — with the correct eventId."""
    monkeypatch.setenv("GOOGLE_CALENDAR_ID", "test-calendar@group.calendar.google.com")

    mock_patch_result = MagicMock()
    mock_patch_result.execute.return_value = {}

    mock_events_obj = MagicMock()
    mock_events_obj.patch.return_value = mock_patch_result

    mock_service = MagicMock()
    mock_service.events.return_value = mock_events_obj

    with patch("src.utils.google_calendar.get_calendar_service", return_value=mock_service):
        booking = _make_booking_obj()
        update_event("event-123", booking, "Temple Recommend Interview")

    # patch must have been called; insert must not have been.
    mock_events_obj.patch.assert_called_once()
    mock_events_obj.insert.assert_not_called()

    patch_kwargs = mock_events_obj.patch.call_args.kwargs
    assert patch_kwargs["eventId"] == "event-123"
    assert patch_kwargs["calendarId"] == "test-calendar@group.calendar.google.com"


# ---------------------------------------------------------------------------
# test_graceful_skip_when_unconfigured
# ---------------------------------------------------------------------------


def test_graceful_skip_when_unconfigured(monkeypatch):
    """get_calendar_service() must return None without raising when env vars are absent."""
    monkeypatch.delenv("GOOGLE_CALENDAR_ID", raising=False)
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)

    result = get_calendar_service()

    assert result is None


# ---------------------------------------------------------------------------
# test_delete_event_404_does_not_raise
# ---------------------------------------------------------------------------


def test_delete_event_404_does_not_raise(monkeypatch, caplog):
    """delete_event must log a WARNING (not raise) when the API responds with HTTP 404."""
    monkeypatch.setenv("GOOGLE_CALENDAR_ID", "test-calendar@group.calendar.google.com")

    from googleapiclient.errors import HttpError

    # Construct a minimal HttpError with status 404.
    fake_resp = MagicMock()
    fake_resp.status = 404
    http_404 = HttpError(resp=fake_resp, content=b"Not Found")

    mock_delete_result = MagicMock()
    mock_delete_result.execute.side_effect = http_404

    mock_events_obj = MagicMock()
    mock_events_obj.delete.return_value = mock_delete_result

    mock_service = MagicMock()
    mock_service.events.return_value = mock_events_obj

    with patch("src.utils.google_calendar.get_calendar_service", return_value=mock_service):
        with caplog.at_level(logging.WARNING):
            delete_event("missing-id")  # Must NOT raise.

    warning_messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
    assert any("missing-id" in msg or "not found" in msg.lower() for msg in warning_messages), (
        f"Expected a WARNING about the missing event; got: {warning_messages}"
    )


# ---------------------------------------------------------------------------
# test_calendar_health_endpoint_ok
# ---------------------------------------------------------------------------


def test_calendar_health_endpoint_ok(
    client: TestClient, db_session: Session, admin, monkeypatch
):
    """GET /appointment-availability/calendar-health returns status=ok when configured.

    The route imports get_calendar_service lazily, so we patch it at the source
    module (src.utils.google_calendar) rather than at the router module.
    """
    monkeypatch.setenv("GOOGLE_CALENDAR_ID", "health-test@group.calendar.google.com")

    mock_cal_get_result = MagicMock()
    mock_cal_get_result.execute.return_value = {"id": "health-test@group.calendar.google.com"}

    mock_calendar_list_obj = MagicMock()
    mock_calendar_list_obj.get.return_value = mock_cal_get_result

    mock_service = MagicMock()
    mock_service.calendarList.return_value = mock_calendar_list_obj

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)

    with patch("src.utils.google_calendar.get_calendar_service", return_value=mock_service):
        response = client.get(
            "/appointment-availability/calendar-health",
            headers=auth_headers(token),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "calendar_id" in data


# ---------------------------------------------------------------------------
# test_calendar_health_endpoint_unconfigured
# ---------------------------------------------------------------------------


def test_calendar_health_endpoint_unconfigured(
    client: TestClient, db_session: Session, admin, monkeypatch
):
    """GET /appointment-availability/calendar-health returns status=unconfigured when unconfigured.

    The real get_calendar_service() is called (not mocked) — env vars are removed
    so it returns None via the standard early-exit path, and the cache is reset by
    the reset_calendar_cache fixture before the test runs.
    """
    monkeypatch.delenv("GOOGLE_CALENDAR_ID", raising=False)
    monkeypatch.delenv("GOOGLE_SERVICE_ACCOUNT_FILE", raising=False)

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)

    response = client.get(
        "/appointment-availability/calendar-health",
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "unconfigured"


# ---------------------------------------------------------------------------
# M-10: Calendar health "error" status
#
# Skipped until the batch-b parallel agent:
#   1. Adds _misconfiguration_error: Optional[str] = None to google_calendar.py
#   2. Adds get_misconfiguration_error() -> Optional[str] to google_calendar.py
#   3. Updates the /appointment-availability/calendar-health endpoint to return
#      {"status": "error", "detail": "..."} when _misconfiguration_error is set.
# ---------------------------------------------------------------------------


def test_calendar_health_returns_error_when_misconfigured(
    client: TestClient, db_session: Session, admin, monkeypatch
):
    """GET /appointment-availability/calendar-health returns status=error when _misconfiguration_error is set.

    Simulates a failed credential load by injecting the error string directly into
    the module-level _misconfiguration_error variable.  The reset_calendar_cache
    fixture (autouse) will restore the original value after the test.
    """
    # Inject a misconfiguration error — simulates what get_calendar_service() would
    # set when GOOGLE_SERVICE_ACCOUNT_FILE points to a missing file.
    _gc_module._misconfiguration_error = "FileNotFoundError: /bad/path/service-account.json"
    _gc_module._service_cache = None  # ensure service is treated as "not initialized"

    admin_user, admin_password = admin
    token = login(client, admin_user.email, admin_password)

    response = client.get(
        "/appointment-availability/calendar-health",
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert "detail" in data
    assert "FileNotFoundError" in data["detail"]
