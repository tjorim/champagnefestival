"""Organization management endpoints.

Business logic lives in ``app.services.organizations_service`` and is shared
with ``app.mcp.admin.organizations`` — this router is a thin adapter that
translates ``ServiceError`` into ``HTTPException`` (see #807, #860).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.models import Organization, OrganizationChange
from app.schemas import (
    OrganizationChangeDecision,
    OrganizationChangeOut,
    OrganizationCreate,
    OrganizationOut,
    OrganizationUpdate,
)
from app.services import organization_changes, organization_logos, organizations_service
from app.services import organization_translation as translation
from app.services.errors import ServiceError, to_http_exception
from app.utils import get_or_404, organization_to_dict

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("/translation", response_model=translation.TranslationCapabilities, dependencies=[Depends(require_admin)])
async def translation_capabilities(response: Response) -> translation.TranslationCapabilities:
    """Configured draft languages; never contacts the service or publishes text."""
    response.headers["Cache-Control"] = "no-store"
    return translation.capabilities()


@router.post("/translation", response_model=translation.TranslationDraft, dependencies=[Depends(require_admin)])
async def suggest_translation(
    body: translation.TranslationRequest, response: Response, actor: str = Depends(get_actor_id)
) -> translation.TranslationDraft:
    """Request an editable draft only. Nothing is saved; no automatic retry."""
    response.headers["Cache-Control"] = "no-store"
    return await translation.suggest(body, f"keycloak:{actor}")


@router.get("", response_model=list[OrganizationOut], dependencies=[Depends(require_admin)])
async def list_organizations(
    organization_type: str | None = Query(default=None, alias="type"),
    db: AsyncSession = Depends(get_db),
    pagination: Pagination = Depends(),
) -> list[dict]:
    stmt = select(Organization).order_by(Organization.id)
    if organization_type is not None:
        stmt = stmt.where(Organization.type == organization_type)
    stmt = apply_pagination(stmt, pagination)
    result = await db.execute(stmt)
    organizations = result.scalars().all()
    person_ids = [e.contact_person_id for e in organizations if e.contact_person_id]
    contacts = await organizations_service.load_contacts_by_ids(db, person_ids)
    return [
        organization_to_dict(e, contacts.get(e.contact_person_id) if e.contact_person_id else None)
        for e in organizations
    ]


@router.post(
    "",
    response_model=OrganizationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_organization(
    body: OrganizationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await organizations_service.create_organization(
            db, body=body, actor=actor, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("/changes", response_model=list[OrganizationChangeOut], dependencies=[Depends(require_admin)])
async def pending_changes(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """List private pending proposals with current values for side-by-side review."""
    return await organization_changes.list_pending(db)


@router.post(
    "/changes/{change_id}/decision", response_model=OrganizationChangeOut, dependencies=[Depends(require_admin)]
)
async def decide_change(
    change_id: str,
    body: OrganizationChangeDecision,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Accept/reject once. Repeating the same decision returns the recorded outcome."""
    try:
        return await organization_changes.decide(db, change_id, body.decision, body.reason, actor=actor)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{organization_id}", response_model=OrganizationOut, dependencies=[Depends(require_admin)])
async def update_organization(
    organization_id: int,
    body: OrganizationUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    e = await get_or_404(db, Organization, organization_id, "Organization not found.")
    try:
        return await organizations_service.apply_organization_update(
            db, e, body, actor=actor, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete(
    "/{organization_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_organization(
    organization_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    e = await get_or_404(db, Organization, organization_id, "Organization not found.")
    try:
        await organizations_service.delete_organization(
            db, e, actor=actor, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{organization_id}/logo", response_model=OrganizationOut, dependencies=[Depends(require_admin)])
async def upload_logo(
    organization_id: int,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Publish a validated logo immediately, superseding the manager's logo proposal."""
    try:
        await get_or_404(db, Organization, organization_id, "Organization not found.")
        logo = await organization_logos.read_upload(file)
        row = await organization_changes.lock_organization(db, organization_id)
        return await organizations_service.apply_organization_update(
            db, row, OrganizationUpdate(), actor=actor, logo=logo
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("/changes/{change_id}/logo", dependencies=[Depends(require_admin)])
async def preview_logo(change_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    change = await db.get(OrganizationChange, change_id)
    if change is None:
        raise HTTPException(404, "Pending logo not found.")
    try:
        await organization_changes.lock_organization(db, change.organization_id)
        await db.refresh(change)
        return Response(
            organization_logos.pending_path(change).read_bytes(),
            media_type="image/png",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
