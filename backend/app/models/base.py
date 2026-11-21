"""Helpers shared by the model modules."""

from __future__ import annotations

from datetime import UTC, datetime


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _optional_dutch_check(column: str) -> str:
    """SQL that an optional per-language text has Dutch text whenever it has any text at all."""
    return f"(({column}_fr IS NULL AND {column}_en IS NULL) OR length(trim({column}_nl)) > 0) IS TRUE"
