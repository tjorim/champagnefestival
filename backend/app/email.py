"""Outgoing email helpers."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime
from decimal import Decimal
from email.message import EmailMessage
from html import escape
from io import BytesIO
from typing import cast

import qrcode
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session_factory
from app.models import Event, Person, Registration

logger = logging.getLogger(__name__)


async def deliver_registration_confirmation(registration_id: str) -> bool:
    """Load current booking data and send its durable outbox notification."""
    async with async_session_factory() as db:
        registration = await db.scalar(
            select(Registration)
            .options(selectinload(Registration.event).selectinload(Event.edition))
            .where(Registration.id == registration_id)
        )
        if registration is None:
            logger.error("Registration confirmation resource missing for registration_id=%s", registration_id)
            return False
        if registration.status == "cancelled":
            logger.info("Skipped confirmation for canceled registration_id=%s", registration_id)
            return True
        person = await db.get(Person, registration.person_id)
        if person is None or not person.email:
            logger.error("Registration confirmation recipient missing for registration_id=%s", registration_id)
            return False
        return await send_registration_confirmation(registration, person, registration.event)


async def send_registration_confirmation(registration: Registration, person: Person, event: Event) -> bool:
    """Send a booking reference, check-in link, and inline QR image."""
    if not settings.smtp_host or not settings.smtp_from:
        logger.warning(
            "Registration confirmation not sent for registration_id=%s because SMTP is not configured.",
            registration.id,
        )
        return False

    check_in_url = (
        f"{settings.frontend_url.rstrip('/')}/check-in?id={registration.id}#token={registration.check_in_token}"
    )
    qr_image = qrcode.make(check_in_url)
    qr_buffer = BytesIO()
    qr_image.save(qr_buffer, format="PNG")

    order_lines = (
        "\n".join(f"- {item['name']} × {item['quantity']}" for item in (registration.order_items or [])) or "- None"
    )
    calculated_due = sum(
        (
            Decimal(str(item["price"]))
            * max(0, int(item["quantity"]) - int(item.get("included_quantity") or 0))
            for item in (registration.order_items or [])
        ),
        Decimal("0"),
    )
    amount = registration.amount_due if registration.amount_due is not None else calculated_due
    amount_due = f"€{amount:.2f}"
    event_date = event.date.isoformat() if event.date is not None else "To be announced"

    message = EmailMessage()
    message["Subject"] = f"Champagnefestival booking {registration.id}"
    message["From"] = settings.smtp_from
    message["To"] = person.email
    message.set_content(
        f"Hello {person.name},\n\nYour booking has been received.\n\n"
        f"Reference: {registration.id}\nEvent: {event.title}\nDate: {event_date}\n"
        f"Guests: {registration.guest_count}\nAmount due: {amount_due}\nOrder:\n{order_lines}\n\n"
        f"Your check-in link:\n{check_in_url}\n\nKeep this email available at the entrance.\n"
    )
    safe_name = escape(person.name)
    safe_event_title = escape(event.title)
    safe_check_in_url = escape(check_in_url, quote=True)
    html_order_lines = "".join(
        f"<li>{escape(str(item['name']))} × {int(item['quantity'])}</li>" for item in (registration.order_items or [])
    ) or "<li>None</li>"
    message.add_alternative(
        "<html><body>"
        f"<p>Hello {safe_name},</p><p>Your booking has been received.</p>"
        f"<p><strong>Reference:</strong> {registration.id}<br>"
        f"<strong>Event:</strong> {safe_event_title}<br><strong>Date:</strong> {event_date}<br>"
        f"<strong>Guests:</strong> {registration.guest_count}<br><strong>Amount due:</strong> {amount_due}</p>"
        f"<p><strong>Order:</strong></p><ul>{html_order_lines}</ul>"
        f'<p><a href="{safe_check_in_url}">Open your check-in pass</a></p>'
        '<p><img src="cid:registration-qr" alt="Registration check-in QR code"></p>'
        "</body></html>",
        subtype="html",
    )
    html_part = cast(EmailMessage, message.get_body(preferencelist=("html",)))
    if html_part is None:
        raise RuntimeError("Registration confirmation HTML body was not created")
    html_part.add_related(qr_buffer.getvalue(), maintype="image", subtype="png", cid="<registration-qr>")
    try:
        await asyncio.to_thread(_send_message_sync, message)
    except Exception:
        logger.exception("Failed to send registration confirmation for registration_id=%s.", registration.id)
        return False
    logger.info("Sent registration confirmation for registration_id=%s.", registration.id)
    return True


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
