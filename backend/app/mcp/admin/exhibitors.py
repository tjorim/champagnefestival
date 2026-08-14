"""Admin (write) MCP tool implementations for exhibitor management.

Mirrors ``app.routers.exhibitors``. Business logic lives in
``app.services.exhibitors_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.mcp.utils import MCPToolError, get_or_error, validate_with_schema
from app.models import Exhibitor
from app.schemas import ExhibitorCreate, ExhibitorUpdate
from app.services import exhibitors_service
from app.services.errors import ServiceError
from app.utils import exhibitor_to_dict


async def create_exhibitor(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    image: str = "",
    website: str = "",
    active: bool = True,
    type: str = "vendor",
    contact_person_id: str | None = None,
) -> dict:
    body = validate_with_schema(
        ExhibitorCreate,
        name=name,
        image=image,
        website=website,
        active=active,
        type=type,
        contact_person_id=contact_person_id,
    )
    async with session_factory() as db:
        try:
            return await exhibitors_service.create_exhibitor(db, body=body, actor=actor)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def get_exhibitor(session_factory: Any, exhibitor_id: int) -> dict:
    async with session_factory() as db:
        e = await get_or_error(db, Exhibitor, exhibitor_id, f"Exhibitor '{exhibitor_id}' not found.")
        contact = await exhibitors_service.load_contact(db, e.contact_person_id)
        return exhibitor_to_dict(e, contact)


async def list_exhibitors(session_factory: Any, exhibitor_type: str | None = None) -> dict:
    async with session_factory() as db:
        stmt = select(Exhibitor).order_by(Exhibitor.id)
        if exhibitor_type is not None:
            stmt = stmt.where(Exhibitor.type == exhibitor_type)
        result = await db.execute(stmt)
        exhibitors = result.scalars().all()
        person_ids = [e.contact_person_id for e in exhibitors if e.contact_person_id]
        contacts = await exhibitors_service.load_contacts_by_ids(db, person_ids)
        return {
            "exhibitors": [
                exhibitor_to_dict(e, contacts.get(e.contact_person_id) if e.contact_person_id else None)
                for e in exhibitors
            ]
        }


async def update_exhibitor(
    session_factory: Any,
    actor: str,
    exhibitor_id: int,
    *,
    name: str | None = None,
    image: str | None = None,
    website: str | None = None,
    active: bool | None = None,
    type: str | None = None,
    contact_person_id: str | None = None,
    clear_contact_person: bool = False,
) -> dict:
    provided = {
        k: v
        for k, v in {
            "name": name,
            "image": image,
            "website": website,
            "active": active,
            "type": type,
            "contact_person_id": contact_person_id,
        }.items()
        if v is not None
    }
    body = validate_with_schema(ExhibitorUpdate, **provided)
    async with session_factory() as db:
        e = await get_or_error(db, Exhibitor, exhibitor_id, f"Exhibitor '{exhibitor_id}' not found.")
        try:
            return await exhibitors_service.apply_exhibitor_update(
                db, e, body, actor=actor, clear_contact_person=clear_contact_person
            )
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_exhibitor(session_factory: Any, actor: str, exhibitor_id: int) -> dict:
    async with session_factory() as db:
        e = await get_or_error(db, Exhibitor, exhibitor_id, f"Exhibitor '{exhibitor_id}' not found.")
        return await exhibitors_service.delete_exhibitor(db, e, actor=actor)
