"""Admin (write) MCP tool implementations for edition management.

Mirrors ``app.routers.editions``. The edition response payload is built by
``_edition_payload`` (venue + exhibitor lookups, dates derived from events),
so ``get_edition``/``create_edition``/``update_edition`` reuse that helper
(and ``_get_edition_or_404``) directly rather than re-deriving it.

Partial-update convention differs slightly from strict REST ``model_fields_set``
semantics for ``exhibitors``: MCP tool kwargs can't distinguish "omitted" from
"explicitly null", so ``exhibitors=None`` always means "leave unchanged" here —
pass an explicit list (including ``[]``) to replace the lineup. See
``app/mcp/admin/__init__.py`` for the module-wide convention this follows.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select

from app.audit import write_audit_entry
from app.mcp.utils import as_value_error, validate_with_schema
from app.models import Edition
from app.routers.editions import (
    _edition_payload,
    _get_edition_or_404,
    _load_venue,
    _validate_co_organizer,
    _validate_exhibitor_ids,
    _validate_exhibitors_allowed,
)
from app.schemas import EditionCreate, EditionUpdate


async def create_edition(
    session_factory: Any,
    actor: str,
    *,
    id: str,
    year: int,
    month: str,
    venue_id: str,
    edition_type: str = "festival",
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
        existing = (await db.execute(select(Edition).where(Edition.id == body.id))).scalar_one_or_none()
        if existing is not None:
            raise ValueError(f"Edition '{body.id}' already exists.")

        try:
            await _load_venue(db, body.venue_id)
            _validate_exhibitors_allowed(body.edition_type, body.exhibitors)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        edition = Edition(
            id=body.id,
            year=body.year,
            month=body.month,
            venue_id=body.venue_id,
            edition_type=body.edition_type,
            exhibitors=list(body.exhibitors),
            co_organizer_exhibitor_id=body.co_organizer_exhibitor_id,
            active=body.active,
        )
        try:
            await _validate_exhibitor_ids(db, edition.exhibitors)
            await _validate_co_organizer(db, edition.co_organizer_exhibitor_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        db.add(edition)
        await write_audit_entry(
            db,
            actor=actor,
            action="edition_created",
            resource_type="edition",
            resource_id=edition.id,
            details={"year": edition.year, "month": edition.month, "edition_type": edition.edition_type},
        )
        await db.commit()
        try:
            edition = await _get_edition_or_404(db, edition.id)
            return await _edition_payload(db, edition, active_only=False)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def get_edition(session_factory: Any, edition_id: str) -> dict:
    async with session_factory() as db:
        try:
            edition = await _get_edition_or_404(db, edition_id)
            return await _edition_payload(db, edition, active_only=False)
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
    edition_type: str | None = None,
    exhibitors: list[int] | None = None,
    co_organizer_exhibitor_id: int | None = None,
    clear_co_organizer: bool = False,
    active: bool | None = None,
) -> dict:
    """Partially update an edition.

    ``exhibitors=None`` means "leave the lineup unchanged"; pass an explicit list
    (including ``[]``) to replace it. Changing ``edition_type`` away from
    ``"festival"`` without an explicit ``exhibitors`` payload silently clears the
    now-invalid lineup, matching ``app.routers.editions.update_edition``.

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
        provided["co_organizer_exhibitor_id"] = None
    body = validate_with_schema(EditionUpdate, **provided)

    async with session_factory() as db:
        try:
            edition = await _get_edition_or_404(db, edition_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        if "co_organizer_exhibitor_id" in body.model_fields_set:
            try:
                await _validate_co_organizer(db, body.co_organizer_exhibitor_id)
            except HTTPException as exc:
                raise as_value_error(exc) from exc
            edition.co_organizer_exhibitor_id = body.co_organizer_exhibitor_id

        for field in ("year", "month", "active", "edition_type"):
            if field in body.model_fields_set:
                setattr(edition, field, getattr(body, field))

        if "venue_id" in body.model_fields_set and body.venue_id is not None:
            try:
                await _load_venue(db, body.venue_id)
            except HTTPException as exc:
                raise as_value_error(exc) from exc
            edition.venue_id = body.venue_id

        if "exhibitors" in body.model_fields_set and body.exhibitors is not None:
            try:
                _validate_exhibitors_allowed(edition.edition_type, body.exhibitors)  # ty: ignore[invalid-argument-type]
                await _validate_exhibitor_ids(db, body.exhibitors)
            except HTTPException as exc:
                raise as_value_error(exc) from exc
            edition.exhibitors = list(body.exhibitors)
        elif edition.edition_type != "festival" and edition.exhibitors:
            # The edition type changed away from festival without an explicit exhibitors
            # payload — clear the now-invalid associations as part of the same update
            # instead of rejecting it, mirroring the router.
            edition.exhibitors = []

        try:
            _validate_exhibitors_allowed(edition.edition_type, edition.exhibitors)  # ty: ignore[invalid-argument-type]
        except HTTPException as exc:
            raise as_value_error(exc) from exc

        await write_audit_entry(
            db,
            actor=actor,
            action="edition_updated",
            resource_type="edition",
            resource_id=edition.id,
            details={"fields_changed": sorted(body.model_fields_set)},
        )
        await db.commit()
        try:
            edition = await _get_edition_or_404(db, edition.id)
            return await _edition_payload(db, edition, active_only=False)
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def delete_edition(session_factory: Any, actor: str, edition_id: str) -> dict:
    async with session_factory() as db:
        try:
            edition = await _get_edition_or_404(db, edition_id)
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
