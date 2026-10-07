"""Read organizations managed by a verified email or OIDC identity (#1192)."""

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import Response as ImageResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Organization, OrganizationChange, Person, User
from app.schemas import ManagedOrganizationOut, OrganizationChangeOut, OrganizationChangeSubmit
from app.services import organization_changes, organization_logos
from app.services import organization_translation as translation
from app.services.errors import ServiceError, to_http_exception
from app.visitor_session import actor_for_user, get_current_user_with_claims, get_organization_contact_email

router = APIRouter(prefix="/api/me/organizations", tags=["me", "organizations"])


@router.get("", response_model=list[ManagedOrganizationOut])
async def my_organizations(
    response: Response, email: str | None = Depends(get_organization_contact_email), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    if email is None:
        return []
    rows = (
        await db.scalars(
            select(Organization)
            .join(Person, Organization.contact_person_id == Person.id)
            .where(func.lower(func.trim(Person.email)) == email)
            .order_by(Organization.name, Organization.id)
        )
    ).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "website": row.website,
            "active": row.active,
            **{field: getattr(row, field) for field in organization_changes.DESCRIPTION_FIELDS},
        }
        for row in rows
    ]


async def owned(db: AsyncSession, organization_id: int, email: str | None, *, lock: bool = True) -> Organization:
    """Check live ownership; unlocked preflight must be repeated under the lock before writing."""
    try:
        if lock:
            row = await organization_changes.lock_organization(db, organization_id)
        else:
            row = await db.scalar(
                select(Organization).where(Organization.id == organization_id).execution_options(populate_existing=True)
            )
            if row is None:
                raise HTTPException(404, "Organization not found.")
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    contact = await db.scalar(
        select(Person).where(Person.id == row.contact_person_id).execution_options(populate_existing=True)
    )
    if email is None or contact is None or contact.email.strip().lower() != email:
        raise HTTPException(404, "Organization not found.")
    return row


@router.get("/{organization_id}/translation", response_model=translation.TranslationCapabilities)
async def translation_capabilities(
    organization_id: int,
    response: Response,
    email: str | None = Depends(get_organization_contact_email),
    db: AsyncSession = Depends(get_db),
) -> translation.TranslationCapabilities:
    response.headers["Cache-Control"] = "no-store"
    await owned(db, organization_id, email, lock=False)
    return translation.capabilities()


@router.post("/{organization_id}/translation", response_model=translation.TranslationDraft)
async def suggest_translation(
    organization_id: int,
    body: translation.TranslationRequest,
    response: Response,
    email: str | None = Depends(get_organization_contact_email),
    user_and_claims: tuple[User, dict[str, Any] | None] = Depends(get_current_user_with_claims),
    db: AsyncSession = Depends(get_db),
) -> translation.TranslationDraft:
    """Live manager authorization, editable draft only; no proposal or publication."""
    response.headers["Cache-Control"] = "no-store"
    await owned(db, organization_id, email, lock=False)
    # Release the read transaction before waiting for a cold service startup.
    actor, auth_source = actor_for_user(*user_and_claims)
    await db.rollback()
    return await translation.suggest(body, f"{auth_source or 'keycloak'}:{actor}")


@router.get("/{organization_id}/changes", response_model=list[OrganizationChangeOut])
async def my_changes(
    organization_id: int,
    response: Response,
    email: str | None = Depends(get_organization_contact_email),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Private proposal history, authorized against the current contact email."""
    response.headers["Cache-Control"] = "no-store"
    row = await owned(db, organization_id, email)
    changes = (
        await db.scalars(
            select(OrganizationChange)
            .where(OrganizationChange.organization_id == row.id)
            .order_by(OrganizationChange.created_at.desc(), OrganizationChange.id)
        )
    ).all()
    return [organization_changes.payload(change, row) for change in changes]


@router.post("/{organization_id}/changes", response_model=OrganizationChangeOut)
async def propose_change(
    organization_id: int,
    body: OrganizationChangeSubmit,
    response: Response,
    email: str | None = Depends(get_organization_contact_email),
    user_and_claims: tuple[User, dict[str, Any] | None] = Depends(get_current_user_with_claims),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit private website/description fields; reuse submission_id for retries."""
    response.headers["Cache-Control"] = "no-store"
    row = await owned(db, organization_id, email)
    actor, auth_source = actor_for_user(*user_and_claims)
    try:
        return await organization_changes.submit(db, row, body, actor=actor, auth_source=auth_source)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{organization_id}/logo", response_model=OrganizationChangeOut)
async def upload_logo(
    organization_id: int,
    file: UploadFile,
    response: Response,
    email: str | None = Depends(get_organization_contact_email),
    user_and_claims: tuple[User, dict[str, Any] | None] = Depends(get_current_user_with_claims),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload a private proposal. Repeating an upload replaces the pending proposal."""
    response.headers["Cache-Control"] = "no-store"
    await owned(db, organization_id, email, lock=False)
    actor, auth_source = actor_for_user(*user_and_claims)
    try:
        logo = await organization_logos.read_upload(file)
        row = await owned(db, organization_id, email)
        return await organization_changes.submit(
            db, row, OrganizationChangeSubmit(submission_id=uuid4()), actor=actor, auth_source=auth_source, logo=logo
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("/{organization_id}/changes/{change_id}/logo")
async def preview_logo(
    organization_id: int,
    change_id: str,
    email: str | None = Depends(get_organization_contact_email),
    db: AsyncSession = Depends(get_db),
) -> ImageResponse:
    await owned(db, organization_id, email)
    change = await db.get(OrganizationChange, change_id)
    if change is None or change.organization_id != organization_id:
        raise HTTPException(404, "Pending logo not found.")
    try:
        return ImageResponse(
            organization_logos.pending_path(change).read_bytes(),
            media_type="image/png",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
