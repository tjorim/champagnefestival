"""Tests for outgoing SMTP transport setup."""

from email.message import EmailMessage

from app import email as email_module


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
