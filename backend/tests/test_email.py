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
        ),
    )
    person = cast(Person, SimpleNamespace(name="Alice", email="alice@example.com"))
    event = cast(Event, SimpleNamespace(title="Opening", date=None))

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
