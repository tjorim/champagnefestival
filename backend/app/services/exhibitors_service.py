"""Shared application-service operations for exhibitors.

Used by both ``app.routers.exhibitors`` (REST) and ``app.mcp.admin.exhibitors``
(MCP) so contact-person resolution, the vendor-retype-vs-linked-editions guard,
and audit-detail assembly live in exactly one place instead of two copies
(#860). Follows the ``ServiceError`` convention in ``app/services/errors.py``:
each adapter fetches the row with its own idiomatic 404 helper (``get_or_404``
for REST, ``get_or_error`` for MCP) and passes it in, then translates a raised
``ServiceError`` at its own boundary.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Edition, Exhibitor, Person
from app.schemas import ExhibitorCreate, ExhibitorUpdate
from app.services.errors import ConflictError, NotFoundError
from app.utils import exhibitor_to_dict


async def editions_linking(db: AsyncSession, exhibitor_id: int) -> list[str]:
    """Ids of editions whose exhibitor list still contains this exhibitor."""
    result = await db.execute(select(Edition))
    return sorted(edition.id for edition in result.scalars().all() if exhibitor_id in edition.exhibitors)


async def load_contact(db: AsyncSession, person_id: str | None) -> Person | None:
    if not person_id:
        return None
    result = await db.execute(select(Person).where(Person.id == person_id))
    return result.scalar_one_or_none()


async def load_contacts_by_ids(db: AsyncSession, ids: list[str]) -> dict[str, Person]:
    if not ids:
        return {}
    result = await db.execute(select(Person).where(Person.id.in_(ids)))
    return {p.id: p for p in result.scalars().all()}


async def create_exhibitor(
    db: AsyncSession, *, body: ExhibitorCreate, actor: str, request_id: str | None = None
) -> dict:
    contact = await load_contact(db, body.contact_person_id)
    if body.contact_person_id and contact is None:
        raise NotFoundError("Person not found.")
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
        request_id=request_id,
        details={"name": e.name, "type": e.type},
    )
    await db.commit()
    await db.refresh(e)
    return exhibitor_to_dict(e, contact)


async def apply_exhibitor_update(
    db: AsyncSession,
    e: Exhibitor,
    body: ExhibitorUpdate,
    *,
    actor: str,
    request_id: str | None = None,
    clear_contact_person: bool = False,
) -> dict:
    """Apply a partial exhibitor update and return the refreshed payload.

    ``clear_contact_person`` exists for the MCP adapter, whose kwargs can't
    distinguish "omitted" from "explicitly null" — REST expresses the same
    intent via an explicit ``null`` in the JSON body, which already lands in
    ``body.model_fields_set`` and so never needs the flag (it always passes
    ``False``).
    """
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
            # Lock this exhibitor row so a concurrent edition update that's about
            # to link it to a lineup (see validate_exhibitor_ids in
            # editions_service, which locks the same row) can't interleave with
            # this retype and leave a vendor exhibitor linked to an edition.
            await db.execute(select(Exhibitor.id).where(Exhibitor.id == e.id).with_for_update())
            # Editions reject vendor ids (see validate_exhibitor_ids in
            # editions_service), so retyping an exhibitor that editions still link
            # to would strand them in a state their own update endpoint refuses.
            linked = await editions_linking(db, e.id)
            if linked:
                raise ConflictError(
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
            contact_check = await load_contact(db, body.contact_person_id)
            if contact_check is None:
                raise NotFoundError("Person not found.")
        e.contact_person_id = body.contact_person_id

    await write_audit_entry(
        db,
        actor=actor,
        action="exhibitor_updated",
        resource_type="exhibitor",
        resource_id=str(e.id),
        request_id=request_id,
        details={"fields_changed": sorted(fields_changed)},
    )
    await db.commit()
    await db.refresh(e)
    contact = await load_contact(db, e.contact_person_id)
    return exhibitor_to_dict(e, contact)


async def delete_exhibitor(db: AsyncSession, e: Exhibitor, *, actor: str, request_id: str | None = None) -> dict:
    exhibitor_id = e.id
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
        request_id=request_id,
        details={},
    )
    await db.commit()
    return {"deleted": True, "id": exhibitor_id}
