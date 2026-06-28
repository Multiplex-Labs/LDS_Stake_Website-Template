"""Email service — dual-provider cascade: Brevo (primary) → Mailjet (fallback).

Public API
----------
send_email(to_email, to_name, subject, html_body, plain_body, reply_to=None) -> None
validate_email_credentials() -> None
render_*(...)  -> EmailContent       # (html, plain_text)

Cascade rules
-------------
- _send_via_brevo raises ProviderError on HTTP 5xx or network exceptions.
- _send_via_brevo raises EmailConfigError on HTTP 4xx (bad key, bad payload) — no fallback.
- send_email catches only ProviderError and then calls _send_via_mailjet.
- EmailConfigError propagates to the caller unchanged.
"""

import html as html_module
import json
import logging
import os
from datetime import datetime
from typing import NamedTuple, Optional

logger = logging.getLogger("application")


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class EmailConfigError(Exception):
    """HTTP 4xx from a provider — configuration or code bug; do not cascade."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class ProviderError(Exception):
    """HTTP 5xx or network failure — safe to cascade to the fallback provider."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class EmailContent(NamedTuple):
    html: str
    plain: str


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _get_reply_to(override: Optional[str] = None) -> str:
    """Return the effective reply-to address, falling back through env vars."""
    return (
        override
        or os.getenv("REPLY_TO_EMAIL", "")
        or os.getenv("BREVO_FROM_EMAIL", "")
    )


def _escape(value: str) -> str:
    return html_module.escape(value)


def _fmt_dt(dt: datetime) -> str:
    """Format a UTC datetime as a human-readable string."""
    return dt.strftime("%A, %B %d, %Y at %I:%M %p UTC")


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------

def _send_via_brevo(
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    plain_body: str,
    reply_to: Optional[str] = None,
) -> None:
    """Send via Brevo HTTP API.

    Raises ProviderError on HTTP 5xx or network exceptions.
    Raises EmailConfigError on HTTP 4xx — caller must not cascade.
    """
    import sib_api_v3_sdk
    from sib_api_v3_sdk.rest import ApiException as BrevoApiException

    api_key = os.getenv("BREVO_API_KEY", "")
    from_email = os.getenv("BREVO_FROM_EMAIL", "")
    from_name = os.getenv("BREVO_FROM_NAME", "Stake Appointments")
    effective_reply_to = _get_reply_to(reply_to)

    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = api_key

    api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )

    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        to=[sib_api_v3_sdk.SendSmtpEmailTo(email=to_email, name=to_name)],
        sender=sib_api_v3_sdk.SendSmtpEmailSender(email=from_email, name=from_name),
        subject=subject,
        html_content=html_body,
        text_content=plain_body,
        reply_to=sib_api_v3_sdk.SendSmtpEmailReplyTo(email=effective_reply_to),
    )

    try:
        api_instance.send_transac_email(send_smtp_email)
    except BrevoApiException as exc:
        if exc.status >= 500:
            raise ProviderError(f"Brevo {exc.status}: {exc.reason}", status_code=exc.status) from exc
        logger.error("[email] Brevo 4xx — config error, not retrying: %s", exc)
        raise EmailConfigError(f"Brevo {exc.status}: {exc.reason}", status_code=exc.status) from exc
    except (AttributeError, TypeError, NameError, KeyError):
        raise  # programming errors — do not cascade to fallback
    except Exception as exc:
        raise ProviderError(f"Brevo network error: {exc}") from exc


def _send_via_mailjet(
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    plain_body: str,
    reply_to: Optional[str] = None,
) -> None:
    """Send via Mailjet HTTP API.

    Raises ProviderError on HTTP 5xx or network exceptions.
    Raises EmailConfigError on HTTP 4xx — caller should not cascade further.
    """
    import mailjet_rest

    api_key = os.getenv("MAILJET_API_KEY", "")
    secret_key = os.getenv("MAILJET_SECRET_KEY", "")
    from_email = os.getenv("MAILJET_FROM_EMAIL", "")
    from_name = os.getenv("MAILJET_FROM_NAME", "Stake Appointments")
    effective_reply_to = _get_reply_to(reply_to) or from_email

    try:
        mailjet = mailjet_rest.Client(auth=(api_key, secret_key), version="v3.1")
        data = {
            "Messages": [
                {
                    "From": {"Email": from_email, "Name": from_name},
                    "To": [{"Email": to_email, "Name": to_name}],
                    "ReplyTo": {"Email": effective_reply_to},
                    "Subject": subject,
                    "HTMLPart": html_body,
                    "TextPart": plain_body,
                }
            ]
        }
        result = mailjet.send.create(data=data)
        status = result.status_code
        if status >= 500:
            raise ProviderError(f"Mailjet {status}: {result.text}", status_code=status)
        if status >= 400:
            logger.error(
                "[email] Mailjet 4xx — config error, not retrying: %s %s",
                status,
                result.text,
            )
            raise EmailConfigError(f"Mailjet {status}", status_code=status)
    except (ProviderError, EmailConfigError):
        raise
    except Exception as exc:
        raise ProviderError(f"Mailjet network error: {exc}") from exc


# ---------------------------------------------------------------------------
# Public send function
# ---------------------------------------------------------------------------

def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    plain_body: str,
    reply_to: Optional[str] = None,
) -> None:
    """Send a transactional email via Brevo; fall back to Mailjet on 5xx/network errors only.

    EmailConfigError (4xx) propagates without attempting Mailjet.
    ProviderError from Mailjet also propagates to the caller.
    """
    try:
        _send_via_brevo(to_email, to_name, subject, html_body, plain_body, reply_to)
    except ProviderError as exc:
        logger.warning("[email] Brevo failed (%s), falling back to Mailjet", exc)
        _send_via_mailjet(to_email, to_name, subject, html_body, plain_body, reply_to)


# ---------------------------------------------------------------------------
# Startup credential validation
# ---------------------------------------------------------------------------

def validate_email_credentials() -> None:
    """Inspect email env vars at startup and log warnings for missing credentials.

    Called from app.py lifespan. Does not abort startup — missing keys only
    mean email delivery will fail at send time.
    """
    if not os.getenv("BREVO_API_KEY"):
        logger.warning(
            "[email] BREVO_API_KEY not set — email sending will fail at runtime"
        )
    if not os.getenv("MAILJET_API_KEY"):
        logger.warning(
            "[email] MAILJET_API_KEY not set — email sending will fail at runtime"
        )
    if not os.getenv("MAILJET_SECRET_KEY"):
        logger.warning(
            "[email] MAILJET_SECRET_KEY not set — email sending will fail at runtime"
        )
    if not os.getenv("BREVO_FROM_EMAIL"):
        logger.warning("[email] BREVO_FROM_EMAIL not set — emails will be rejected at send time")
    if not os.getenv("MAILJET_FROM_EMAIL"):
        logger.warning("[email] MAILJET_FROM_EMAIL not set — Mailjet fallback will fail at send time")


# ---------------------------------------------------------------------------
# Email templates — all return EmailContent (html, plain_text)
# ---------------------------------------------------------------------------

def render_booking_confirmation(
    *,
    member_name: str,
    type_name: str,
    date_str: str,
    time_str: str,
    location: str,
    interviewer_name: str,
    confirm_url: str,
    cancel_url: str,
) -> EmailContent:
    """Pending-confirm email sent immediately after a booking is created."""
    safe_name = _escape(member_name)
    safe_type = _escape(type_name)
    safe_location = _escape(location)
    safe_interviewer = _escape(interviewer_name)

    html_body = f"""<html><body>
<h2>Appointment Request Received</h2>
<p>Dear {safe_name},</p>
<p>Your appointment request has been received. Please confirm your email address to finalize the booking.</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Date:</strong> {date_str}</li>
  <li><strong>Time:</strong> {time_str}</li>
  <li><strong>Location:</strong> {safe_location}</li>
  <li><strong>Interviewer:</strong> {safe_interviewer}</li>
</ul>
<p><a href="{confirm_url}">Confirm your appointment</a></p>
<p><a href="{cancel_url}">Cancel your appointment</a></p>
<p>Please come dressed as you would for Sacrament Meeting or a temple visit.</p>
</body></html>"""

    plain_body = (
        f"Appointment Request Received\n\n"
        f"Dear {member_name},\n\n"
        f"Your appointment request has been received. Please confirm your email address "
        f"to finalize the booking.\n\n"
        f"  Type: {type_name}\n"
        f"  Date: {date_str}\n"
        f"  Time: {time_str}\n"
        f"  Location: {location}\n"
        f"  Interviewer: {interviewer_name}\n\n"
        f"Confirm your appointment: {confirm_url}\n"
        f"Cancel your appointment:  {cancel_url}\n\n"
        f"Please come dressed as you would for Sacrament Meeting or a temple visit."
    )
    return EmailContent(html=html_body, plain=plain_body)


def render_interviewer_notification(
    *,
    member_name: str,
    member_email: str,
    member_phone: str,
    type_name: str,
    date_str: str,
    time_str: str,
) -> EmailContent:
    """Notification sent to the interviewer when a new booking is received."""
    safe_name = _escape(member_name)
    safe_email = _escape(member_email)
    safe_phone = _escape(member_phone)
    safe_type = _escape(type_name)

    html_body = f"""<html><body>
<h2>New Appointment Booking</h2>
<p>A new appointment has been booked:</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Date:</strong> {date_str}</li>
  <li><strong>Time:</strong> {time_str}</li>
  <li><strong>Member:</strong> {safe_name}</li>
  <li><strong>Email:</strong> {safe_email}</li>
  <li><strong>Phone:</strong> {safe_phone}</li>
</ul>
<p>This appointment is pending member email confirmation.</p>
</body></html>"""

    plain_body = (
        f"New Appointment Booking\n\n"
        f"A new appointment has been booked:\n\n"
        f"  Type:   {type_name}\n"
        f"  Date:   {date_str}\n"
        f"  Time:   {time_str}\n"
        f"  Member: {member_name}\n"
        f"  Email:  {member_email}\n"
        f"  Phone:  {member_phone}\n\n"
        f"This appointment is pending member email confirmation."
    )
    return EmailContent(html=html_body, plain=plain_body)


def render_member_cancellation_confirmation(
    *,
    member_name: str,
    type_name: str,
    date_str: str,
    time_str: str,
    rebook_url: str,
) -> EmailContent:
    """Confirmation sent to the member after they cancel their own booking."""
    safe_name = _escape(member_name)
    safe_type = _escape(type_name)

    html_body = f"""<html><body>
<h2>Appointment Cancelled</h2>
<p>Dear {safe_name},</p>
<p>Your appointment has been cancelled:</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Date:</strong> {date_str}</li>
  <li><strong>Time:</strong> {time_str}</li>
</ul>
<p><a href="{rebook_url}">Schedule a new appointment</a></p>
</body></html>"""

    plain_body = (
        f"Appointment Cancelled\n\n"
        f"Dear {member_name},\n\n"
        f"Your appointment has been cancelled:\n\n"
        f"  Type: {type_name}\n"
        f"  Date: {date_str}\n"
        f"  Time: {time_str}\n\n"
        f"Schedule a new appointment: {rebook_url}"
    )
    return EmailContent(html=html_body, plain=plain_body)


def render_presidency_cancellation_notice(
    *,
    member_name: str,
    type_name: str,
    date_str: str,
    time_str: str,
    reason: Optional[str],
    rebook_url: str,
) -> EmailContent:
    """Notice sent to the member when the Stake Presidency cancels their booking."""
    safe_name = _escape(member_name)
    safe_type = _escape(type_name)
    reason_html = (
        f"<p><strong>Reason:</strong> {_escape(reason)}</p>" if reason else ""
    )
    reason_plain = f"\nReason: {reason}" if reason else ""

    html_body = f"""<html><body>
<h2>Appointment Cancelled</h2>
<p>Dear {safe_name},</p>
<p>Your appointment has been cancelled by the Stake Presidency:</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Date:</strong> {date_str}</li>
  <li><strong>Time:</strong> {time_str}</li>
</ul>
{reason_html}
<p><a href="{rebook_url}">Schedule a new appointment</a></p>
</body></html>"""

    plain_body = (
        f"Appointment Cancelled\n\n"
        f"Dear {member_name},\n\n"
        f"Your appointment has been cancelled by the Stake Presidency:\n\n"
        f"  Type: {type_name}\n"
        f"  Date: {date_str}\n"
        f"  Time: {time_str}{reason_plain}\n\n"
        f"Schedule a new appointment: {rebook_url}"
    )
    return EmailContent(html=html_body, plain=plain_body)


def render_booking_reschedule_success(
    member_name: str,
    old_datetime: datetime,
    new_datetime: datetime,
    appointment_type_name: str,
    interviewer_name: str,
    cancel_link: str,
) -> EmailContent:
    """Sent to the member after a successful reschedule.

    Does NOT include a re-confirm link — the new booking is already CONFIRMED.
    """
    safe_name = _escape(member_name)
    safe_type = _escape(appointment_type_name)
    safe_interviewer = _escape(interviewer_name)
    old_fmt = _fmt_dt(old_datetime)
    new_fmt = _fmt_dt(new_datetime)

    html_body = f"""<html><body>
<h2>Appointment Rescheduled</h2>
<p>Dear {safe_name},</p>
<p>Your appointment has been rescheduled:</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Previous time:</strong> {old_fmt}</li>
  <li><strong>New time:</strong> {new_fmt}</li>
  <li><strong>Interviewer:</strong> {safe_interviewer}</li>
</ul>
<p>Your appointment is confirmed — no further action is needed.</p>
<p>If you need to cancel: <a href="{cancel_link}">Cancel your appointment</a></p>
</body></html>"""

    plain_body = (
        f"Appointment Rescheduled\n\n"
        f"Dear {member_name},\n\n"
        f"Your appointment has been rescheduled:\n\n"
        f"  Type:          {appointment_type_name}\n"
        f"  Previous time: {old_fmt}\n"
        f"  New time:      {new_fmt}\n"
        f"  Interviewer:   {interviewer_name}\n\n"
        f"Your appointment is confirmed — no further action is needed.\n\n"
        f"If you need to cancel: {cancel_link}"
    )
    return EmailContent(html=html_body, plain=plain_body)


def render_reschedule_interviewer_notification(
    interviewer_name: str,
    member_name: str,
    old_datetime: datetime,
    new_datetime: datetime,
    appointment_type_name: str,
) -> EmailContent:
    """Notification sent to the interviewer when a member reschedules."""
    safe_interviewer = _escape(interviewer_name)
    safe_member = _escape(member_name)
    safe_type = _escape(appointment_type_name)
    old_fmt = _fmt_dt(old_datetime)
    new_fmt = _fmt_dt(new_datetime)

    html_body = f"""<html><body>
<h2>Appointment Rescheduled</h2>
<p>Dear {safe_interviewer},</p>
<p>An appointment with you has been rescheduled by the member:</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Member:</strong> {safe_member}</li>
  <li><strong>Previous time:</strong> {old_fmt}</li>
  <li><strong>New time:</strong> {new_fmt}</li>
</ul>
<p>Please update your calendar accordingly.</p>
</body></html>"""

    plain_body = (
        f"Appointment Rescheduled\n\n"
        f"Dear {interviewer_name},\n\n"
        f"An appointment with you has been rescheduled by the member:\n\n"
        f"  Type:          {appointment_type_name}\n"
        f"  Member:        {member_name}\n"
        f"  Previous time: {old_fmt}\n"
        f"  New time:      {new_fmt}\n\n"
        f"Please update your calendar accordingly."
    )
    return EmailContent(html=html_body, plain=plain_body)


def render_booking_reminder(
    member_name: str,
    start_datetime: datetime,
    appointment_type_name: str,
    interviewer_name: str,
    cancel_link: str,
) -> EmailContent:
    """Reminder email sent to the member when their appointment is 20–28 hours away."""
    safe_name = _escape(member_name)
    safe_type = _escape(appointment_type_name)
    safe_interviewer = _escape(interviewer_name)
    start_fmt = _fmt_dt(start_datetime)

    html_body = f"""<html><body>
<h2>Appointment Reminder</h2>
<p>Dear {safe_name},</p>
<p>This is a reminder of your upcoming appointment:</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Time:</strong> {start_fmt}</li>
  <li><strong>Interviewer:</strong> {safe_interviewer}</li>
</ul>
<p>Please come dressed as you would for Sacrament Meeting or a temple visit.</p>
<p>If you need to cancel: <a href="{cancel_link}">Cancel your appointment</a></p>
</body></html>"""

    plain_body = (
        f"Appointment Reminder\n\n"
        f"Dear {member_name},\n\n"
        f"This is a reminder of your upcoming appointment:\n\n"
        f"  Type:        {appointment_type_name}\n"
        f"  Time:        {start_fmt}\n"
        f"  Interviewer: {interviewer_name}\n\n"
        f"Please come dressed as you would for Sacrament Meeting or a temple visit.\n\n"
        f"If you need to cancel: {cancel_link}"
    )
    return EmailContent(html=html_body, plain=plain_body)


def render_booking_already_confirmed(
    *,
    member_name: str,
    type_name: str,
    date_str: str,
    time_str: str,
    location: str,
    interviewer_name: str,
    cancel_url: str,
    reschedule_url: Optional[str] = None,
) -> EmailContent:
    """Resend email for a booking that is already CONFIRMED.

    Omits the email-confirm link. Includes appointment details, cancel link,
    and an optional reschedule link (omitted when reschedule_token is absent).
    """
    safe_name = _escape(member_name)
    safe_type = _escape(type_name)
    safe_location = _escape(location)
    safe_interviewer = _escape(interviewer_name)

    reschedule_html = (
        f'<p><a href="{reschedule_url}">Reschedule your appointment</a></p>'
        if reschedule_url else ""
    )
    reschedule_plain = (
        f"\nReschedule your appointment: {reschedule_url}"
        if reschedule_url else ""
    )

    html_body = f"""<html><body>
<h2>Appointment Confirmed</h2>
<p>Dear {safe_name},</p>
<p>Your appointment is confirmed. Here are your details:</p>
<ul>
  <li><strong>Type:</strong> {safe_type}</li>
  <li><strong>Date:</strong> {date_str}</li>
  <li><strong>Time:</strong> {time_str}</li>
  <li><strong>Location:</strong> {safe_location}</li>
  <li><strong>Interviewer:</strong> {safe_interviewer}</li>
</ul>
<p><a href="{cancel_url}">Cancel your appointment</a></p>
{reschedule_html}
<p>Please come dressed as you would for Sacrament Meeting or a temple visit.</p>
</body></html>"""

    plain_body = (
        f"Appointment Confirmed\n\n"
        f"Dear {member_name},\n\n"
        f"Your appointment is confirmed. Here are your details:\n\n"
        f"  Type:        {type_name}\n"
        f"  Date:        {date_str}\n"
        f"  Time:        {time_str}\n"
        f"  Location:    {location}\n"
        f"  Interviewer: {interviewer_name}\n\n"
        f"Cancel your appointment: {cancel_url}{reschedule_plain}\n\n"
        f"Please come dressed as you would for Sacrament Meeting or a temple visit."
    )
    return EmailContent(html=html_body, plain=plain_body)


# ---------------------------------------------------------------------------
# Building reservation email templates
# ---------------------------------------------------------------------------

def render_reservation_pending(
    *,
    organizer_name: str,
    event_name: str,
    date_str: str,
    start_time: str,
    end_time: str,
    rooms: list,
) -> EmailContent:
    safe_name = _escape(organizer_name)
    safe_event = _escape(event_name)
    rooms_html = "".join(f"<li>{_escape(r)}</li>" for r in rooms)
    rooms_plain = ", ".join(rooms)
    html_body = f"""<html><body>
<h2>Building Reservation Request Received</h2>
<p>Dear {safe_name},</p>
<p>Your reservation request for <strong>{safe_event}</strong> has been received and is pending approval.</p>
<ul>
  <li><strong>Date:</strong> {date_str}</li>
  <li><strong>Time:</strong> {start_time} – {end_time}</li>
  <li><strong>Rooms:</strong><ul>{rooms_html}</ul></li>
</ul>
<p>You will receive another email once your request has been reviewed.</p>
</body></html>"""
    plain_body = (
        f"Building Reservation Request Received\n\n"
        f"Dear {organizer_name},\n\n"
        f"Your reservation request for {event_name} has been received and is pending approval.\n\n"
        f"  Date:  {date_str}\n"
        f"  Time:  {start_time} – {end_time}\n"
        f"  Rooms: {rooms_plain}\n\n"
        f"You will receive another email once your request has been reviewed."
    )
    return EmailContent(html=html_body, plain=plain_body)


def send_reservation_pending(reservation) -> None:
    rooms = json.loads(reservation.rooms) if isinstance(reservation.rooms, str) else reservation.rooms
    content = render_reservation_pending(
        organizer_name=reservation.organizer_name,
        event_name=reservation.event_name,
        date_str=str(reservation.date),
        start_time=reservation.start_time,
        end_time=reservation.end_time,
        rooms=rooms,
    )
    send_email(
        reservation.organizer_email,
        reservation.organizer_name,
        f"Reservation Request Received: {reservation.event_name}",
        content.html,
        content.plain,
    )


def render_reservation_approved(
    *,
    organizer_name: str,
    event_name: str,
    date_str: str,
    start_time: str,
    end_time: str,
) -> EmailContent:
    safe_name = _escape(organizer_name)
    safe_event = _escape(event_name)
    html_body = f"""<html><body>
<h2>Building Reservation Approved</h2>
<p>Dear {safe_name},</p>
<p>Your reservation request for <strong>{safe_event}</strong> has been approved.</p>
<ul>
  <li><strong>Date:</strong> {date_str}</li>
  <li><strong>Time:</strong> {start_time} – {end_time}</li>
</ul>
<p>A calendar file is attached. Please add it to your calendar.</p>
</body></html>"""
    plain_body = (
        f"Building Reservation Approved\n\n"
        f"Dear {organizer_name},\n\n"
        f"Your reservation for {event_name} has been approved.\n\n"
        f"  Date: {date_str}\n"
        f"  Time: {start_time} – {end_time}\n\n"
        f"A calendar file is attached."
    )
    return EmailContent(html=html_body, plain=plain_body)


def _send_reservation_approved_with_attachment(
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    plain_body: str,
    ics_bytes: bytes,
    event_name: str,
) -> None:
    import base64
    import sib_api_v3_sdk
    from sib_api_v3_sdk.rest import ApiException as BrevoApiException

    api_key = os.getenv("BREVO_API_KEY", "")
    from_email = os.getenv("BREVO_FROM_EMAIL", "")
    from_name = os.getenv("BREVO_FROM_NAME", "Stake Reservations")

    if not api_key or not from_email:
        logger.warning(
            "[email] BREVO_API_KEY or BREVO_FROM_EMAIL not configured; "
            "sending approval email without .ics attachment"
        )
        send_email(to_email, to_name, subject, html_body, plain_body)
        return

    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = api_key
    api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )
    attachment = [
        sib_api_v3_sdk.SendSmtpEmailAttachment(
            content=base64.b64encode(ics_bytes).decode(),
            name="reservation.ics",
        )
    ]
    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        to=[sib_api_v3_sdk.SendSmtpEmailTo(email=to_email, name=to_name)],
        sender=sib_api_v3_sdk.SendSmtpEmailSender(email=from_email, name=from_name),
        subject=subject,
        html_content=html_body,
        text_content=plain_body,
        attachment=attachment,
    )
    try:
        api_instance.send_transac_email(send_smtp_email)
    except BrevoApiException as exc:
        logger.warning("[email] Brevo attachment send failed (%s), falling back to plain", exc)
        send_email(to_email, to_name, subject, html_body, plain_body)
    except Exception:
        logger.exception("[email] Unexpected error sending reservation approval with attachment")
        send_email(to_email, to_name, subject, html_body, plain_body)


def send_reservation_approved(reservation) -> None:
    try:
        content = render_reservation_approved(
            organizer_name=reservation.organizer_name,
            event_name=reservation.event_name,
            date_str=str(reservation.date),
            start_time=reservation.start_time,
            end_time=reservation.end_time,
        )
    except Exception:
        logger.exception("[email] Failed to render approved email for reservation %s", getattr(reservation, 'id', '?'))
        return

    ics_bytes = None
    try:
        from .ics import generate_ics
        ics_bytes = generate_ics(
            event_name=reservation.event_name,
            event_date=reservation.date,
            start_time=reservation.start_time,
            end_time=reservation.end_time,
            organizer_email=reservation.organizer_email,
        )
    except Exception:
        logger.warning("[email] ICS generation failed for reservation %s; sending approval email without attachment", getattr(reservation, 'id', '?'))

    try:
        if ics_bytes:
            _send_reservation_approved_with_attachment(
                reservation.organizer_email,
                reservation.organizer_name,
                f"Building Reservation Approved: {reservation.event_name}",
                content.html,
                content.plain,
                ics_bytes,
                reservation.event_name,
            )
        else:
            send_email(
                reservation.organizer_email,
                reservation.organizer_name,
                f"Building Reservation Approved: {reservation.event_name}",
                content.html,
                content.plain,
            )
    except Exception:
        logger.exception("[email] Failed to send approved email for reservation %s", getattr(reservation, 'id', '?'))


def render_reservation_denied(
    *,
    organizer_name: str,
    event_name: str,
    denial_reason: str,
) -> EmailContent:
    safe_name = _escape(organizer_name)
    safe_event = _escape(event_name)
    safe_reason = _escape(denial_reason)
    html_body = f"""<html><body>
<h2>Building Reservation Not Approved</h2>
<p>Dear {safe_name},</p>
<p>Your reservation request for <strong>{safe_event}</strong> was not approved.</p>
<p><strong>Reason:</strong> {safe_reason}</p>
<p>If you have questions, please contact the Stake Executive Secretary.</p>
</body></html>"""
    plain_body = (
        f"Building Reservation Not Approved\n\n"
        f"Dear {organizer_name},\n\n"
        f"Your reservation request for {event_name} was not approved.\n\n"
        f"Reason: {denial_reason}\n\n"
        f"If you have questions, please contact the Stake Executive Secretary."
    )
    return EmailContent(html=html_body, plain=plain_body)


def send_reservation_denied(reservation) -> None:
    content = render_reservation_denied(
        organizer_name=reservation.organizer_name,
        event_name=reservation.event_name,
        denial_reason=reservation.denial_reason or "No reason provided.",
    )
    send_email(
        reservation.organizer_email,
        reservation.organizer_name,
        f"Building Reservation Not Approved: {reservation.event_name}",
        content.html,
        content.plain,
    )
