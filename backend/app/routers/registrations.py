"""Registration CRUD endpoints."""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import StreamingResponse

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_admin
from app.config import settings
from app.database import get_db
from app.dependencies import Pagination, apply_pagination
from app.email import send_guest_access_email
from app.live import live_bus
from app.live import mapping as live_mapping
from app.models import Edition, Event, Person, Registration, ReservationAccessToken, Table
from app.ratelimit import check_rate_limit
from app.routers.people import parse_phone
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
from app.services.operational_search import (
    DEFAULT_RESULT_LIMIT,
    bounded_limit,
    person_search_order_by,
    person_search_predicate,
)
from app.spam import check_form_timing, check_honeypot
from app.utils import (
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
    db: AsyncSession = Depends(get_db),
) -> dict:
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
    check_honeypot(body.honeypot)
    check_form_timing(body.form_start_time)

    event = await _get_event_or_404(db, body.event_id)
    await _ensure_public_registration_allowed(db, event, body.guest_count)

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
        check_in_token=secrets.token_urlsafe(32),
    )
    registration.pre_orders = [item.model_dump() for item in body.pre_orders]
    db.add(registration)
    await db.commit()

    registration = await _get_registration_or_404(db, registration.id)
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
    person = await _get_person_or_404(db, body.person_id)
    event = await _get_event_or_404(db, body.event_id)

    registration = Registration(
        id=make_id("reg"),
        event_id=event.id,
        guest_count=body.guest_count,
        notes=body.notes,
        accessibility_note=body.accessibility_note,
        status=body.status,
        person_id=person.id,
        check_in_token=secrets.token_urlsafe(32),
    )
    registration.pre_orders = [item.model_dump() for item in body.pre_orders]
    db.add(registration)
    await write_audit_entry(
        db,
        actor=actor,
        action="registration_created",
        resource_type="registration",
        resource_id=registration.id,
        request_id=getattr(request.state, "request_id", None),
        details={"event_id": event.id, "person_id": person.id},
    )
    await db.commit()

    registration = await _get_registration_or_404(db, registration.id)
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
        .options(selectinload(Registration.event).selectinload(Event.edition))
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
    person_map = await _fetch_person_map(db, list(rows))
    return [registration_to_list_dict(row, person_map[row.person_id], row.event) for row in rows]


@router.get("/export", dependencies=[Depends(require_admin)])
async def export_registrations_csv(
    event_id: str,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export the guest list for one event as CSV (name, table, party size, status)."""
    event = await _get_event_or_404(db, event_id)

    stmt = (
        select(Registration)
        .where(Registration.event_id == event_id, Registration.status != "cancelled")
        .order_by(Registration.created_at)
    )
    rows = (await db.execute(stmt)).scalars().all()
    person_map = await _fetch_person_map(db, list(rows))

    table_ids = {row.table_id for row in rows if row.table_id}
    table_map: dict[str, str] = {}
    if table_ids:
        tables = (await db.execute(select(Table).where(Table.id.in_(table_ids)))).scalars().all()
        table_map = {t.id: t.name for t in tables}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["Name", "Email", "Phone", "Table", "Guests", "Status", "Payment", "Checked In", "Strap Issued", "Notes"]
    )
    for row in rows:
        person = person_map[row.person_id]
        writer.writerow(
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
            ]
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
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
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
    registration = await _get_registration_or_404(db, registration_id)
    person_map = await _fetch_person_map(db, [registration])
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
    registration = await _get_registration_or_404(db, registration_id)

    # Capture pre-state for live-update topic detection.
    _pre_table_id = registration.table_id
    _pre_pre_orders = list(registration.pre_orders) if registration.pre_orders else []
    _pre_delivery_sum = _sum_delivered(registration.pre_orders)
    _pre_checked_in = registration.checked_in
    _pre_strap_issued = registration.strap_issued
    _pre_status = registration.status
    _pre_payment_status = registration.payment_status
    _event_id = registration.event_id
    _edition_id = registration.event.edition_id

    if body.status is not None:
        registration.status = body.status
    if body.payment_status is not None:
        registration.payment_status = body.payment_status
    if "table_id" in body.model_fields_set:
        registration.table_id = body.table_id
    if body.notes is not None:
        registration.notes = body.notes
    if body.accessibility_note is not None:
        registration.accessibility_note = body.accessibility_note
    if "person_id" in body.model_fields_set:
        if body.person_id is None:
            raise HTTPException(
                status_code=400, detail="person_id cannot be removed; every registration requires a person."
            )
        await _get_person_or_404(db, body.person_id)
        registration.person_id = body.person_id
    if body.pre_orders is not None:
        registration.pre_orders = [item.model_dump() for item in body.pre_orders]
    if body.checked_in is not None:
        if body.checked_in and not registration.checked_in:
            registration.checked_in_at = datetime.now(UTC)
        if not body.checked_in:
            registration.checked_in_at = None
        registration.checked_in = body.checked_in
    if body.strap_issued is not None:
        registration.strap_issued = body.strap_issued

    _request_id = getattr(request.state, "request_id", None)
    _audit_base = {"resource_type": "registration", "resource_id": registration.id, "request_id": _request_id}
    if "table_id" in body.model_fields_set and body.table_id != _pre_table_id:
        action = "table_unassigned" if body.table_id is None else "table_assigned"
        await write_audit_entry(
            db,
            actor=actor,
            action=action,
            details={"table_id": body.table_id, "previous_table_id": _pre_table_id},
            **_audit_base,
        )
    if body.pre_orders is not None and registration.pre_orders != _pre_pre_orders:
        action = "delivery_updated" if _sum_delivered(registration.pre_orders) != _pre_delivery_sum else "order_updated"
        await write_audit_entry(db, actor=actor, action=action, details={}, **_audit_base)
    if body.checked_in is not None and registration.checked_in != _pre_checked_in:
        await write_audit_entry(
            db,
            actor=actor,
            action="check_in",
            details={"checked_in": registration.checked_in},
            **_audit_base,
        )
    if body.strap_issued is not None and registration.strap_issued != _pre_strap_issued:
        await write_audit_entry(
            db,
            actor=actor,
            action="strap_issued",
            details={"strap_issued": registration.strap_issued},
            **_audit_base,
        )
    if registration.status != _pre_status or registration.payment_status != _pre_payment_status:
        await write_audit_entry(
            db,
            actor=actor,
            action="registration_status_changed",
            details={
                "status": registration.status,
                "payment_status": registration.payment_status,
            },
            **_audit_base,
        )

    await db.commit()
    registration = await _get_registration_or_404(db, registration.id)
    person_map = await _fetch_person_map(db, [registration])

    # Publish live-update events; bus errors must never break write responses.
    try:
        _scope = {"registration_id": registration.id, "event_id": _event_id, "edition_id": _edition_id}
        if registration.table_id != _pre_table_id:
            await live_bus.publish(live_mapping.seating_changed(table_id=registration.table_id, **_scope))
        if body.pre_orders is not None and registration.pre_orders != _pre_pre_orders:
            if _sum_delivered(registration.pre_orders) != _pre_delivery_sum:
                await live_bus.publish(live_mapping.delivery_changed(**_scope))
            else:
                await live_bus.publish(live_mapping.order_changed(**_scope))
        if registration.checked_in != _pre_checked_in or registration.strap_issued != _pre_strap_issued:
            await live_bus.publish(live_mapping.check_in_changed(**_scope))
        _metadata = {"status", "payment_status", "notes", "accessibility_note", "person_id"}
        if any(f in body.model_fields_set for f in _metadata):
            await live_bus.publish(live_mapping.registration_changed(action="updated", **_scope))
    except Exception:
        logger.warning("live_bus.publish failed for registration %s", registration.id, exc_info=True)

    return registration_to_dict(registration, person_map[registration.person_id], registration.event)


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
    registration = await _get_registration_or_404(db, registration_id)
    _reg_id = registration.id
    _event_id = registration.event_id
    _edition_id = registration.event.edition_id
    await write_audit_entry(
        db,
        actor=actor,
        action="registration_deleted",
        resource_type="registration",
        resource_id=_reg_id,
        request_id=getattr(request.state, "request_id", None),
        details={"event_id": _event_id},
    )
    await db.delete(registration)
    await db.commit()
    try:
        await live_bus.publish(
            live_mapping.registration_changed(
                action="deleted",
                registration_id=_reg_id,
                event_id=_event_id,
                edition_id=_edition_id,
            )
        )
    except Exception:
        logger.warning("live_bus.publish failed for deleted registration %s", _reg_id, exc_info=True)


def _sum_delivered(pre_orders: list[dict] | None) -> int:
    if not pre_orders:
        return 0
    return sum(int(item.get("delivered_quantity") or 0) for item in pre_orders)


def _hash_guest_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _guest_access_log_id(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:12]


async def _get_guest_access_token_or_401(
    db: AsyncSession,
    token: str,
) -> ReservationAccessToken:
    token_hash = _hash_guest_access_token(token)
    result = await db.execute(select(ReservationAccessToken).where(ReservationAccessToken.token_hash == token_hash))
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
                .options(selectinload(Registration.event).selectinload(Event.edition))
                .where(Registration.person_id.in_(list(person_map.keys())))
                .order_by(Registration.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [(row, person_map[row.person_id], row.event) for row in rows]


async def _get_registration_or_404(db: AsyncSession, registration_id: str) -> Registration:
    result = await db.execute(
        select(Registration)
        .options(selectinload(Registration.event).selectinload(Event.edition))
        .where(Registration.id == registration_id)
    )
    registration = result.scalar_one_or_none()
    if registration is None:
        raise HTTPException(status_code=404, detail="Registration not found.")
    return registration


async def _get_person_or_404(db: AsyncSession, person_id: str) -> Person:
    result = await db.execute(select(Person).where(Person.id == person_id))
    person = result.scalar_one_or_none()
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found.")
    return person


async def _get_event_or_404(db: AsyncSession, event_id: str) -> Event:
    result = await db.execute(select(Event).options(selectinload(Event.edition)).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


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
    if not event.registration_required:
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
    # serialised and cannot both pass the capacity check (preventing overbooking).
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


async def _fetch_person_map(db: AsyncSession, rows: list[Registration]) -> dict[str, Person]:
    if not rows:
        return {}
    person_ids = {row.person_id for row in rows}
    people = (await db.execute(select(Person).where(Person.id.in_(person_ids)))).scalars().all()
    return {person.id: person for person in people}
