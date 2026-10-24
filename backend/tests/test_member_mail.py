"""Fail-closed member-mail transport boundary (#1407)."""

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.member_mail import MemberMail, get_member_mail_provider


def make_mail(**overrides):
    return MemberMail.model_validate(
        {
            "delivery_key": "composer:cmp_1:per_1",
            "category_key": "club_news",
            "recipient": "member@example.org",
            "sender": "club@example.org",
            "subject": "Clubnieuws",
            "text": "Nieuws voor leden.",
            "unsubscribe_url": "https://festival.example.org/api/mail/unsubscribe?token=signed",
            **overrides,
        }
    )


async def test_transactional_smtp_configuration_cannot_enable_member_mail(monkeypatch):
    # The disabled adapter must never even attempt transactional SMTP.
    def fail_smtp(*args, **kwargs):
        pytest.fail("Member mail attempted SMTP")

    monkeypatch.setattr("smtplib.SMTP", fail_smtp)
    config = Settings(_env_file=None, smtp_host="smtp.example.org", smtp_from="bookings@example.org")
    result = await get_member_mail_provider(config).send(make_mail())
    assert result.status == "disabled"
    assert result.provider_message_id is None


def test_unimplemented_provider_rejected():
    with pytest.raises(ValidationError):
        Settings.model_validate({"member_mail_provider": "smtp"})


def test_mutated_configuration_fails_closed():
    config = Settings(_env_file=None).model_copy(update={"member_mail_provider": "smtp"})
    with pytest.raises(ValueError, match="Unsupported"):
        get_member_mail_provider(config)


def test_mime_contains_only_one_recipient_and_one_click_headers():
    mail = make_mail()
    message = mail.as_message()
    assert str(message["To"]) == "member@example.org"
    assert str(message["From"]) == "club@example.org"
    assert str(message["List-Unsubscribe"]) == f"<{mail.unsubscribe_url}>"
    assert str(message["List-Unsubscribe-Post"]) == "List-Unsubscribe=One-Click"
    assert message.get_content().strip() == mail.text
    assert message["Cc"] is None
    assert message["Bcc"] is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"recipient": "a@example.org,b@example.org"},
        {"sender": "club@example.org\r\nBcc: other@example.org"},
        {"subject": "News\nBcc: other@example.org"},
        {"unsubscribe_url": "http://festival.example.org/unsubscribe"},
        {"unsubscribe_url": "https://user:password@festival.example.org/unsubscribe"},
        {"unsubscribe_url": "https://festival.example.org/unsubscribe#token"},
        {"delivery_key": ""},
        {"category_key": ""},
    ],
)
def test_invalid_envelopes_rejected(overrides):
    with pytest.raises(ValidationError):
        make_mail(**overrides)
