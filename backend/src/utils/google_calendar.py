"""
Google Calendar integration for temple recommend appointments.

All public functions (create_event, update_event, delete_event) are synchronous
and safe to enqueue via FastAPI BackgroundTasks. If the Google Calendar
integration is not configured, all functions return/complete immediately without
raising.

Callers are responsible for dispatching these functions as BackgroundTask items —
this module does not import from FastAPI.

Environment variables consumed:
  GOOGLE_SERVICE_ACCOUNT_FILE  — filesystem path to a GCP service account JSON key
  GOOGLE_CALENDAR_ID           — Google Calendar ID for the shared interviewer calendar

If either variable is absent, the integration is silently disabled (one INFO log
on first call). If the file is missing or contains invalid JSON, an ERROR is logged
and the integration is disabled for the session without aborting startup.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Lazy singleton — distinguishes "not yet attempted" from "permanently disabled (None)".
_UNINITIALIZED = object()
_service_cache = _UNINITIALIZED
_unconfigured_logged = False
_misconfiguration_error: Optional[str] = None


def get_calendar_service() -> Optional[Any]:
    """Return a Google Calendar API Resource, or None if not configured.

    Builds and caches the service on the first call. Subsequent calls return
    the cached value without rebuilding.

    Returns None (with a single INFO log) when GOOGLE_CALENDAR_ID or
    GOOGLE_SERVICE_ACCOUNT_FILE is not set. Returns None (with an ERROR log)
    if the credentials file is missing or invalid.
    """
    global _service_cache, _unconfigured_logged, _misconfiguration_error

    if _service_cache is not _UNINITIALIZED:
        return _service_cache

    cal_id = os.getenv("GOOGLE_CALENDAR_ID")
    sa_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE")

    if not cal_id or not sa_file:
        if not _unconfigured_logged:
            logger.info(
                "[calendar] GOOGLE_CALENDAR_ID or GOOGLE_SERVICE_ACCOUNT_FILE not set — "
                "Google Calendar integration disabled"
            )
            _unconfigured_logged = True
        _service_cache = None
        return None

    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_service_account_file(
            sa_file,
            scopes=["https://www.googleapis.com/auth/calendar.events"],
        )
        service = build("calendar", "v3", credentials=creds)
        _service_cache = service
        return service
    except Exception as exc:
        logger.error(
            "[calendar] Failed to initialize Google Calendar service (%s): %s — sync disabled",
            type(exc).__name__,
            exc,
        )
        _misconfiguration_error = f"{type(exc).__name__}: {exc}"
        _service_cache = None
        return None


def get_misconfiguration_error() -> Optional[str]:
    return _misconfiguration_error


def create_event(booking, appointment_type_name: str) -> Optional[str]:
    """Create a Google Calendar event for a confirmed booking.

    Builds an event dict with the booking summary, member description, and
    UTC start/end times, then inserts it into GOOGLE_CALENDAR_ID.

    Returns the created event ID string on success, or None if the service is
    not configured or the API call fails (error is logged).
    """
    service = get_calendar_service()
    if service is None:
        return None

    cal_id = os.getenv("GOOGLE_CALENDAR_ID")
    if not cal_id:
        return None

    try:
        event = {
            "summary": f"Temple Recommend Interview — {booking.member_name}",
            "description": (
                f"Member: {booking.member_name}\n"
                f"Phone: {booking.member_phone}\n"
                f"Type: {appointment_type_name}"
            ),
            "start": {
                "dateTime": _to_rfc3339(booking.start_datetime),
                "timeZone": "UTC",
            },
            "end": {
                "dateTime": _to_rfc3339(booking.end_datetime),
                "timeZone": "UTC",
            },
        }
        created = service.events().insert(calendarId=cal_id, body=event).execute()
        return created.get("id")
    except Exception as exc:
        logger.error("[calendar] create_event failed: %s", exc, exc_info=True)
        return None


def update_event(event_id: str, new_booking, appointment_type_name: str) -> bool:
    """Patch an existing Google Calendar event to reflect a rescheduled booking.

    Updates only the start time, end time, and description fields so that
    calendar subscribers receive an "event updated" notification rather than
    a new invitation. The event ID is preserved.

    Does nothing if the service is not configured or if the API call fails
    (error is logged).
    """
    service = get_calendar_service()
    if service is None:
        return False

    cal_id = os.getenv("GOOGLE_CALENDAR_ID")
    if not cal_id:
        return False

    try:
        patch_body = {
            "start": {
                "dateTime": _to_rfc3339(new_booking.start_datetime),
                "timeZone": "UTC",
            },
            "end": {
                "dateTime": _to_rfc3339(new_booking.end_datetime),
                "timeZone": "UTC",
            },
            "description": (
                f"Member: {new_booking.member_name}\n"
                f"Phone: {new_booking.member_phone}\n"
                f"Type: {appointment_type_name}"
            ),
        }
        service.events().patch(
            calendarId=cal_id, eventId=event_id, body=patch_body
        ).execute()
        return True
    except Exception as exc:
        logger.error("[calendar] update_event failed: %s", exc, exc_info=True)
        return False


def delete_event(event_id: str) -> None:
    """Delete a Google Calendar event by event ID.

    Logs a WARNING if the event is not found (HTTP 404) but does not raise.
    All other failures are logged as ERROR without raising.
    """
    service = get_calendar_service()
    if service is None:
        return

    cal_id = os.getenv("GOOGLE_CALENDAR_ID")
    if not cal_id:
        return

    from googleapiclient.errors import HttpError
    try:
        service.events().delete(calendarId=cal_id, eventId=event_id).execute()
    except HttpError as exc:
        if int(exc.resp.status) == 404:
            logger.warning("[calendar] Event %s not found on delete (already removed)", event_id)
        else:
            logger.error("[calendar] delete_event failed for %s: HTTP %s", event_id, exc.resp.status, exc_info=True)
    except Exception:
        logger.error("[calendar] delete_event unexpected error for %s", event_id, exc_info=True)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _to_rfc3339(dt: datetime) -> str:
    """Format a datetime as an RFC3339 UTC timestamp string.

    Handles both timezone-aware and naive datetimes. Naive datetimes are
    assumed to already be in UTC (consistent with how the Booking model stores
    start_datetime and end_datetime).
    """
    if dt.tzinfo is None:
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
