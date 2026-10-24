"""Email category management (admin-only, #1408).

Business logic lives in ``app.services.email_categories_service``. Categories hold no consent: an
administrator edits names, descriptions and the roles that may use a category, never who consented.
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import EmailCategoryCreate, EmailCategoryOut, EmailCategoryUpdate
from app.services import email_categories_service
from app.services.errors import ServiceError, to_http_exception
from app.translations import Language

router = APIRouter(prefix="/api/email-categories", tags=["email-categories"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[EmailCategoryOut])
async def list_email_categories(
    db: AsyncSession = Depends(get_db), locale: Language | None = Query(default=None)
) -> list[dict]:
    """Every category in display order. `name`/`description` are resolved for `locale`; all stored texts are included."""
    return await email_categories_service.list_categories(db, locale=locale)


@router.post("", response_model=EmailCategoryOut, status_code=status.HTTP_201_CREATED)
async def create_email_category(
    body: EmailCategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await email_categories_service.create_category(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{key}", response_model=EmailCategoryOut)
async def update_email_category(
    key: str,
    body: EmailCategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await email_categories_service.update_category(
            db, actor=actor, key=key, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.delete("/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_email_category(
    key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    try:
        await email_categories_service.delete_category(
            db, actor=actor, key=key, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
