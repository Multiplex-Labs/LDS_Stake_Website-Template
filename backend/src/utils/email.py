import smtplib
import os
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger("application")


class EmailService:
    def __init__(self):
        self.provider = os.getenv("EMAIL_PROVIDER", "").lower()
        self.from_addr = os.getenv("EMAIL_FROM", "")
        self.frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3100")

    def send(self, to: str, subject: str, html_body: str) -> bool:
        if not self.provider:
            logger.warning("EMAIL_PROVIDER not set — email not sent to %s", to)
            return False
        if self.provider == "smtp":
            return self._send_smtp(to, subject, html_body)
        logger.warning("Unknown EMAIL_PROVIDER=%s", self.provider)
        return False

    def _send_smtp(self, to: str, subject: str, html_body: str) -> bool:
        host = os.getenv("SMTP_HOST", "")
        port = int(os.getenv("SMTP_PORT", "587"))
        user = os.getenv("SMTP_USER", "")
        password = os.getenv("SMTP_PASSWORD", "")
        from_addr = os.getenv("SMTP_FROM", self.from_addr)
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = to
            msg.attach(MIMEText(html_body, "html"))
            with smtplib.SMTP(host, port) as server:
                server.ehlo()
                server.starttls()
                server.login(user, password)
                server.sendmail(from_addr, [to], msg.as_string())
            return True
        except Exception:
            logger.warning("SMTP send failed to %s", to, exc_info=True)
            return False

    def booking_confirmation(
        self,
        *,
        member_email: str,
        member_name: str,
        type_name: str,
        date_str: str,
        time_str: str,
        location: str,
        interviewer_name: str,
        confirm_url: str,
        cancel_url: str,
    ) -> bool:
        subject = f"Appointment Confirmation — {type_name}"
        html = f"""
        <h2>Appointment Confirmed</h2>
        <p>Dear {member_name},</p>
        <p>Your appointment has been scheduled:</p>
        <ul>
          <li><strong>Type:</strong> {type_name}</li>
          <li><strong>Date:</strong> {date_str}</li>
          <li><strong>Time:</strong> {time_str}</li>
          <li><strong>Location:</strong> {location}</li>
          <li><strong>With:</strong> {interviewer_name}</li>
        </ul>
        <p><a href="{confirm_url}">Confirm your appointment</a></p>
        <p><a href="{cancel_url}">Cancel your appointment</a></p>
        <p>Please come in Sunday dress as you would to Sacrament meeting or visiting the Temple.</p>
        """
        return self.send(member_email, subject, html)

    def interviewer_notification(
        self,
        *,
        interviewer_email: str,
        member_name: str,
        member_email: str,
        member_phone: str,
        type_name: str,
        date_str: str,
        time_str: str,
    ) -> bool:
        subject = f"New Appointment Booking — {type_name}"
        html = f"""
        <h2>New Appointment Booking</h2>
        <p>A new appointment has been booked:</p>
        <ul>
          <li><strong>Type:</strong> {type_name}</li>
          <li><strong>Date:</strong> {date_str}</li>
          <li><strong>Time:</strong> {time_str}</li>
          <li><strong>Member:</strong> {member_name}</li>
          <li><strong>Email:</strong> {member_email}</li>
          <li><strong>Phone:</strong> {member_phone}</li>
        </ul>
        """
        return self.send(interviewer_email, subject, html)

    def member_cancellation_confirmation(
        self,
        *,
        member_email: str,
        member_name: str,
        type_name: str,
        date_str: str,
        time_str: str,
        rebook_url: str,
    ) -> bool:
        subject = f"Appointment Cancelled — {type_name}"
        html = f"""
        <h2>Appointment Cancelled</h2>
        <p>Dear {member_name},</p>
        <p>Your appointment has been cancelled:</p>
        <ul>
          <li><strong>Type:</strong> {type_name}</li>
          <li><strong>Date:</strong> {date_str}</li>
          <li><strong>Time:</strong> {time_str}</li>
        </ul>
        <p><a href="{rebook_url}">Schedule a new appointment</a></p>
        """
        return self.send(member_email, subject, html)

    def presidency_cancellation_notice(
        self,
        *,
        member_email: str,
        member_name: str,
        type_name: str,
        date_str: str,
        time_str: str,
        reason: Optional[str],
        rebook_url: str,
    ) -> bool:
        subject = f"Appointment Cancelled by Presidency — {type_name}"
        reason_html = f"<p><strong>Reason:</strong> {reason}</p>" if reason else ""
        html = f"""
        <h2>Appointment Cancelled</h2>
        <p>Dear {member_name},</p>
        <p>Your appointment has been cancelled by the Stake Presidency:</p>
        <ul>
          <li><strong>Type:</strong> {type_name}</li>
          <li><strong>Date:</strong> {date_str}</li>
          <li><strong>Time:</strong> {time_str}</li>
        </ul>
        {reason_html}
        <p><a href="{rebook_url}">Schedule a new appointment</a></p>
        """
        return self.send(member_email, subject, html)


email_service = EmailService()
