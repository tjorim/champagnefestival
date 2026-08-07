"""Admin (write) MCP tool implementations for exhibitor management.

Mirrors ``app.routers.exhibitors``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.mcp.utils import get_or_error, validate_with_schema
from app.models import Edition, Exhibitor, Person
from app.routers.exhibitors import _editions_linking
from app.schemas import ExhibitorCreate, ExhibitorUpdate
from app.utils import exhibitor_to_dict


async def _load_contact(db: AsyncSession, person_id: str | None) -> Person | None:
    if not person_id:
        return None
    result = await db.execute(select(Person).where(Person.id == person_id))
    return result.scalar_one_or_none()


async def _load_contacts_by_ids(db: AsyncSession, ids: list[str]) -> dict[str, Person]:
    if not ids:
        return {}
    result = await db.execute(select(Person).where(Person.id.in_(ids)))
    return {p.id: p for p in result.scalars().all()}


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
        contact = await _load_contact(db, body.contact_person_id)
        if body.contact_person_id and contact is None:
            raise ValueError("Person not found.")
        e = Exhibitor(
            name=body.name,
            image=body.image,
            website=body.website,
            active=body.active,
            type=body.type,
            contact_person_id=body.contact_person_id,
        )
        db.add(e)
        await db.flush()
        await write_audit_entry(
            db,
            actor=actor,
            action="exhibitor_created",
            resource_type="exhibitor",
            resource_id=str(e.id),
            details={"name": e.name, "type": e.type},
        )
        await db.commit()
        await db.refresh(e)
        return exhibitor_to_dict(e, contact)


async def get_exhibitor(session_factory: Any, exhibitor_id: int) -> dict:
    async with session_factory() as db:
        e = await get_or_error(db, Exhibitor, exhibitor_id, f"Exhibitor '{exhibitor_id}' not found.")
        contact = await _load_contact(db, e.contact_person_id)
        return exhibitor_to_dict(e, contact)


async def list_exhibitors(session_factory: Any, exhibitor_type: str | None = None) -> dict:
    async with session_factory() as db:
        stmt = select(Exhibitor).order_by(Exhibitor.id)
        if exhibitor_type is not None:
            stmt = stmt.where(Exhibitor.type == exhibitor_type)
        result = await db.execute(stmt)
        exhibitors = result.scalars().all()
        person_ids = [e.contact_person_id for e in exhibitors if e.contact_person_id]
        contacts = await _load_contacts_by_ids(db, person_ids)
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
        if body.name is not None:
            e.name = body.name
        if body.image is not None:
            e.image = body.image
        if body.website is not None:
            e.website = body.website
        if body.active is not None:
            e.active = body.active
        if body.type is not None:
            if body.type == "vendor" and e.type != "vendor":
                # Lock this exhibitor row so a concurrent edition update that's
                # about to link it to a lineup can't interleave with this
                # retype and leave a vendor exhibitor linked to an edition.
                await db.execute(select(Exhibitor.id).where(Exhibitor.id == exhibitor_id).with_for_update())
                linked = await _editions_linking(db, exhibitor_id)
                if linked:
                    raise ValueError(
                        "Cannot change this exhibitor to a vendor while editions still link to it: "
                        f"{', '.join(linked)}. Remove it from those editions first."
                    )
            e.type = body.type

        fields_changed = set(body.model_fields_set)
        if clear_contact_person:
            e.contact_person_id = None
            fields_changed.add("contact_person_id")
        elif "contact_person_id" in body.model_fields_set:
            if body.contact_person_id is not None:
                contact_check = await _load_contact(db, body.contact_person_id)
                if contact_check is None:
                    raise ValueError("Person not found.")
            e.contact_person_id = body.contact_person_id

        await write_audit_entry(
            db,
            actor=actor,
            action="exhibitor_updated",
            resource_type="exhibitor",
            resource_id=str(e.id),
            details={"fields_changed": sorted(fields_changed)},
        )
        await db.commit()
        await db.refresh(e)
        contact = await _load_contact(db, e.contact_person_id)
        return exhibitor_to_dict(e, contact)


async def delete_exhibitor(session_factory: Any, actor: str, exhibitor_id: int) -> dict:
    async with session_factory() as db:
        e = await get_or_error(db, Exhibitor, exhibitor_id, f"Exhibitor '{exhibitor_id}' not found.")
        editions_result = await db.execute(select(Edition))
        for edition in editions_result.scalars().all():
            if exhibitor_id in edition.exhibitors:
                edition.exhibitors = [eid for eid in edition.exhibitors if eid != exhibitor_id]
        await db.delete(e)
        await write_audit_entry(
            db,
            actor=actor,
            action="exhibitor_deleted",
            resource_type="exhibitor",
            resource_id=str(exhibitor_id),
            details={},
        )
        await db.commit()
        return {"deleted": True, "id": exhibitor_id}
