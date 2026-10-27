"""Persisted public contact submissions and the administrator inbox."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.dependencies import ListQuery
from app.dialect_functions import dialect_insert
from app.email import send_contact_notification
from app.models import ContactMessage
from app.ratelimit import check_rate_limit, get_client_ip
from app.schema_types import NonEmptyText200
from app.schemas import RequestModel
from app.spam import check_form_timing, check_honeypot

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactRequest(RequestModel):
    submission_id: UUID
    name: NonEmptyText200
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
    honeypot: str | None = None
    form_start_time: str | None = None


class ContactMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    message: str
    created_at: datetime
    handled_at: datetime | None


class ContactMessageListEnvelope(BaseModel):
    """One page of the inbox; ``total`` counts every message matching the filters."""

    items: list[ContactMessageOut]
    total: int
    limit: int
    page: int


@router.post("")
async def submit_contact(
    body: ContactRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    check_honeypot(body.honeypot or "")
    check_form_timing(body.form_start_time or "")
    client_ip = get_client_ip(request)
    if not check_rate_limit(client_ip, scope="contact-submission"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many contact submissions")

    message_id = str(body.submission_id)
    inserted = await db.scalar(
        dialect_insert(db)(ContactMessage)
        .values(
            id=message_id,
            name=body.name,
            email=str(body.email),
            message=body.message,
            client_ip=client_ip,
            request_id=getattr(request.state, "request_id", None),
        )
        .on_conflict_do_nothing(index_elements=[ContactMessage.id])
        .returning(ContactMessage.id)
    )
    await db.commit()
    if inserted is None:
        return {"ok": True}

    await send_contact_notification(
        name=body.name,
        email=str(body.email),
        message_text=body.message,
        message_id=message_id,
    )
    return {"ok": True}


@router.get("", response_model=ContactMessageListEnvelope, dependencies=[Depends(require_admin)])
async def list_contact_messages(
    db: AsyncSession = Depends(get_db),
    query: ListQuery = Depends(),
    queue_status: Literal["unhandled", "handled", "all"] = Query(
        default="all", alias="status", description="`unhandled`, `handled` or `all`"
    ),
) -> dict:
    """Newest first, paged; ``total`` spans the whole filtered inbox."""
    filtered = select(ContactMessage)
    if queue_status == "unhandled":
        filtered = filtered.where(ContactMessage.handled_at.is_(None))
    elif queue_status == "handled":
        filtered = filtered.where(ContactMessage.handled_at.is_not(None))
    if query.q:
        filtered = filtered.where(
            or_(
                *(
                    func.lower(column).contains(query.q.lower(), autoescape=True)
                    for column in (ContactMessage.name, ContactMessage.email, ContactMessage.message)
                )
            )
        )
    total = (await db.execute(select(func.count()).select_from(filtered.subquery()))).scalar_one()
    stmt = query.apply(filtered.order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc()))
    return query.envelope(list((await db.execute(stmt)).scalars().all()), total)


@router.put("/{message_id}/handled", response_model=ContactMessageOut, dependencies=[Depends(require_admin)])
async def mark_contact_message_handled(message_id: str, db: AsyncSession = Depends(get_db)) -> ContactMessage:
    message = await db.get(ContactMessage, message_id)
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact message not found")
    if message.handled_at is None:
        message.handled_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(message)
    return message
