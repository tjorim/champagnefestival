"""Shared vocabulary for translated content (#1222).

Content that visitors read (event titles, FAQ items, announcements, products, ...)
is stored once per language. Dutch is the base language: the vzw and the festival
venue are in Flanders, so Dutch text is always required, French and English are
optional translations, and a missing translation falls back to Dutch instead of
hiding the content.

Kept free of ORM and schema imports so the models, request schemas and
services can all depend on it without a cycle.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal, get_args

Language = Literal["nl", "fr", "en"]
LANGUAGES: tuple[Language, ...] = get_args(Language)

BASE_LANGUAGE: Language = "nl"
"""The language every translated text must have; what a missing translation falls back to."""


def resolve_text(values: Mapping[str, str | None], locale: str | None) -> str:
    """The text for *locale*, else the Dutch text, else ``""``.

    Mirrors the organisation fallback order (``organizationDescription.ts``): a
    blank translation never hides the Dutch text. *values* maps language code to
    text.
    """
    for language in (locale, BASE_LANGUAGE):
        text = values.get(language) if language else None
        if text and text.strip():
            return text
    return ""


def resolve_pair(
    first: Mapping[str, str | None], second: Mapping[str, str | None], locale: str | None
) -> tuple[str, str]:
    """Like ``resolve_text`` for two texts that belong together (a question and
    its answer, a title and its body): a language is used only when *both* have
    text there, so a half-translated pair never mixes languages."""
    for language in (locale, BASE_LANGUAGE):
        if language and (first.get(language) or "").strip() and (second.get(language) or "").strip():
            return first[language] or "", second[language] or ""
    return "", ""
