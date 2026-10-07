"""Read exhibitors managed by a verified email or OIDC identity (#1192)."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import Response as ImageResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Exhibitor, ExhibitorChange, Person, User
from app.schemas import ExhibitorChangeOut, ExhibitorChangeSubmit, ManagedExhibitorOut
from app.services import exhibitor_changes, exhibitor_logos
from app.services import exhibitor_translation as translation
from app.services.errors import ServiceError, to_http_exception
from app.visitor_session import actor_for_user, get_current_user, get_exhibitor_contact_email

router = APIRouter(prefix="/api/me/exhibitors", tags=["me", "exhibitors"])


@router.get("", response_model=list[ManagedExhibitorOut])
async def my_exhibitors(
    response: Response, email: str | None = Depends(get_exhibitor_contact_email), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    if email is None:
        return []
    rows = (
        await db.scalars(
            select(Exhibitor)
            .join(Person, Exhibitor.contact_person_id == Person.id)
            .where(func.lower(func.trim(Person.email)) == email)
            .order_by(Exhibitor.name, Exhibitor.id)
        )
    ).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "website": row.website,
            "active": row.active,
            **{field: getattr(row, field) for field in exhibitor_changes.DESCRIPTION_FIELDS},
        }
        for row in rows
    ]


async def owned(db: AsyncSession, exhibitor_id: int, email: str | None, *, lock: bool = True) -> Exhibitor:
    """Check live ownership; unlocked preflight must be repeated under the lock before writing."""
    try:
        if lock:
            row = await exhibitor_changes.lock_exhibitor(db, exhibitor_id)
        else:
            row = await db.scalar(
                select(Exhibitor).where(Exhibitor.id == exhibitor_id).execution_options(populate_existing=True)
            )
            if row is None:
                raise HTTPException(404, "Exhibitor not found.")
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    contact = await db.scalar(
        select(Person).where(Person.id == row.contact_person_id).execution_options(populate_existing=True)
    )
    if email is None or contact is None or contact.email.strip().lower() != email:
        raise HTTPException(404, "Exhibitor not found.")
    return row


@router.get("/{exhibitor_id}/translation", response_model=translation.TranslationCapabilities)
async def translation_capabilities(
    exhibitor_id: int,
    response: Response,
    email: str | None = Depends(get_exhibitor_contact_email),
    db: AsyncSession = Depends(get_db),
) -> translation.TranslationCapabilities:
    response.headers["Cache-Control"] = "no-store"
    await owned(db, exhibitor_id, email, lock=False)
    return translation.capabilities()


@router.post("/{exhibitor_id}/translation", response_model=translation.TranslationDraft)
async def suggest_translation(
    exhibitor_id: int,
    body: translation.TranslationRequest,
    response: Response,
    email: str | None = Depends(get_exhibitor_contact_email),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> translation.TranslationDraft:
    """Live manager authorization, editable draft only; no proposal or publication."""
    response.headers["Cache-Control"] = "no-store"
    await owned(db, exhibitor_id, email, lock=False)
    # Release the read transaction before waiting for a cold service startup.
    actor, auth_source = actor_for_user(user)
    await db.rollback()
    return await translation.suggest(body, f"{auth_source or 'keycloak'}:{actor}")


@router.get("/{exhibitor_id}/changes", response_model=list[ExhibitorChangeOut])
async def my_changes(
    exhibitor_id: int,
    response: Response,
    email: str | None = Depends(get_exhibitor_contact_email),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Private proposal history, authorized against the current contact email."""
    response.headers["Cache-Control"] = "no-store"
    row = await owned(db, exhibitor_id, email)
    changes = (
        await db.scalars(
            select(ExhibitorChange)
            .where(ExhibitorChange.exhibitor_id == row.id)
            .order_by(ExhibitorChange.created_at.desc(), ExhibitorChange.id)
        )
    ).all()
    return [exhibitor_changes.payload(change, row) for change in changes]


@router.post("/{exhibitor_id}/changes", response_model=ExhibitorChangeOut)
async def propose_change(
    exhibitor_id: int,
    body: ExhibitorChangeSubmit,
    response: Response,
    email: str | None = Depends(get_exhibitor_contact_email),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit private website/description fields; reuse submission_id for retries."""
    response.headers["Cache-Control"] = "no-store"
    row = await owned(db, exhibitor_id, email)
    actor, auth_source = actor_for_user(user)
    try:
        return await exhibitor_changes.submit(db, row, body, actor=actor, auth_source=auth_source)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{exhibitor_id}/logo", response_model=ExhibitorChangeOut)
async def upload_logo(
    exhibitor_id: int,
    file: UploadFile,
    response: Response,
    email: str | None = Depends(get_exhibitor_contact_email),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upload a private proposal. Repeating an upload replaces the pending proposal."""
    response.headers["Cache-Control"] = "no-store"
    await owned(db, exhibitor_id, email, lock=False)
    actor, auth_source = actor_for_user(user)
    try:
        logo = await exhibitor_logos.read_upload(file)
        row = await owned(db, exhibitor_id, email)
        return await exhibitor_changes.submit(
            db, row, ExhibitorChangeSubmit(submission_id=uuid4()), actor=actor, auth_source=auth_source, logo=logo
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("/{exhibitor_id}/changes/{change_id}/logo")
async def preview_logo(
    exhibitor_id: int,
    change_id: str,
    email: str | None = Depends(get_exhibitor_contact_email),
    db: AsyncSession = Depends(get_db),
) -> ImageResponse:
    await owned(db, exhibitor_id, email)
    change = await db.get(ExhibitorChange, change_id)
    if change is None or change.exhibitor_id != exhibitor_id:
        raise HTTPException(404, "Pending logo not found.")
    try:
        return ImageResponse(
            exhibitor_logos.pending_path(change).read_bytes(),
            media_type="image/png",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
