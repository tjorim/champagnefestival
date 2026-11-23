"""Build SQL CHECK constraints from application vocabularies."""

from enum import StrEnum
from typing import get_args

from sqlalchemy import CheckConstraint


def vocabulary_check(name: str, expression: str, vocabulary: object) -> CheckConstraint:
    # The expression and allowed strings are source-controlled schema definitions.
    members = (
        tuple(vocabulary) if isinstance(vocabulary, type) and issubclass(vocabulary, StrEnum) else get_args(vocabulary)
    )
    values = ", ".join("'" + value.replace("'", "''") + "'" for value in members)
    return CheckConstraint(f"{expression} IN ({values})", name=name)
