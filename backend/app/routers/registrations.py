"""Registration CRUD endpoints."""

from __future__ import annotations

import collections
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models import Edition, Event, Person, Registration, ReservationAccessToken
from app.routers.people import normalize_phone
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

_RATE_LIMIT_MAX_REQUESTS = 5
_RATE_LIMIT_WINDOW_SECONDS = 600
_rate_limit_buckets: dict[str, collections.deque[datetime]] = {}


def _check_rate_limit(client_ip: str) -> bool:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=_RATE_LIMIT_WINDOW_SECONDS)
    bucket = _rate_limit_buckets.setdefault(client_ip, collections.deque())
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT_MAX_REQUESTS:
        return False
    bucket.append(now)
    return True


@router.post("", response_model=RegistrationOut, status_code=status.HTTP_201_CREATED)
async def create_registration(
    body: RegistrationCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    check_honeypot(body.honeypot)
    check_form_timing(body.form_start_time)

    event = await _get_event_or_404(db, body.event_id)
    await _ensure_public_registration_allowed(db, event, body.guest_count)

    email_norm = str(body.email).lower().strip()
    name_norm = " ".join(body.name.lower().split())
    phone_norm = normalize_phone(body.phone)

    candidates = (
        await db.execute(
            select(Person).where(Person.email == email_norm, Person.phone == phone_norm)
        )
    ).scalars().all()
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
        check_in_token=make_id("tok"),
    )
    registration.pre_orders = [item.model_dump() for item in body.pre_orders]
    db.add(registration)
    await db.commit()

    registration = await _get_registration_or_404(db, registration.id)
    registration._person = person
    registration._event = event
    return registration_to_dict(registration)


@router.post(
    "/admin",
    response_model=RegistrationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def admin_create_registration(
    body: RegistrationAdminCreate,
    db: AsyncSession = Depends(get_db),
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
        check_in_token=make_id("tok"),
    )
    registration.pre_orders = [item.model_dump() for item in body.pre_orders]
    db.add(registration)
    await db.commit()

    registration = await _get_registration_or_404(db, registration.id)
    registration._person = person
    registration._event = event
    return registration_to_dict(registration)


@router.get(
    "",
    response_model=list[RegistrationListOut],
    dependencies=[Depends(require_admin)],
)
async def list_registrations(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, description="Search by name or email (case-insensitive)"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status: pending | confirmed | cancelled"),
    event_id: str | None = Query(default=None, description="Filter by event ID"),
    table_id: str | None = Query(default=None, description="Filter by table ID"),
    edition_type: str | None = Query(default=None, description="Filter by the event edition type"),
) -> list[dict]:
    stmt = (
        select(Registration)
        .options(selectinload(Registration.event).selectinload(Event.edition))
        .order_by(Registration.created_at.desc())
    )

    if q:
        q_escaped = q.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        q_like = f"%{q_escaped}%"
        person_subquery = select(Person.id).where(
            or_(
                Person.name.ilike(q_like, escape="\\"),
                Person.email.ilike(q_like, escape="\\"),
            )
        )
        stmt = stmt.where(Registration.person_id.in_(person_subquery))
    if status_filter:
        stmt = stmt.where(Registration.status == status_filter)
    if event_id:
        stmt = stmt.where(Registration.event_id == event_id)
    if table_id:
        stmt = stmt.where(Registration.table_id == table_id)
    if edition_type:
        stmt = stmt.join(Registration.event).join(Event.edition).where(Edition.edition_type == edition_type)

    rows = (await db.execute(stmt)).scalars().all()
    await _attach_people_and_events(db, rows)
    return [registration_to_list_dict(row) for row in rows]


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
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    email_norm = str(body.email).lower().strip()
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.guest_access_token_ttl_minutes)
    request_id = _guest_access_log_id(email_norm)
    token_hash = _hash_guest_access_token(token)

    await db.execute(
        delete(ReservationAccessToken).where(ReservationAccessToken.expires_at < now)
    )
    existing_token_row = (
        await db.execute(
            select(ReservationAccessToken).where(ReservationAccessToken.email == email_norm)
        )
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
            await db.execute(
                select(ReservationAccessToken).where(ReservationAccessToken.email == email_norm)
            )
        ).scalar_one_or_none()
        if existing_token_row is None:
            raise
        existing_token_row.token_hash = token_hash
        existing_token_row.expires_at = expires_at
        existing_token_row.created_at = now
        existing_token_row.last_used_at = None
        await db.commit()

    logger.info(
        "Prepared guest registration access token request_id=%s delivery_mode=email expires_at=%s",
        request_id,
        expires_at.isoformat(),
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
    token_row.last_used_at = datetime.now(timezone.utc)
    rows = await _load_guest_registrations_by_email(db, token_row.email)
    await db.commit()
    return [registration_to_guest_dict(row) for row in rows]


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
    await _attach_people_and_events(db, [registration])
    return registration_to_dict_with_token(registration)


@router.put(
    "/{registration_id}",
    response_model=RegistrationOut,
    dependencies=[Depends(require_admin)],
)
async def update_registration(
    registration_id: str,
    body: RegistrationUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    registration = await _get_registration_or_404(db, registration_id)

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
            raise HTTPException(status_code=400, detail="person_id cannot be removed; every registration requires a person.")
        await _get_person_or_404(db, body.person_id)
        registration.person_id = body.person_id
    if body.pre_orders is not None:
        registration.pre_orders = [item.model_dump() for item in body.pre_orders]
    if body.checked_in is not None:
        if body.checked_in and not registration.checked_in:
            registration.checked_in_at = datetime.now(timezone.utc)
        if not body.checked_in:
            registration.checked_in_at = None
        registration.checked_in = body.checked_in
    if body.strap_issued is not None:
        registration.strap_issued = body.strap_issued

    await db.commit()
    registration = await _get_registration_or_404(db, registration.id)
    await _attach_people_and_events(db, [registration])
    return registration_to_dict(registration)


@router.delete(
    "/{registration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_registration(
    registration_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    registration = await _get_registration_or_404(db, registration_id)
    await db.delete(registration)
    await db.commit()


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
        select(ReservationAccessToken).where(ReservationAccessToken.token_hash == token_hash)
    )
    token_row = result.scalar_one_or_none()
    if token_row:
        now = datetime.now(timezone.utc)
        expires_at = token_row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at > now:
            return token_row
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired registration access token.",
    )


async def _load_guest_registrations_by_email(
    db: AsyncSession,
    email_norm: str,
) -> list[Registration]:
    persons = (await db.execute(select(Person).where(Person.email == email_norm))).scalars().all()
    if not persons:
        return []
    person_map = {person.id: person for person in persons}
    rows = (
        await db.execute(
            select(Registration)
            .options(selectinload(Registration.event).selectinload(Event.edition))
            .where(Registration.person_id.in_(list(person_map.keys())))
            .order_by(Registration.created_at.desc())
        )
    ).scalars().all()
    for row in rows:
        row._person = person_map.get(row.person_id)
        row._event = row.event
    return rows


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
    result = await db.execute(
        select(Event).options(selectinload(Event.edition)).where(Event.id == event_id)
    )
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

    now = datetime.now(timezone.utc)
    if event.registrations_open_from is not None:
        registrations_open_from = event.registrations_open_from
        if registrations_open_from.tzinfo is None:
            registrations_open_from = registrations_open_from.replace(tzinfo=timezone.utc)
        if registrations_open_from > now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registrations for this event are not open yet.",
            )

    if event.max_capacity is None:
        return

    reserved_guest_count = (
        await db.execute(
            select(func.coalesce(func.sum(Registration.guest_count), 0)).where(
                Registration.event_id == event.id,
                Registration.status != "cancelled",
            )
        )
    ).scalar_one()
    if reserved_guest_count + requested_guest_count > event.max_capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This event is fully booked.",
        )


async def _attach_people_and_events(db: AsyncSession, rows: list[Registration]) -> None:
    if not rows:
        return
    person_ids = {row.person_id for row in rows}
    people = (await db.execute(select(Person).where(Person.id.in_(person_ids)))).scalars().all()
    person_map = {person.id: person for person in people}
    for row in rows:
        row._person = person_map.get(row.person_id)
        row._event = row.event
