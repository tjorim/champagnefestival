"""Outgoing email helpers."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


async def send_contact_notification(*, name: str, email: str, message_text: str, message_id: str) -> bool:
    """Notify the organizer about a persisted contact submission."""
    recipient = settings.contact_recipient or settings.smtp_from
    if not settings.smtp_host or not settings.smtp_from or not recipient:
        logger.warning("Contact notification not sent for message_id=%s because SMTP is not configured.", message_id)
        return False

    message = EmailMessage()
    message["Subject"] = f"Champagnefestival contact message from {name}"
    message["From"] = settings.smtp_from
    message["To"] = recipient
    message["Reply-To"] = email
    message.set_content(
        f"A new contact message was stored with ID {message_id}.\n\nName: {name}\nEmail: {email}\n\n{message_text}\n"
    )
    try:
        await asyncio.to_thread(_send_message_sync, message)
    except Exception:
        logger.exception("Failed to send contact notification for message_id=%s.", message_id)
        return False
    logger.info("Sent contact notification for message_id=%s.", message_id)
    return True


async def send_guest_access_email(
    email: str,
    token: str,
    request_id: str,
    expires_at: datetime,
) -> bool:
    """Send a short-lived guest registration access token by email.

    Returns ``True`` when an SMTP delivery attempt succeeds. Missing SMTP
    configuration or transport errors are logged and reported as ``False`` so
    callers can keep public responses generic.
    """
    if not settings.smtp_host or not settings.smtp_from:
        logger.warning(
            "Guest access email not sent for request_id=%s because SMTP is not configured.",
            request_id,
        )
        return False

    message = EmailMessage()
    message["Subject"] = "Your Champagnefestival registration access code"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        "Hello,\n\n"
        "Use the following access code to view your Champagnefestival registrations:\n\n"
        f"{token}\n\n"
        f"This code expires at {expires_at.isoformat()}.\n"
        "If you did not request this email, you can ignore it.\n"
    )

    try:
        await asyncio.to_thread(_send_message_sync, message)
    except Exception:
        logger.exception(
            "Failed to send guest access email for request_id=%s.",
            request_id,
        )
        return False

    logger.info("Sent guest access email for request_id=%s.", request_id)
    return True


def _send_message_sync(message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
