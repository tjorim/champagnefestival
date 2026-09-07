"""Admin-only central composer endpoints (#942).

Draft lifecycle only — actual delivery runs through the durable outbox (see
app.composer_delivery). All endpoints require admin auth; there is no
public surface here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.ratelimit import check_rate_limit
from app.schemas import ComposedMessageCreate, ComposedMessageOut, ComposedMessageScheduleRequest, ComposedMessageUpdate
from app.services import composer_service as service
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(prefix="/api/composer", tags=["composer"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[ComposedMessageOut])
async def list_messages(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await service.list_messages(db)


@router.get("/{message_id}", response_model=ComposedMessageOut)
async def get_message(message_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await service.to_dict(db, await service.get_message(db, message_id))
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("", response_model=ComposedMessageOut, status_code=status.HTTP_201_CREATED)
async def create_draft(
    body: ComposedMessageCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await service.create_draft(
            db, actor=actor, body=body, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.put("/{message_id}", response_model=ComposedMessageOut)
async def update_draft(
    message_id: str,
    body: ComposedMessageUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await service.update_draft(
            db,
            actor=actor,
            message_id=message_id,
            body=body,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{message_id}/schedule", response_model=ComposedMessageOut)
async def schedule_send(
    message_id: str,
    body: ComposedMessageScheduleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Transition ``draft`` -> ``scheduled`` and enqueue the actual send
    through the outbox. ``scheduled_at: null`` sends as soon as the worker
    next polls — "publish now" and "schedule for later" are the same call.
    """
    # In-process limiter: authenticated, low-volume admin action — same
    # narrower scope #932/#941 already give this category (see
    # app.ratelimit's module docstring).
    if not check_rate_limit(actor, scope="composer-schedule", max_requests=10):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    try:
        return await service.schedule_send(
            db,
            actor=actor,
            message_id=message_id,
            scheduled_at=body.scheduled_at,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
