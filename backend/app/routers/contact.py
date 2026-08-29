"""Persisted public contact submissions and the administrator inbox."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.email import send_contact_notification
from app.models import ContactMessage
from app.ratelimit import check_rate_limit, get_client_ip
from app.spam import check_form_timing, check_honeypot

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactRequest(BaseModel):
    submission_id: UUID
    name: str = Field(min_length=1, max_length=200)
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
        insert(ContactMessage)
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


@router.get("", response_model=list[ContactMessageOut], dependencies=[Depends(require_admin)])
async def list_contact_messages(db: AsyncSession = Depends(get_db)) -> list[ContactMessage]:
    result = await db.execute(select(ContactMessage).order_by(ContactMessage.created_at.desc()))
    return list(result.scalars().all())


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
