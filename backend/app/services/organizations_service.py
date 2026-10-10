"""Shared application-service operations for organizations.

Used by both ``app.routers.organizations`` (REST) and ``app.mcp.admin.organizations``
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
from app.models import Edition, Organization, Person
from app.schemas import OrganizationCreate, OrganizationDescription, OrganizationUpdate
from app.services import organization_logos
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.utils import organization_to_dict

DESCRIPTION_FIELDS = ("description_language", "description_nl", "description_fr", "description_en")


async def editions_linking(db: AsyncSession, organization_id: int) -> list[str]:
    """Ids of editions whose organization list still contains this organization."""
    result = await db.execute(select(Edition))
    return sorted(edition.id for edition in result.scalars().all() if organization_id in edition.organizations)


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


async def create_organization(
    db: AsyncSession, *, body: OrganizationCreate, actor: str, request_id: str | None = None
) -> dict:
    if body.image.startswith(organization_logos.PREFIX):
        raise ValidationFailedError("Upload managed logos after creating the organization.")
    contact = await load_contact(db, body.contact_person_id)
    if body.contact_person_id and contact is None:
        raise NotFoundError("Person not found.")
    e = Organization(
        **{field: getattr(body, field) for field in DESCRIPTION_FIELDS},
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
        action="organization_created",
        resource_type="organization",
        resource_id=str(e.id),
        request_id=request_id,
        details={"name": e.name, "type": e.type},
    )
    await db.commit()
    await db.refresh(e)
    return organization_to_dict(e, contact)


async def apply_organization_update(
    db: AsyncSession,
    e: Organization,
    body: OrganizationUpdate,
    *,
    actor: str,
    request_id: str | None = None,
    clear_contact_person: bool = False,
    logo: bytes | None = None,
) -> dict:
    """Apply a partial organization update and return the refreshed payload.

    ``clear_contact_person`` exists for the MCP adapter, whose kwargs can't
    distinguish "omitted" from "explicitly null" — REST expresses the same
    intent via an explicit ``null`` in the JSON body, which already lands in
    ``body.model_fields_set`` and so never needs the flag (it always passes
    ``False``).
    """
    from app.services.organization_changes import lock_organization, supersede

    e = await lock_organization(db, e.id)
    # Validate the merged state before mutating: a partial update may change only one translation.
    descriptions = {field: getattr(e, field) for field in DESCRIPTION_FIELDS}
    descriptions.update(body.model_dump(include=set(DESCRIPTION_FIELDS), exclude_unset=True))
    try:
        validated = OrganizationDescription.model_validate(descriptions).validate_original()
    except ValueError as exc:
        raise ValidationFailedError(str(exc)) from exc
    for field in body.model_fields_set.intersection(DESCRIPTION_FIELDS):
        setattr(e, field, getattr(validated, field))

    if body.name is not None:
        e.name = body.name
    old_image = e.image
    if logo is not None:
        e.image = organization_logos.PREFIX + organization_logos.store(db, organization_logos.roots()[0], logo)
    elif body.image is not None:
        if body.image.startswith(organization_logos.PREFIX) and body.image != e.image:
            raise ValidationFailedError("Use the logo upload endpoint for managed images.")
        e.image = body.image
    if body.website is not None:
        e.website = body.website
    if body.active is not None:
        e.active = body.active
    if body.type is not None:
        if body.type == "vendor" and e.type != "vendor":
            # Lock this organization row so a concurrent edition update that's about
            # to link it to a lineup (see validate_organization_ids in
            # editions_service, which locks the same row) can't interleave with
            # this retype and leave a vendor organization linked to an edition.
            await db.execute(select(Organization.id).where(Organization.id == e.id).with_for_update())
            # Editions reject vendor ids (see validate_organization_ids in
            # editions_service), so retyping an organization that editions still link
            # to would strand them in a state their own update endpoint refuses.
            linked = await editions_linking(db, e.id)
            if linked:
                raise ConflictError(
                    "Cannot change this organization to a vendor while editions still link to it: "
                    f"{', '.join(linked)}. Remove it from those editions first."
                )
        e.type = body.type

    fields_changed = set(body.model_fields_set)
    if logo is not None:
        fields_changed.add("image")
    if body.website is None:
        fields_changed.discard("website")
    if clear_contact_person:
        e.contact_person_id = None
        fields_changed.add("contact_person_id")
    elif "contact_person_id" in body.model_fields_set:
        if body.contact_person_id is not None:
            contact_check = await load_contact(db, body.contact_person_id)
            if contact_check is None:
                raise NotFoundError("Person not found.")
        e.contact_person_id = body.contact_person_id

    await supersede(db, e, fields_changed, actor=actor)
    await write_audit_entry(
        db,
        actor=actor,
        action="organization_updated",
        resource_type="organization",
        resource_id=str(e.id),
        request_id=request_id,
        details={"fields_changed": sorted(fields_changed)},
    )
    await organization_logos.retire_public(db, old_image)
    await db.commit()
    await db.refresh(e)
    contact = await load_contact(db, e.contact_person_id)
    return organization_to_dict(e, contact)


async def delete_organization(db: AsyncSession, e: Organization, *, actor: str, request_id: str | None = None) -> dict:
    from app.services.organization_changes import lock_organization, pending

    e = await lock_organization(db, e.id)
    change = await pending(db, e.id)
    if change:
        organization_logos.retire_pending(db, change)
    old_image = e.image
    organization_id = e.id
    editions_result = await db.execute(select(Edition))
    for edition in editions_result.scalars().all():
        if organization_id in edition.organizations:
            edition.organizations = [eid for eid in edition.organizations if eid != organization_id]
            edition.sponsor_tiers = {k: v for k, v in edition.sponsor_tiers.items() if k != str(organization_id)}
    await db.delete(e)
    await write_audit_entry(
        db,
        actor=actor,
        action="organization_deleted",
        resource_type="organization",
        resource_id=str(organization_id),
        request_id=request_id,
        details={},
    )
    await organization_logos.retire_public(db, old_image)
    await db.commit()
    return {"deleted": True, "id": organization_id}
