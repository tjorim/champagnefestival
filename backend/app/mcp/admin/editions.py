"""Admin (write) MCP tool implementations for edition management.

Mirrors ``app.routers.editions``. Business logic — the create/update
transition, payload building, and shared lookup/validation helpers — lives in
``app.services.editions_service`` and is shared with the REST router; this
module is responsible only for validating MCP kwargs into a schema instance
and translating ``HTTPException`` into ``MCPToolError`` at its own boundary.

Partial-update convention differs slightly from strict REST ``model_fields_set``
semantics for ``exhibitors``: MCP tool kwargs can't distinguish "omitted" from
"explicitly null", so ``exhibitors=None`` always means "leave unchanged" here —
pass an explicit list (including ``[]``) to replace the lineup. See
``app/mcp/admin/__init__.py`` for the module-wide convention this follows.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.audit import write_audit_entry
from app.mcp.utils import MCPToolError, as_value_error, validate_with_schema
from app.schemas import EditionCreate, EditionType, EditionUpdate
from app.services import editions_service


async def create_edition(
    session_factory: Any,
    actor: str,
    *,
    id: str,
    year: int,
    month: str,
    venue_id: str,
    edition_type: EditionType = "festival",
    exhibitors: list[int] | None = None,
    co_organizer_exhibitor_id: int | None = None,
    active: bool = True,
) -> dict:
    """Create an edition. ``exhibitors=None`` is treated as an empty lineup (``[]``),
    matching the REST ``EditionCreate`` schema's default."""
    body = validate_with_schema(
        EditionCreate,
        id=id,
        year=year,
        month=month,
        venue_id=venue_id,
        edition_type=edition_type,
        exhibitors=exhibitors if exhibitors is not None else [],
        co_organizer_exhibitor_id=co_organizer_exhibitor_id,
        active=active,
    )
    async with session_factory() as db:
        try:
            return await editions_service.create_edition(db, body=body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def get_edition(session_factory: Any, edition_id: str) -> dict:
    async with session_factory() as db:
        try:
            edition = await editions_service.get_edition_or_404(db, edition_id)
            return await editions_service.edition_payload(db, edition, active_only=False)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def update_edition(
    session_factory: Any,
    actor: str,
    edition_id: str,
    *,
    year: int | None = None,
    month: str | None = None,
    venue_id: str | None = None,
    edition_type: EditionType | None = None,
    exhibitors: list[int] | None = None,
    co_organizer_exhibitor_id: int | None = None,
    clear_co_organizer: bool = False,
    active: bool | None = None,
) -> dict:
    """Partially update an edition.

    ``exhibitors=None`` means "leave the lineup unchanged"; pass an explicit list
    (including ``[]``) to replace it. Changing ``edition_type`` away from
    ``"festival"`` without an explicit ``exhibitors`` payload silently clears the
    now-invalid lineup, matching ``app.services.editions_service.apply_edition_update``.

    ``co_organizer_exhibitor_id`` has no natural "clear" sentinel (an unset kwarg
    already means "leave unchanged"), so pass ``clear_co_organizer=True`` to unset
    it instead.
    """
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "year": year,
            "month": month,
            "venue_id": venue_id,
            "edition_type": edition_type,
            "exhibitors": exhibitors,
            "co_organizer_exhibitor_id": co_organizer_exhibitor_id,
            "active": active,
        }.items()
        if v is not None
    }
    if clear_co_organizer:
        if co_organizer_exhibitor_id is not None:
            raise MCPToolError("Pass either co_organizer_exhibitor_id or clear_co_organizer, not both.")
        provided["co_organizer_exhibitor_id"] = None
    body = validate_with_schema(EditionUpdate, **provided)

    async with session_factory() as db:
        try:
            edition = await editions_service.get_edition_or_404(db, edition_id)
            return await editions_service.apply_edition_update(db, edition, body, actor=actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_edition(session_factory: Any, actor: str, edition_id: str) -> dict:
    async with session_factory() as db:
        try:
            edition = await editions_service.get_edition_or_404(db, edition_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        await db.delete(edition)
        await write_audit_entry(
            db,
            actor=actor,
            action="edition_deleted",
            resource_type="edition",
            resource_id=edition_id,
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": edition_id}
