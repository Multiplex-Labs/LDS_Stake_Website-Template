"""Tests for the dual-provider email cascade: Brevo (primary) -> Mailjet (fallback).

All tests patch at the src.utils.email module level so the send_email() dispatcher
sees the mocked functions rather than the real provider implementations.
"""
import logging
from unittest.mock import MagicMock, patch

import pytest

from src.utils.email import (
    EmailConfigError,
    ProviderError,
    _send_via_brevo,
    send_email,
    validate_email_credentials,
)

# ---------------------------------------------------------------------------
# Shared call-argument fixture
# ---------------------------------------------------------------------------

_SEND_KWARGS = dict(
    to_email="member@example.com",
    to_name="Test Member",
    subject="Test Subject",
    html_body="<p>Hello</p>",
    plain_body="Hello",
)


# ---------------------------------------------------------------------------
# Cascade logic tests
# ---------------------------------------------------------------------------


def test_brevo_success():
    """When Brevo succeeds, Mailjet must never be called."""
    with patch("src.utils.email._send_via_brevo") as mock_brevo, \
         patch("src.utils.email._send_via_mailjet") as mock_mailjet:
        mock_brevo.return_value = None

        send_email(**_SEND_KWARGS)

        mock_brevo.assert_called_once()
        mock_mailjet.assert_not_called()


def test_brevo_5xx_falls_back_to_mailjet():
    """A Brevo ProviderError (5xx/network) must trigger exactly one Mailjet attempt."""
    with patch("src.utils.email._send_via_brevo") as mock_brevo, \
         patch("src.utils.email._send_via_mailjet") as mock_mailjet:
        mock_brevo.side_effect = ProviderError("Brevo 503: Service Unavailable")
        mock_mailjet.return_value = None

        send_email(**_SEND_KWARGS)

        mock_brevo.assert_called_once()
        mock_mailjet.assert_called_once()


def test_brevo_4xx_no_fallback():
    """A Brevo EmailConfigError (4xx) must NOT fall back to Mailjet and must propagate."""
    with patch("src.utils.email._send_via_brevo") as mock_brevo, \
         patch("src.utils.email._send_via_mailjet") as mock_mailjet:
        mock_brevo.side_effect = EmailConfigError("Brevo 401: Unauthorized")

        with pytest.raises(EmailConfigError):
            send_email(**_SEND_KWARGS)

        mock_mailjet.assert_not_called()


def test_mailjet_5xx_propagates():
    """When both providers raise ProviderError, the exception must propagate to the caller."""
    with patch("src.utils.email._send_via_brevo") as mock_brevo, \
         patch("src.utils.email._send_via_mailjet") as mock_mailjet:
        mock_brevo.side_effect = ProviderError("Brevo 502: Bad Gateway")
        mock_mailjet.side_effect = ProviderError("Mailjet 503: Service Unavailable")

        with pytest.raises(ProviderError):
            send_email(**_SEND_KWARGS)


# ---------------------------------------------------------------------------
# Reply-To header test (inspects the Brevo SDK payload construction)
# ---------------------------------------------------------------------------


def test_reply_to_header_set(monkeypatch):
    """The reply_to field on the SendSmtpEmail payload must equal REPLY_TO_EMAIL.

    Patches only TransactionalEmailsApi (to prevent real HTTP) and
    SendSmtpEmailReplyTo (to capture what email address is supplied).
    All other SDK classes (Configuration, ApiClient, SendSmtpEmail, etc.) are real.
    """
    import sib_api_v3_sdk

    monkeypatch.setenv("REPLY_TO_EMAIL", "reply@example.com")
    monkeypatch.setenv("BREVO_API_KEY", "test-api-key")
    monkeypatch.setenv("BREVO_FROM_EMAIL", "noreply@example.com")

    # Capture every call to SendSmtpEmailReplyTo so we can inspect the email argument.
    mock_reply_to_cls = MagicMock()
    mock_api_instance = MagicMock()
    mock_api_instance.send_transac_email.return_value = None
    mock_api_cls = MagicMock(return_value=mock_api_instance)

    monkeypatch.setattr(sib_api_v3_sdk, "SendSmtpEmailReplyTo", mock_reply_to_cls)
    monkeypatch.setattr(sib_api_v3_sdk, "TransactionalEmailsApi", mock_api_cls)

    _send_via_brevo(
        to_email="to@example.com",
        to_name="To Name",
        subject="Subject",
        html_body="<p>html</p>",
        plain_body="plain",
        reply_to=None,  # should resolve to REPLY_TO_EMAIL env var
    )

    # SendSmtpEmailReplyTo must have been constructed with the env-var address.
    mock_reply_to_cls.assert_called_once_with(email="reply@example.com")


# ---------------------------------------------------------------------------
# Startup validation warning test
# ---------------------------------------------------------------------------


def test_startup_validation_logs_warning_when_key_missing(monkeypatch, caplog):
    """validate_email_credentials() must emit a WARNING when BREVO_API_KEY is absent."""
    monkeypatch.delenv("BREVO_API_KEY", raising=False)

    with caplog.at_level(logging.WARNING, logger="application"):
        validate_email_credentials()

    warning_messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
    assert any("BREVO_API_KEY" in msg for msg in warning_messages), (
        f"Expected a warning containing 'BREVO_API_KEY'; got: {warning_messages}"
    )
