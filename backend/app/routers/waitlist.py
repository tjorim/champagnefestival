"""Public waitlist submissions and the administrator queue.

A visitor asks to be contacted if a sold-out product frees up. Scoped to a
`Product`, not an `Event` — see `WaitlistEntry`'s docstring in app.models.
Self-contained (no shared MCP tool set), matching `app.routers.contact`'s
shape rather than the REST/MCP-shared services elsewhere in this codebase.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_admin
from app.database import get_db
from app.models import Event, Product, WaitlistEntry
from app.ratelimit import check_rate_limit, get_client_ip
from app.schemas import RequestModel
from app.spam import check_form_timing, check_honeypot
from app.utils import product_available_quantity, product_sold_out

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])


class WaitlistEntryRequest(RequestModel):
    submission_id: UUID
    product_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    guest_count: int = Field(default=1, ge=1, le=20)
    notes: str = Field(default="", max_length=2000)
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


def _to_admin_out(entry: WaitlistEntry) -> WaitlistEntryAdminOut:
    return WaitlistEntryAdminOut(
        id=entry.id,
        product_id=entry.product_id,
        name=entry.name,
        email=entry.email,
        phone=entry.phone,
        guest_count=entry.guest_count,
        notes=entry.notes,
        created_at=entry.created_at,
        handled_at=entry.handled_at,
        product_name=entry.product.name,
        event_id=entry.product.event_id,
        event_title=entry.product.event.title,
    )


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
    if not product_sold_out(product, product_available_quantity(product)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This item isn't sold out.")

    entry_id = str(body.submission_id)
    await db.execute(
        insert(WaitlistEntry)
        .values(
            id=entry_id,
            product_id=body.product_id,
            name=body.name,
            email=str(body.email),
            phone=body.phone,
            guest_count=body.guest_count,
            notes=body.notes,
            client_ip=client_ip,
            request_id=getattr(request.state, "request_id", None),
        )
        .on_conflict_do_nothing(index_elements=[WaitlistEntry.id])
    )
    await db.commit()
    return {"ok": True}


@router.get("", response_model=list[WaitlistEntryAdminOut], dependencies=[Depends(require_admin)])
async def list_waitlist_entries(
    db: AsyncSession = Depends(get_db),
    product_id: str | None = None,
    event_id: str | None = None,
) -> list[WaitlistEntryAdminOut]:
    stmt = (
        select(WaitlistEntry)
        .join(Product, Product.id == WaitlistEntry.product_id)
        .options(selectinload(WaitlistEntry.product).selectinload(Product.event))
        .order_by(WaitlistEntry.created_at)
    )
    if product_id is not None:
        stmt = stmt.where(WaitlistEntry.product_id == product_id)
    if event_id is not None:
        stmt = stmt.join(Event, Event.id == Product.event_id).where(Event.id == event_id)
    entries = (await db.execute(stmt)).scalars().all()
    return [_to_admin_out(entry) for entry in entries]


async def _get_entry_or_404(db: AsyncSession, entry_id: str) -> WaitlistEntry:
    entry = await db.get(
        WaitlistEntry,
        entry_id,
        options=[selectinload(WaitlistEntry.product).selectinload(Product.event)],
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waitlist entry not found")
    return entry


@router.put("/{entry_id}/handled", response_model=WaitlistEntryAdminOut, dependencies=[Depends(require_admin)])
async def mark_waitlist_entry_handled(entry_id: str, db: AsyncSession = Depends(get_db)) -> WaitlistEntryAdminOut:
    entry = await _get_entry_or_404(db, entry_id)
    if entry.handled_at is None:
        entry.handled_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(entry, attribute_names=["handled_at"])
    return _to_admin_out(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def delete_waitlist_entry(entry_id: str, db: AsyncSession = Depends(get_db)) -> None:
    entry = await _get_entry_or_404(db, entry_id)
    await db.delete(entry)
    await db.commit()
