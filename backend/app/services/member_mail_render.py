"""Plain-text rendering of one composed member mail in the recipient's language (#1407)."""

from __future__ import annotations

from app.composer_content import pick_locale_text
from app.models import ComposedMessage, EmailCategory

_FOOTER = {
    "nl": "Je ontvangt dit bericht omdat je je hebt aangemeld voor “{category}”.\nAfmelden: {url}",
    "fr": "Vous recevez ce message car vous vous êtes inscrit(e) à « {category} ».\nSe désabonner : {url}",
    "en": "You are receiving this message because you signed up for “{category}”.\nUnsubscribe: {url}",
}


def render_member_mail(
    message: ComposedMessage, category: EmailCategory, locale: str | None, unsubscribe_url: str
) -> tuple[str, str] | None:
    """``(subject, text)`` in *locale* (Dutch when that language lacks a title or body), or ``None``
    when the message has no usable text. The footer carries the visible unsubscribe link."""
    language = locale if locale in _FOOTER else "nl"
    text = pick_locale_text(message, language)
    if text is None:
        return None
    subject, body = text
    return subject, compose_text(body, message.link_url, category, language, unsubscribe_url)


def compose_text(
    body: str, link_url: str | None, category: EmailCategory, locale: str | None, unsubscribe_url: str
) -> str:
    """Body, optional link and the translated footer with the visible unsubscribe link."""
    language = locale if locale in _FOOTER else "nl"
    parts = [body]
    if link_url:
        parts.append(link_url)
    parts.append(_FOOTER[language].format(category=category.localized_name(language), url=unsubscribe_url))
    return "\n\n".join(parts) + "\n"
