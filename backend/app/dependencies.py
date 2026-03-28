"""Shared FastAPI dependencies."""

from fastapi import Query


class Pagination:
    """Optional page/limit pagination settings for list endpoints."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number used with limit"),
        limit: int | None = Query(None, ge=1, le=1000),
    ) -> None:
        self.page = page
        self.limit = limit


def apply_pagination(stmt, pagination: Pagination):
    """Apply offset/limit pagination only when a limit is provided."""
    if pagination.limit is not None:
        return stmt.offset((pagination.page - 1) * pagination.limit).limit(pagination.limit)
    return stmt
