"""Shared vocabulary for translated event content (#1222).

Kept free of ORM and schema imports so the models, request schemas and
services can all depend on it without a cycle.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal, get_args

Language = Literal["nl", "fr", "en"]
LANGUAGES: tuple[Language, ...] = get_args(Language)


def resolve_text(
    values: Mapping[str, str | None],
    original_language: str | None,
    locale: str | None,
) -> str:
    """The text for *locale*, else the original-language text, else ``""``.

    Mirrors the organisation fallback order (``organizationDescription.ts``): a
    blank translation never hides the original. *values* maps language code to
    text.
    """
    for language in (locale, original_language):
        text = values.get(language) if language else None
        if text and text.strip():
            return text
    return ""
