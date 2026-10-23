"""Python versions of the PostgreSQL functions the application calls, for SQLite.

Registered on every SQLite connection by :mod:`app.sqlite_compat` (local development and the
test suite only; production is PostgreSQL). They follow the extension each one comes from:

* ``unaccent`` (the ``unaccent`` extension)
* ``similarity`` and ``word_similarity`` (``pg_trgm``)
* ``levenshtein_less_equal`` (``fuzzystrmatch``)
* ``greatest`` and ``json_extract_path_text`` (core PostgreSQL)

and the two helpers the person search trigger uses, mirroring
``update_person_operational_search_values`` in :mod:`app.operational_search_schema`.
"""

from __future__ import annotations

import json
import unicodedata
from typing import Any

# What PostgreSQL's unaccent rules map beyond combining marks (ligatures and stroked letters).
_UNACCENT_EXTRA = str.maketrans(
    {"œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE", "ø": "o", "Ø": "O", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ß": "ss"}
)
_GERMAN_FOLDS = (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss"))


def unaccent(value: str | None) -> str | None:
    if value is None:
        return None
    decomposed = unicodedata.normalize("NFKD", value.translate(_UNACCENT_EXTRA))
    return "".join(character for character in decomposed if not unicodedata.combining(character))


def _alnum_words(value: str) -> list[str]:
    """Split on runs of non-alphanumeric characters, like ``regexp_replace(.., '[^[:alnum:]]+', ' ')``."""
    return "".join(character if character.isalnum() else " " for character in value).split()


def search_name(value: str | None) -> str | None:
    """``trim(regexp_replace(lower(unaccent(name)), '[^[:alnum:]]+', ' ', 'g'))``."""
    if value is None:
        return None
    return " ".join(_alnum_words((unaccent(value) or "").lower()))


def search_name_alt(value: str | None) -> str | None:
    """The same with German umlauts spelled out (ä to ae) before unaccenting."""
    if value is None:
        return None
    folded = value.lower()
    for source, target in _GERMAN_FOLDS:
        folded = folded.replace(source, target)
    return search_name(folded)


def _trigrams(value: str) -> list[str]:
    """pg_trgm's trigrams of *value*, in order: each lower-cased word padded with two spaces before and one after."""
    result: list[str] = []
    for word in _alnum_words(value.lower()):
        padded = f"  {word} "
        result.extend(padded[i : i + 3] for i in range(len(padded) - 2))
    return result


def similarity(left: str | None, right: str | None) -> float | None:
    if left is None or right is None:
        return None
    a, b = set(_trigrams(left)), set(_trigrams(right))
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)


def word_similarity(query: str | None, text: str | None) -> float | None:
    """Greatest similarity between *query*'s trigrams and any continuous extent of *text*'s trigrams."""
    if query is None or text is None:
        return None
    wanted = set(_trigrams(query))
    ordered = _trigrams(text)
    if not wanted or not ordered:
        return 0.0
    best = 0.0
    for start in range(len(ordered)):
        found: set[str] = set()
        for end in range(start, len(ordered)):
            if ordered[end] in wanted:
                found.add(ordered[end])
            extent = end - start + 1
            best = max(best, len(found) / (len(wanted) + extent - len(found)))
    return best


def levenshtein_less_equal(left: str | None, right: str | None, max_distance: int) -> int | None:
    """The edit distance, or any value above *max_distance* once it is exceeded."""
    if left is None or right is None:
        return None
    if abs(len(left) - len(right)) > max_distance:
        return max_distance + 1
    previous = list(range(len(right) + 1))
    for i, left_character in enumerate(left, start=1):
        current = [i]
        for j, right_character in enumerate(right, start=1):
            current.append(
                min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left_character != right_character))
            )
        if min(current) > max_distance:
            return max_distance + 1
        previous = current
    return previous[-1]


def greatest(*values: Any) -> Any:
    """PostgreSQL's ``greatest``: NULLs are ignored, and the result is NULL only if every argument is."""
    present = [value for value in values if value is not None]
    return max(present) if present else None


def json_extract_path_text(document: str | None, *path: str) -> str | None:
    """The value at *path* of a JSON document as text; NULL when missing or JSON null."""
    if document is None:
        return None
    node: Any = json.loads(document) if isinstance(document, str) else document
    for step in path:
        if isinstance(node, dict) and step in node:
            node = node[step]
        elif isinstance(node, list) and step.lstrip("-").isdigit() and -len(node) <= int(step) < len(node):
            node = node[int(step)]
        else:
            return None
    if node is None:
        return None
    return node if isinstance(node, str) else json.dumps(node, separators=(",", ":"))
