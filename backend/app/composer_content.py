"""Shared composer localization and serialized Web Push payload validation."""

import json

from app.push import _MAX_PAYLOAD_BYTES

LOCALES = ("nl", "en", "fr")


def pick_locale_text(message: object, locale: str) -> tuple[str, str] | None:
    """Prefer the requested complete pair, then Dutch, English, and French."""
    for candidate in dict.fromkeys((locale, *LOCALES)):
        title = getattr(message, f"title_{candidate}", None)
        body = getattr(message, f"body_{candidate}", None)
        if title and body:
            return title, body
    return None


def build_composer_payload(title: str, body: str) -> str:
    payload = json.dumps({"title": title, "body": body})
    if len(payload.encode("utf-8")) > _MAX_PAYLOAD_BYTES:
        raise ValueError("Composed Web Push payload exceeds the maximum size.")
    return payload
