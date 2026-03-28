"""Shared FastAPI dependencies."""

from typing import Any, TypeVar, cast

from fastapi import Query
from sqlalchemy.sql import Select

SelectT = TypeVar("SelectT", bound=Select[Any])


class Pagination:
    """Optional page/limit pagination settings for list endpoints."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number used with limit"),
        limit: int | None = Query(None, ge=1, le=1000),
    ) -> None:
        self.page = page
        self.limit = limit


def apply_pagination(stmt: SelectT, pagination: Pagination) -> SelectT:
    """Apply offset/limit pagination only when a limit is provided."""
    if pagination.limit is not None:
        return cast(SelectT, stmt.offset((pagination.page - 1) * pagination.limit).limit(pagination.limit))
    return stmt
