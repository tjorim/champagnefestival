"""Shared composer localization and serialized Web Push payload validation."""

import json

from app.push import _MAX_PAYLOAD_BYTES
from app.translations import resolve_pair

LOCALES = ("nl", "en", "fr")


def pick_locale_text(message: object, locale: str) -> tuple[str, str] | None:
    """The (title, body) for *locale*: that language when its title and body are
    both filled, otherwise the message's original language."""
    title, body = resolve_pair(
        {code: getattr(message, f"title_{code}", None) for code in LOCALES},
        {code: getattr(message, f"body_{code}", None) for code in LOCALES},
        getattr(message, "text_language", None),
        locale,
    )
    return (title, body) if title and body else None


def build_composer_payload(title: str, body: str) -> str:
    payload = json.dumps({"title": title, "body": body})
    if len(payload.encode("utf-8")) > _MAX_PAYLOAD_BYTES:
        raise ValueError("Composed Web Push payload exceeds the maximum size.")
    return payload
