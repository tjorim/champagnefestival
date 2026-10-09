"""Tests for outgoing SMTP transport setup."""

from email.message import EmailMessage
from types import SimpleNamespace
from typing import cast

from app import email as email_module
from app.models import Event, Person, Registration


async def test_registration_confirmation_contains_reference_link_and_inline_qr(monkeypatch):
    sent = []
    monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email_module.settings, "smtp_from", "festival@example.com")
    monkeypatch.setattr(email_module.settings, "frontend_url", "https://festival.example")
    monkeypatch.setattr(email_module, "_send_message_sync", sent.append)
    registration = cast(
        Registration,
        SimpleNamespace(
            id="reg-123",
            check_in_token="secret-token",
            guest_count=2,
            amount_due=None,
            order_items=[],
            user_id=None,
        ),
    )
    person = cast(Person, SimpleNamespace(name="Alice", email="alice@example.com", preferred_language="en"))
    event = Event(title_language="nl", title_nl="Opening", title_en="Opening night")

    assert await email_module.send_registration_confirmation(registration, person, event) is True
    message = sent[0]
    assert "reg-123" in message.get_body(preferencelist=("plain",)).get_content()
    assert (
        "https://festival.example/check-in?id=reg-123#token=secret-token"
        in message.get_body(preferencelist=("plain",)).get_content()
    )
    qr_parts = [part for part in message.walk() if part.get_content_type() == "image/png"]
    assert len(qr_parts) == 1


def test_smtp_starttls_uses_certificate_verifying_context(monkeypatch):
    tls_context = object()
    smtp_instances = []

    class FakeSmtp:
        def __init__(self, host, port, timeout):
            self.starttls_context = None
            smtp_instances.append(self)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def ehlo(self):
            return None

        def starttls(self, *, context):
            self.starttls_context = context

        def send_message(self, message):
            return None

    monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email_module.settings, "smtp_port", 587)
    monkeypatch.setattr(email_module.settings, "smtp_user", "")
    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSmtp)
    monkeypatch.setattr(email_module.ssl, "create_default_context", lambda: tls_context)

    email_module._send_message_sync(EmailMessage())

    assert smtp_instances[0].starttls_context is tls_context


async def test_registration_confirmation_uses_preferred_language(monkeypatch):
    sent = []
    monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email_module.settings, "smtp_from", "festival@example.com")
    monkeypatch.setattr(email_module, "_send_message_sync", sent.append)
    registration = cast(
        Registration,
        SimpleNamespace(
            id="reg-fr", check_in_token="token", guest_count=1, amount_due=None, order_items=[], user_id=None
        ),
    )
    person = cast(Person, SimpleNamespace(name="Alice", email="alice@example.com", preferred_language="fr"))
    event = Event(title_language="nl", title_nl="Proeverij", title_fr="Dégustation")
    assert await email_module.send_registration_confirmation(registration, person, event) is True
    message = sent[0]
    assert message["Subject"].startswith("Inscription Champagnefestival")
    body = message.get_body(preferencelist=("plain",)).get_content()
    assert "Nous avons bien reçu votre inscription" in body
    assert "Dégustation" in body
    assert "Proeverij" not in body


async def test_registration_confirmation_titles_the_event_in_the_person_language(monkeypatch):
    sent = []
    monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email_module.settings, "smtp_from", "festival@example.com")
    monkeypatch.setattr(email_module, "_send_message_sync", sent.append)
    registration = cast(
        Registration,
        SimpleNamespace(
            id="reg-en", check_in_token="token", guest_count=1, amount_due=None, order_items=[], user_id=None
        ),
    )
    event = Event(title_language="nl", title_nl="Openingsavond", title_en="Opening night")
    for language, expected in (("en", "Opening night"), ("fr", "Openingsavond"), (None, "Openingsavond")):
        sent.clear()
        person = cast(Person, SimpleNamespace(name="Alice", email="alice@example.com", preferred_language=language))
        assert await email_module.send_registration_confirmation(registration, person, event) is True
        assert expected in sent[0].get_body(preferencelist=("plain",)).get_content()
        assert expected in sent[0].get_body(preferencelist=("html",)).get_content()


async def test_registration_confirmation_invites_sign_in_when_booking_is_unowned(monkeypatch):
    sent = []
    monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email_module.settings, "smtp_from", "festival@example.com")
    monkeypatch.setattr(email_module.settings, "frontend_url", "https://festival.example")
    monkeypatch.setattr(email_module, "_send_message_sync", sent.append)
    registration = cast(
        Registration,
        SimpleNamespace(
            id="reg-unowned",
            check_in_token="token",
            guest_count=1,
            amount_due=None,
            order_items=[],
            user_id=None,
        ),
    )
    person = cast(Person, SimpleNamespace(name="Alice", email="alice@example.com", preferred_language="en"))
    event = Event(title_language="nl", title_nl="Opening", title_en="Opening night")

    assert await email_module.send_registration_confirmation(registration, person, event) is True
    message = sent[0]
    plain = message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "https://festival.example/me" in plain
    assert "https://festival.example/me" in html
    assert "Already a member or volunteer?" in plain


async def test_registration_confirmation_omits_sign_in_invite_when_already_owned(monkeypatch):
    sent = []
    monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email_module.settings, "smtp_from", "festival@example.com")
    monkeypatch.setattr(email_module.settings, "frontend_url", "https://festival.example")
    monkeypatch.setattr(email_module, "_send_message_sync", sent.append)
    registration = cast(
        Registration,
        SimpleNamespace(
            id="reg-owned",
            check_in_token="token",
            guest_count=1,
            amount_due=None,
            order_items=[],
            user_id="usr-already-owns-it",
        ),
    )
    person = cast(Person, SimpleNamespace(name="Alice", email="alice@example.com", preferred_language="en"))
    event = Event(title_language="nl", title_nl="Opening", title_en="Opening night")

    assert await email_module.send_registration_confirmation(registration, person, event) is True
    message = sent[0]
    plain = message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "https://festival.example/me" not in plain
    assert "https://festival.example/me" not in html


async def test_shared_link_targets_account_page(monkeypatch):
    from datetime import UTC, datetime

    sent = []
    monkeypatch.setattr(email_module.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email_module.settings, "smtp_from", "festival@example.com")
    monkeypatch.setattr(email_module.settings, "frontend_url", "https://festival.example/")
    monkeypatch.setattr(email_module, "_send_message_sync", sent.append)
    assert await email_module.send_visitor_magic_link_email(
        "contact@example.com", "manager-secret", "request-id", datetime.now(UTC)
    )
    assert sent[0]["To"] == "contact@example.com"
    body = sent[0].get_content()
    assert "https://festival.example/me?token=manager-secret" in body
    assert "can only be used once" in body
    assert "Champagnefestival account" in sent[0]["Subject"]
