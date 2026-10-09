"""Shared vocabulary for translated content (#1222).

Content that visitors read (event titles, FAQ items, announcements, products, ...)
is stored once per language with one *original* language: the original must have
text, the other languages are optional translations, and a missing translation
falls back to the original instead of hiding the content.

Kept free of ORM and schema imports so the models, request schemas and
services can all depend on it without a cycle.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal, get_args

Language = Literal["nl", "fr", "en"]
LANGUAGES: tuple[Language, ...] = get_args(Language)

DEFAULT_ORIGINAL_LANGUAGE: Language = "en"
"""Original language assumed by the REST and MCP create calls when none is given.
Scripts and agents work best in English; the admin form still defaults to Dutch
for the editors, and rows that predate translations were migrated as Dutch."""


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


def resolve_pair(
    first: Mapping[str, str | None],
    second: Mapping[str, str | None],
    original_language: str | None,
    locale: str | None,
) -> tuple[str, str]:
    """Like ``resolve_text`` for two texts that belong together (a question and
    its answer, a title and its body): a language is used only when *both* have
    text there, so a half-translated pair never mixes languages."""
    for language in (locale, original_language):
        if language and (first.get(language) or "").strip() and (second.get(language) or "").strip():
            return first[language] or "", second[language] or ""
    return "", ""
