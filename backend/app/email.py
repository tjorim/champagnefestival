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
from app.models import ContactMessage, Event, Person, Registration

logger = logging.getLogger(__name__)

_CONFIRMATION_COPY = {
    "nl": {
        "subject": "Champagnefestival-inschrijving",
        "hello": "Beste",
        "received": "We hebben je inschrijving ontvangen.",
        "reference": "Referentie",
        "event": "Evenement",
        "date": "Datum",
        "guests": "Gasten",
        "due": "Te betalen",
        "order": "Bestelling",
        "none": "Geen",
        "pass": "Open je toegangspas",
        "keep": "Bewaar deze e-mail voor de toegang.",
        "qr": "QR-code voor toegang",
        "link_account": "Al lid of vrijwilliger? Meld je aan om deze boeking bij je account te voegen, naast je andere inschrijvingen:",
    },
    "fr": {
        "subject": "Inscription Champagnefestival",
        "hello": "Bonjour",
        "received": "Nous avons bien reçu votre inscription.",
        "reference": "Référence",
        "event": "Événement",
        "date": "Date",
        "guests": "Participants",
        "due": "Montant dû",
        "order": "Commande",
        "none": "Aucun",
        "pass": "Ouvrir votre laissez-passer",
        "keep": "Conservez cet e-mail pour l’entrée.",
        "qr": "Code QR d’accès",
        "link_account": "Déjà membre ou bénévole ? Connectez-vous pour ajouter cette réservation à votre compte, avec vos autres inscriptions :",
    },
    "en": {
        "subject": "Champagnefestival registration",
        "hello": "Hello",
        "received": "Your registration has been received.",
        "reference": "Reference",
        "event": "Event",
        "date": "Date",
        "guests": "Guests",
        "due": "Amount due",
        "order": "Order",
        "none": "None",
        "pass": "Open your check-in pass",
        "keep": "Keep this email available at the entrance.",
        "qr": "Registration check-in QR code",
        "link_account": "Already a member or volunteer? Sign in to add this booking to your account, alongside your other registrations:",
    },
}


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

    language = person.preferred_language if person.preferred_language in _CONFIRMATION_COPY else "nl"
    text = _CONFIRMATION_COPY[language]
    # The event title is in the same language as the rest of the email; it falls
    # back to the event's original language when that translation is missing.
    event_title = event.localized_title(language)
    order_lines = (
        "\n".join(f"- {item['name']} × {item['quantity']}" for item in (registration.order_items or []))
        or f"- {text['none']}"
    )
    calculated_due = sum(
        (
            Decimal(str(item["price"])) * max(0, int(item["quantity"]) - int(item.get("included_quantity") or 0))
            for item in (registration.order_items or [])
        ),
        Decimal("0"),
    )
    amount = registration.amount_due if registration.amount_due is not None else calculated_due
    amount_due = f"€{amount:.2f}"
    event_date = event.date.isoformat() if event.date is not None else "—"

    # Only worth showing when nobody's account already owns this booking —
    # an already-owned registration was placed by a signed-in caller, who
    # doesn't need pointing at a sign-in link for something already theirs.
    # Never a token/magic-link URL: the recipient proves ownership by
    # signing in, same as the confirm-first claim card on /me (#1044) this
    # points at — not by a credential embedded in this email.
    account_link_text = ""
    account_link_html = ""
    if registration.user_id is None:
        me_url = f"{settings.frontend_url.rstrip('/')}/me"
        account_link_text = f"\n{text['link_account']}\n{me_url}\n"
        safe_me_url = escape(me_url, quote=True)
        account_link_html = f'<p>{text["link_account"]}<br><a href="{safe_me_url}">{safe_me_url}</a></p>'

    message = EmailMessage()
    message["Subject"] = f"{text['subject']} {registration.id}"
    message["From"] = settings.smtp_from
    message["To"] = person.email
    message.set_content(
        f"{text['hello']} {person.name},\n\n{text['received']}\n\n"
        f"{text['reference']}: {registration.id}\n{text['event']}: {event_title}\n{text['date']}: {event_date}\n"
        f"{text['guests']}: {registration.guest_count}\n{text['due']}: {amount_due}\n{text['order']}:\n{order_lines}\n\n"
        f"{text['pass']}:\n{check_in_url}\n\n{text['keep']}\n{account_link_text}"
    )
    safe_name = escape(person.name)
    safe_event_title = escape(event_title)
    safe_check_in_url = escape(check_in_url, quote=True)
    html_order_lines = (
        "".join(
            f"<li>{escape(str(item['name']))} × {int(item['quantity'])}</li>"
            for item in (registration.order_items or [])
        )
        or f"<li>{text['none']}</li>"
    )
    message.add_alternative(
        "<html><body>"
        f"<p>{text['hello']} {safe_name},</p><p>{text['received']}</p>"
        f"<p><strong>{text['reference']}:</strong> {registration.id}<br>"
        f"<strong>{text['event']}:</strong> {safe_event_title}<br><strong>{text['date']}:</strong> {event_date}<br>"
        f"<strong>{text['guests']}:</strong> {registration.guest_count}<br><strong>{text['due']}:</strong> {amount_due}</p>"
        f"<p><strong>{text['order']}:</strong></p><ul>{html_order_lines}</ul>"
        f'<p><a href="{safe_check_in_url}">{text["pass"]}</a></p>'
        f'<p><img src="cid:registration-qr" alt="{text["qr"]}"></p>'
        f"{account_link_html}"
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


async def deliver_contact_notification(message_id: str) -> bool:
    """Load the persisted contact submission and send its durable outbox notification."""
    async with async_session_factory() as db:
        message = await db.get(ContactMessage, message_id)
        if message is None:
            logger.error("Contact notification resource missing for message_id=%s", message_id)
            return False
        return await send_contact_notification(
            name=message.name, email=message.email, message_text=message.message, message_id=message.id
        )


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


async def send_visitor_magic_link_email(
    email: str,
    token: str,
    request_id: str,
    expires_at: datetime,
) -> bool:
    """Send a passwordless sign-in link for the visitor "My orders" session (#953).

    The token goes in the ``?token=`` query string, matching how
    ``MyAccountPage`` (via ``MyRegistrationsPage``) already reads it
    (``useSearch({ from: "/me" })`` — a TanStack Router search param, not a
    URL fragment). The frontend removes it from browser history immediately
    on load (``navigate({ search: {}, replace: true })``, before the
    redemption network call) so a redeemed, single-use link never lingers
    somewhere it could be replayed from.
    """
    if not settings.smtp_host or not settings.smtp_from:
        logger.warning(
            "Visitor magic-link email not sent for request_id=%s because SMTP is not configured.",
            request_id,
        )
        return False

    link = f"{settings.frontend_url.rstrip('/')}/me?token={token}"

    message = EmailMessage()
    message["Subject"] = "Sign in to your Champagnefestival account"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        "Hello,\n\n"
        "Use the following secure link to sign in and view your Champagnefestival information:\n\n"
        f"{link}\n\n"
        f"This link expires at {expires_at.isoformat()} and can only be used once.\n"
        "If you did not request this email, you can ignore it.\n"
    )

    try:
        await asyncio.to_thread(_send_message_sync, message)
    except Exception:
        logger.exception(
            "Failed to send visitor magic-link email for request_id=%s.",
            request_id,
        )
        return False

    logger.info("Sent visitor magic-link email for request_id=%s.", request_id)
    return True


async def send_account_sign_in_email(email: str, request_id: str) -> bool:
    """Tell a Keycloak-linked address to use the account sign-in (#1209).

    Sent instead of an app magic link so a staff or volunteer account is never
    handed a roleless application session; no credential is included.
    """
    if not settings.smtp_host or not settings.smtp_from:
        logger.warning(
            "Account sign-in email not sent for request_id=%s because SMTP is not configured.",
            request_id,
        )
        return False

    message = EmailMessage()
    message["Subject"] = "Sign in to your Champagnefestival account"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        "Hello,\n\n"
        "This email address belongs to a Champagnefestival account. "
        "Open the link below and choose Sign in; you can use your password or "
        "request a sign-in link from the account page:\n\n"
        f"{settings.frontend_url.rstrip('/')}/me\n\n"
        "If you did not request this email, you can ignore it.\n"
    )
    try:
        await asyncio.to_thread(_send_message_sync, message)
    except Exception:
        logger.exception("Failed to send account sign-in email for request_id=%s.", request_id)
        return False
    logger.info("Sent account sign-in email for request_id=%s.", request_id)
    return True


def _send_message_sync(message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


async def deliver_organization_change_notification(change_id: str) -> bool:
    """Notify the snapshotted shared mailbox about one persisted submission."""
    from app.models import OrganizationChange

    async with async_session_factory() as db:
        change = await db.get(OrganizationChange, change_id)
        if change is None:
            return False
        recipient = change.notification_recipient
        if not recipient:
            return True
        if not settings.smtp_host or not settings.smtp_from:
            return False
        message = EmailMessage()
        message["Subject"] = "Champagnefestival: organisation change awaiting review"
        message["From"] = settings.smtp_from
        message["To"] = recipient
        message["Message-ID"] = f"<organization-change-{change.id}@champagnefestival>"
        message.set_content(
            f"Organisation {change.organization_id} submitted proposal {change.id}.\n"
            f"Review the pending changes in the admin Content page: {settings.frontend_url}/admin\n"
        )
        try:
            await asyncio.to_thread(_send_message_sync, message)
        except Exception:
            logger.exception("Failed to send organization proposal notification for change_id=%s", change_id)
            return False
        return True
