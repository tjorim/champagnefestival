"""Public waitlist submissions and the administrator queue.

A visitor asks to be contacted if a sold-out product frees up. Scoped to a
`Product`, not an `Event` — see `WaitlistEntry`'s docstring in app.models.
The public submission is self-contained (spam guards, per-client rate limit); the
administrator queue lives in `app.services.waitlist_service`, shared with the MCP tools.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.dialect_functions import dialect_insert
from app.models import Event, Product, WaitlistEntry
from app.ratelimit import check_rate_limit, get_client_ip
from app.schema_types import GuestCount, NonEmptyText200, ResourceId, Text30, Text2000
from app.schemas import RequestModel
from app.services import waitlist_service as service
from app.services.errors import ServiceError, to_http_exception
from app.spam import check_form_timing, check_honeypot
from app.utils import product_available_quantity, product_sold_out

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])


class WaitlistEntryRequest(RequestModel):
    submission_id: UUID
    product_id: ResourceId
    name: NonEmptyText200
    email: EmailStr
    phone: Text30 | None = None
    guest_count: GuestCount = 1
    notes: Text2000 = ""
    honeypot: str | None = None
    form_start_time: str | None = None


class WaitlistEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    product_id: str
    name: str
    email: str
    phone: str | None
    guest_count: int
    notes: str
    created_at: datetime
    handled_at: datetime | None


class WaitlistEntryAdminOut(WaitlistEntryOut):
    product_name: str
    event_id: str
    event_title: str


def _to_admin_out(entry: dict) -> WaitlistEntryAdminOut:
    return WaitlistEntryAdminOut(**entry)


@router.post("")
async def submit_waitlist_entry(
    body: WaitlistEntryRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    check_honeypot(body.honeypot or "")
    check_form_timing(body.form_start_time or "")
    client_ip = get_client_ip(request)
    if not check_rate_limit(client_ip, scope="waitlist-submission"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many waitlist submissions")

    product = (await db.execute(select(Product).where(Product.id == body.product_id))).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    event = await db.get(Event, product.event_id)
    member = None
    if event is not None and event.members_only:
        from app.services.member_registration import verified_member, visitor_user

        member, _user = await verified_member(db, await visitor_user(db, request))
    if not product_sold_out(product, product_available_quantity(product)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This item isn't sold out.")

    entry_id = str(body.submission_id)
    await db.execute(
        dialect_insert(db)(WaitlistEntry)
        .values(
            id=entry_id,
            product_id=body.product_id,
            name=member.name if member else body.name,
            email=member.email if member else str(body.email),
            phone=member.phone if member else body.phone,
            guest_count=body.guest_count,
            notes=body.notes,
            client_ip=client_ip,
            request_id=getattr(request.state, "request_id", None),
        )
        .on_conflict_do_nothing(index_elements=[WaitlistEntry.id])
    )
    await db.commit()
    return {"ok": True}


async def _call(operation):
    try:
        return await operation
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("", response_model=list[WaitlistEntryAdminOut], dependencies=[Depends(require_admin)])
async def list_waitlist_entries(
    db: AsyncSession = Depends(get_db),
    product_id: str | None = None,
    event_id: str | None = None,
) -> list[WaitlistEntryAdminOut]:
    entries = await service.list_entries(db, product_id=product_id, event_id=event_id)
    return [_to_admin_out(entry) for entry in entries]


@router.put("/{entry_id}/handled", response_model=WaitlistEntryAdminOut, dependencies=[Depends(require_admin)])
async def mark_waitlist_entry_handled(entry_id: str, db: AsyncSession = Depends(get_db)) -> WaitlistEntryAdminOut:
    return _to_admin_out(await _call(service.mark_handled(db, entry_id)))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_waitlist_entry(entry_id: str, db: AsyncSession = Depends(get_db)) -> None:
    await _call(service.delete_entry(db, entry_id))
