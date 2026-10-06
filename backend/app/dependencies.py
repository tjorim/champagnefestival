"""Shared FastAPI dependencies."""

from typing import Any, Literal

from fastapi import HTTPException, Query, Request, status
from sqlalchemy.sql import Select


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


def apply_pagination[SelectT: Select[Any]](stmt: SelectT, pagination: Pagination) -> SelectT:
    """Apply offset/limit pagination only when a limit is provided."""
    if pagination.limit is not None:
        return stmt.offset((pagination.page - 1) * pagination.limit).limit(pagination.limit)
    return stmt


# One default page size for every list endpoint on the shared paged contract
# (`ListQuery`), whether or not `q` is set: an admin paging a table gets one
# predictable page size instead of "20 when searching, unbounded when not". An
# omitted `limit` is never unbounded. The ceiling is not
# app.services.operational_search.MAX_RESULT_LIMIT (50): that is sized for the
# volunteer door-lookup use case (one guest at a time), not an admin browsing or
# exporting a full list.
DEFAULT_LIST_LIMIT = 50
MAX_LIST_LIMIT = 1000

SortDirection = Literal["asc", "desc"]


class ListQuery:
    """The shared paged list contract: ``q``, ``page``, ``limit`` and ``sort_dir``.

    Responses are ``{items, total, limit, page}`` where ``total`` counts every
    row matching the filters. ``sort`` is declared by each endpoint, because the
    sortable columns differ per resource; declaring it as a ``Literal`` makes an
    unknown key a 422 instead of a silent fallback, and ``sort_dir`` is only used
    together with ``sort``.
    """

    def __init__(
        self,
        q: str | None = Query(default=None, description="Search text; whitespace-only is treated as omitted"),
        page: int = Query(1, ge=1, description="1-based page number"),
        limit: int = Query(
            DEFAULT_LIST_LIMIT,
            ge=1,
            le=MAX_LIST_LIMIT,
            description=f"Page size (default {DEFAULT_LIST_LIMIT}, max {MAX_LIST_LIMIT})",
        ),
        sort_dir: SortDirection = Query("asc", description="Sort direction, used only with `sort`"),
    ) -> None:
        self.q = q.strip() if q and q.strip() else None
        self.page = page
        self.limit = limit
        self.sort_dir: SortDirection = sort_dir

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit

    def apply[SelectT: Select[Any]](self, stmt: SelectT) -> SelectT:
        """Apply this page's offset and limit to an already-ordered statement."""
        return stmt.offset(self.offset).limit(self.limit)

    def envelope(self, items: list[Any], total: int) -> dict[str, Any]:
        return {"items": items, "total": total, "limit": self.limit, "page": self.page}
