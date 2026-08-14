"""Shared FastAPI dependencies."""

from typing import Any, TypeVar

from fastapi import HTTPException, Query, Request, status
from sqlalchemy.sql import Select

SelectT = TypeVar("SelectT", bound=Select[Any])


def get_request_id(request: Request) -> str | None:
    """The request id set by ``app.observability``'s middleware, or ``None``.

    The ``getattr`` default guards contexts where that middleware didn't run
    (e.g. some test setups) rather than assuming ``request.state.request_id``
    always exists.
    """
    return getattr(request.state, "request_id", None)


class Pagination:
    """Optional page/limit pagination settings for list endpoints."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number used with limit"),
        limit: int | None = Query(None, ge=1, le=1000),
    ) -> None:
        if limit is None and page != 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="page parameter requires limit to be set",
            )
        self.page = page
        self.limit = limit


def apply_pagination(stmt: SelectT, pagination: Pagination) -> SelectT:
    """Apply offset/limit pagination only when a limit is provided."""
    if pagination.limit is not None:
        return stmt.offset((pagination.page - 1) * pagination.limit).limit(pagination.limit)
    return stmt
