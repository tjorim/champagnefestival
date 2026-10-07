"""Admin (write) MCP tool implementations for organization management.

Mirrors ``app.routers.organizations``. Business logic lives in
``app.services.organizations_service`` and is shared with the REST router.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.mcp.utils import MCPToolError, get_or_error, validate_with_schema
from app.models import Organization
from app.schemas import OrganizationCreate, OrganizationUpdate
from app.services import organizations_service
from app.services.errors import ServiceError
from app.utils import organization_to_dict


async def create_organization(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    image: str = "",
    website: str = "",
    active: bool = True,
    type: str = "vendor",
    description_language: str | None = None,
    description_nl: str | None = None,
    description_fr: str | None = None,
    description_en: str | None = None,
    contact_person_id: str | None = None,
) -> dict:
    body = validate_with_schema(
        OrganizationCreate,
        name=name,
        image=image,
        website=website,
        active=active,
        type=type,
        description_language=description_language,
        description_nl=description_nl,
        description_fr=description_fr,
        description_en=description_en,
        contact_person_id=contact_person_id,
    )
    async with session_factory() as db:
        try:
            return await organizations_service.create_organization(db, body=body, actor=actor)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def get_organization(session_factory: Any, organization_id: int) -> dict:
    async with session_factory() as db:
        e = await get_or_error(db, Organization, organization_id, f"Organization '{organization_id}' not found.")
        contact = await organizations_service.load_contact(db, e.contact_person_id)
        return organization_to_dict(e, contact)


async def list_organizations(session_factory: Any, organization_type: str | None = None) -> dict:
    async with session_factory() as db:
        stmt = select(Organization).order_by(Organization.id)
        if organization_type is not None:
            stmt = stmt.where(Organization.type == organization_type)
        result = await db.execute(stmt)
        organizations = result.scalars().all()
        person_ids = [e.contact_person_id for e in organizations if e.contact_person_id]
        contacts = await organizations_service.load_contacts_by_ids(db, person_ids)
        return {
            "organizations": [
                organization_to_dict(e, contacts.get(e.contact_person_id) if e.contact_person_id else None)
                for e in organizations
            ]
        }


async def update_organization(
    session_factory: Any,
    actor: str,
    organization_id: int,
    *,
    name: str | None = None,
    image: str | None = None,
    website: str | None = None,
    active: bool | None = None,
    type: str | None = None,
    description_language: str | None = None,
    description_nl: str | None = None,
    description_fr: str | None = None,
    description_en: str | None = None,
    contact_person_id: str | None = None,
    clear_contact_person: bool = False,
) -> dict:
    provided: dict[str, Any] = {
        k: v
        for k, v in {
            "description_language": description_language,
            "description_nl": description_nl,
            "description_fr": description_fr,
            "description_en": description_en,
            "name": name,
            "image": image,
            "website": website,
            "active": active,
            "type": type,
            "contact_person_id": contact_person_id,
        }.items()
        if v is not None
    }
    if description_language == "":
        provided["description_language"] = None
    body = validate_with_schema(OrganizationUpdate, **provided)
    async with session_factory() as db:
        e = await get_or_error(db, Organization, organization_id, f"Organization '{organization_id}' not found.")
        try:
            return await organizations_service.apply_organization_update(
                db, e, body, actor=actor, clear_contact_person=clear_contact_person
            )
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_organization(session_factory: Any, actor: str, organization_id: int) -> dict:
    async with session_factory() as db:
        e = await get_or_error(db, Organization, organization_id, f"Organization '{organization_id}' not found.")
        return await organizations_service.delete_organization(db, e, actor=actor)
