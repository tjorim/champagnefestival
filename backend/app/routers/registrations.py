"""Registration CRUD endpoints.

Admin-only mutation logic — order-item resolution, the table/edition guard,
and the admin create/update/delete transitions — lives in
``app.services.registrations_service`` and is shared with
``app.mcp.admin.registrations``. The public self-service endpoints below
(guest-facing creation, CSV export, the email-token "my registrations"
lookup flow) have no MCP equivalent and stay here.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import StreamingResponse

from app.auth import get_actor_id, get_optional_claims, require_admin
from app.config import settings
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.email import send_guest_access_email
from app.live import live_bus
from app.live import mapping as live_mapping
from app.models import Edition, Event, Person, Registration, ReservationAccessToken, Table
from app.ratelimit import check_rate_limit, get_client_ip
from app.schemas import (
    RegistrationAccessLookupRequest,
    RegistrationAdminCreate,
    RegistrationCreate,
    RegistrationGuestOut,
    RegistrationListOut,
    RegistrationLookupRequest,
    RegistrationLookupRequestAccepted,
    RegistrationOut,
    RegistrationOutWithToken,
    RegistrationUpdate,
)
from app.services import events_service, registrations_service
from app.services.operational_search import (
    DEFAULT_RESULT_LIMIT,
    bounded_limit,
    person_search_order_by,
    person_search_predicate,
)
from app.services.outbox_service import enqueue_registration_confirmation
from app.services.people_service import parse_phone
from app.services.users_service import get_or_create_user
from app.spam import check_form_timing, check_honeypot
from app.utils import (
    csv_safe,
    make_id,
    registration_to_dict,
    registration_to_dict_with_token,
    registration_to_guest_dict,
    registration_to_list_dict,
)

router = APIRouter(prefix="/api/registrations", tags=["registrations"])
logger = logging.getLogger(__name__)


@router.post("", response_model=RegistrationOut, status_code=status.HTTP_201_CREATED)
async def create_registration(
    body: RegistrationCreate,
    request: Request,
    claims: dict[str, Any] | None = Depends(get_optional_claims),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client_ip = get_client_ip(request)
    if not check_rate_limit(client_ip, scope="registration-create"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    check_honeypot(body.honeypot)
    check_form_timing(body.form_start_time)

    user = None
    if claims is not None:
        user = await get_or_create_user(db, claims["sub"])

    event = await events_service.get_event_or_404(db, body.event_id)
    await _ensure_public_registration_allowed(db, event, body.guest_count)
    resolved_order_items = registrations_service.resolve_order_items(event, body.order_items, body.guest_count)

    email_norm = str(body.email).lower().strip()
    name_norm = " ".join(body.name.lower().split())
    phone_norm = parse_phone(body.phone)

    candidates = (
        (await db.execute(select(Person).where(Person.email == email_norm, Person.phone == phone_norm))).scalars().all()
    )
    person = next(
        (candidate for candidate in candidates if " ".join(candidate.name.lower().split()) == name_norm),
        None,
    )
    if person is None:
        person = Person(
            id=make_id("per"),
            name=body.name,
            email=email_norm,
            phone=phone_norm,
        )
        db.add(person)
        await db.flush()

    registration = Registration(
        id=make_id("reg"),
        event_id=event.id,
        guest_count=body.guest_count,
        notes=body.notes,
        person_id=person.id,
        user_id=user.id if user else None,
        check_in_token=secrets.token_urlsafe(32),
    )
    registration.order_items = resolved_order_items
    db.add(registration)
    await enqueue_registration_confirmation(
        db,
        registration.id,
        actor=claims["sub"] if claims is not None else "anonymous",
        request_id=getattr(request.state, "request_id", None),
    )
    await db.commit()

    registration = await registrations_service.get_registration_or_404(db, registration.id)
    try:
        await live_bus.publish(
            live_mapping.registration_changed(
                action="created",
                registration_id=registration.id,
                event_id=registration.event_id,
                edition_id=registration.event.edition_id,
            )
        )
    except Exception:
        logger.warning("live_bus.publish failed for registration %s", registration.id, exc_info=True)
    return registration_to_dict(registration, person, event)


@router.post(
    "/admin",
    response_model=RegistrationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def admin_create_registration(
    body: RegistrationAdminCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await registrations_service.admin_create_registration(
        db, body=body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.get(
    "",
    response_model=list[RegistrationListOut],
    dependencies=[Depends(require_admin)],
)
async def list_registrations(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, description="Search by name or email (case-insensitive)"),
    status_filter: str | None = Query(
        default=None, alias="status", description="Filter by status: pending | confirmed | cancelled"
    ),
    event_id: str | None = Query(default=None, description="Filter by event ID"),
    table_id: str | None = Query(default=None, description="Filter by table ID"),
    edition_type: str | None = Query(default=None, description="Filter by the event edition type"),
    pagination: Pagination = Depends(),
) -> list[dict]:
    stmt = (
        select(Registration)
        .options(
            selectinload(Registration.event).selectinload(Event.edition),
            selectinload(Registration.event).selectinload(Event.products),
        )
        .order_by(Registration.created_at.desc(), Registration.id.desc())
    )

    if q and (q_stripped := q.strip()):
        stmt = stmt.join(Person, Registration.person_id == Person.id)
        stmt = stmt.where(person_search_predicate(name=q_stripped, email=q_stripped))
        stmt = stmt.order_by(None).order_by(
            *person_search_order_by(name=q_stripped, email=q_stripped),
            Registration.created_at.desc(),
        )
        limit = bounded_limit(pagination.limit or DEFAULT_RESULT_LIMIT)
        stmt = stmt.offset((pagination.page - 1) * limit).limit(limit)
    if status_filter:
        stmt = stmt.where(Registration.status == status_filter)
    if event_id:
        stmt = stmt.where(Registration.event_id == event_id)
    if table_id:
        stmt = stmt.where(Registration.table_id == table_id)
    if edition_type:
        stmt = stmt.join(Registration.event).join(Event.edition).where(Edition.edition_type == edition_type)

    if not (q and q.strip()):
        stmt = apply_pagination(stmt, pagination)

    rows = (await db.execute(stmt)).scalars().all()
    person_map = await registrations_service.fetch_person_map(db, list(rows))
    return [registration_to_list_dict(row, person_map[row.person_id], row.event) for row in rows]


@router.get("/export", dependencies=[Depends(require_admin)])
async def export_registrations_csv(
    event_id: str,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export the guest list for one event as CSV (name, table, party size, status)."""
    event = await events_service.get_event_or_404(db, event_id)

    stmt = (
        select(Registration)
        .where(Registration.event_id == event_id, Registration.status != "cancelled")
        .order_by(Registration.created_at)
    )
    rows = (await db.execute(stmt)).scalars().all()
    person_map = await registrations_service.fetch_person_map(db, list(rows))

    table_ids = {row.table_id for row in rows if row.table_id}
    table_map: dict[str, str] = {}
    if table_ids:
        tables = (await db.execute(select(Table).where(Table.id.in_(table_ids)))).scalars().all()
        table_map = {t.id: t.name for t in tables}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        map(
            csv_safe,
            [
                "Name",
                "Email",
                "Phone",
                "Table",
                "Guests",
                "Status",
                "Payment",
                "Checked In",
                "Strap Issued",
                "Notes",
            ],
        )
    )
    for row in rows:
        person = person_map[row.person_id]
        writer.writerow(
            map(
                csv_safe,
                [
                    person.name,
                    person.email or "",
                    person.phone or "",
                    table_map.get(row.table_id, ""),
                    row.guest_count,
                    row.status,
                    row.payment_status,
                    "yes" if row.checked_in else "no",
                    "yes" if row.strap_issued else "no",
                    row.notes or "",
                ],
            )
        )
    buffer.seek(0)

    safe_title = re.sub(r"[^A-Za-z0-9._-]+", "_", event.title).strip("_") or event_id
    filename = f"guest-list-{safe_title}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/my/request",
    response_model=RegistrationLookupRequestAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_my_registrations_access(
    body: RegistrationLookupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RegistrationLookupRequestAccepted:
    client_ip = get_client_ip(request)
    if not check_rate_limit(client_ip, scope="registration-access-request"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    email_norm = str(body.email).lower().strip()
    token = secrets.token_urlsafe(24)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.guest_access_token_ttl_minutes)
    request_id = _guest_access_log_id(email_norm)
    token_hash = _hash_guest_access_token(token)

    await db.execute(delete(ReservationAccessToken).where(ReservationAccessToken.expires_at < now))
    existing_token_row = (
        await db.execute(select(ReservationAccessToken).where(ReservationAccessToken.email == email_norm))
    ).scalar_one_or_none()
    if existing_token_row is None:
        db.add(
            ReservationAccessToken(
                id=make_id("rat"),
                email=email_norm,
                token_hash=token_hash,
                expires_at=expires_at,
                created_at=now,
                last_used_at=None,
            )
        )
    else:
        existing_token_row.token_hash = token_hash
        existing_token_row.expires_at = expires_at
        existing_token_row.created_at = now
        existing_token_row.last_used_at = None
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing_token_row = (
            await db.execute(select(ReservationAccessToken).where(ReservationAccessToken.email == email_norm))
        ).scalar_one_or_none()
        if existing_token_row is None:
            raise
        existing_token_row.token_hash = token_hash
        existing_token_row.expires_at = expires_at
        existing_token_row.created_at = now
        existing_token_row.last_used_at = None
        await db.commit()

    try:
        email_sent = await send_guest_access_email(
            email=email_norm,
            token=token,
            request_id=request_id,
            expires_at=expires_at,
        )
    except Exception:
        logger.exception(
            "Guest access email delivery failed unexpectedly for request_id=%s.",
            request_id,
        )
        email_sent = False
    logger.info(
        "Prepared guest registration access token request_id=%s delivery_mode=email expires_at=%s email_sent=%s",
        request_id,
        expires_at.isoformat(),
        email_sent,
    )
    return RegistrationLookupRequestAccepted(
        delivery_mode="email",
        expires_in_minutes=settings.guest_access_token_ttl_minutes,
    )


@router.post("/my/access", response_model=list[RegistrationGuestOut])
async def access_my_registrations(
    body: RegistrationAccessLookupRequest,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    token_row = await _get_guest_access_token_or_401(db, body.token)
    email_norm = token_row.email
    # Expire the token immediately after first use so it cannot be replayed.
    token_row.expires_at = datetime.now(UTC)
    rows = await _load_guest_registrations_by_email(db, email_norm)
    await db.commit()
    return [registration_to_guest_dict(row, person, event) for row, person, event in rows]


@router.get(
    "/{registration_id}",
    response_model=RegistrationOutWithToken,
    dependencies=[Depends(require_admin)],
)
async def get_registration(
    registration_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    registration = await registrations_service.get_registration_or_404(db, registration_id)
    person_map = await registrations_service.fetch_person_map(db, [registration])
    return registration_to_dict_with_token(registration, person_map[registration.person_id], registration.event)


@router.put(
    "/{registration_id}",
    response_model=RegistrationOut,
    dependencies=[Depends(require_admin)],
)
async def update_registration(
    registration_id: str,
    body: RegistrationUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    registration = await registrations_service.get_registration_or_404(db, registration_id)
    return await registrations_service.apply_registration_update(
        db, registration, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.delete(
    "/{registration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_registration(
    registration_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    registration = await registrations_service.get_registration_or_404(db, registration_id)
    await registrations_service.delete_registration(
        db, registration, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


def _hash_guest_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _guest_access_log_id(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:12]


async def _get_guest_access_token_or_401(
    db: AsyncSession,
    token: str,
) -> ReservationAccessToken:
    token_hash = _hash_guest_access_token(token)
    result = await db.execute(
        select(ReservationAccessToken).where(ReservationAccessToken.token_hash == token_hash).with_for_update()
    )
    token_row = result.scalar_one_or_none()
    if token_row:
        now = datetime.now(UTC)
        expires_at = token_row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at > now:
            return token_row
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired registration access token.",
    )


async def _load_guest_registrations_by_email(
    db: AsyncSession,
    email_norm: str,
) -> list[tuple[Registration, Person, Event]]:
    persons = (await db.execute(select(Person).where(Person.email == email_norm))).scalars().all()
    if not persons:
        return []
    person_map = {person.id: person for person in persons}
    rows = (
        (
            await db.execute(
                select(Registration)
                .options(
                    selectinload(Registration.event).selectinload(Event.edition),
                    selectinload(Registration.event).selectinload(Event.products),
                )
                .where(Registration.person_id.in_(list(person_map.keys())))
                .order_by(Registration.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [(row, person_map[row.person_id], row.event) for row in rows]


async def _ensure_public_registration_allowed(
    db: AsyncSession,
    event: Event,
    requested_guest_count: int,
) -> None:
    if not event.active or not event.edition.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registrations are not available for this event.",
        )
    # Registration is mandatory for events that require it (capacity-limited ones),
    # and optional-but-offered for walk-in events that still have something to
    # order (e.g. a VIP package) — anyone else can just show up. An event with
    # neither accepts no registrations at all.
    if not event.registration_required and not any(p.active for p in event.products):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event does not accept registrations.",
        )

    now = datetime.now(UTC)
    if event.registrations_open_from is not None:
        registrations_open_from = event.registrations_open_from
        if registrations_open_from.tzinfo is None:
            registrations_open_from = registrations_open_from.replace(tzinfo=UTC)
        if registrations_open_from > now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registrations for this event are not open yet.",
            )

    if event.max_capacity is None:
        return

    # Re-fetch the event with a row-level lock so concurrent registrations are
    # serialised and cannot both pass the capacity check (preventing unconfirmed over-capacity assignments).
    locked_event = (await db.execute(select(Event).where(Event.id == event.id).with_for_update())).scalar_one()

    reserved_guest_count = (
        await db.execute(
            select(func.coalesce(func.sum(Registration.guest_count), 0)).where(
                Registration.event_id == locked_event.id,
                Registration.status != "cancelled",
            )
        )
    ).scalar_one()
    assert locked_event.max_capacity is not None  # already guarded at top of function
    if reserved_guest_count + requested_guest_count > locked_event.max_capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event is fully booked.",
        )
