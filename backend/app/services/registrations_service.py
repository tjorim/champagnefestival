"""Shared application-service operations for public and admin registrations."""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.ids import make_id
from app.models import Event, Person, Registration, Table, User
from app.schemas import (
    CheckInGuestOut,
    CheckInOut,
    OrderItemRequest,
    RegistrationAdminCreate,
    RegistrationCreate,
    RegistrationDeliveryUpdate,
    RegistrationOut,
    RegistrationPublicOut,
    RegistrationUpdate,
    StampProgress,
    TableAllocation,
    VolunteerRegistrationUpdate,
)
from app.services import allocations_service, email_consent_service, payments_service, people_service
from app.services import product_inventory as inventory
from app.services.audit_service import write_audit_entry
from app.services.email_service import send_email_consent_confirmation
from app.services.errors import ApiHTTPException, ConflictError, to_http_exception
from app.services.idempotency import (
    check_idempotency_key,
    commit_with_idempotency_guard,
    hash_request,
    record_idempotency_key,
)
from app.services.live import mapping as live_mapping
from app.services.live import notify_live_event
from app.services.member_registration import verified_member
from app.services.outbox_service import enqueue_registration_confirmation
from app.services.serializers import registration_to_checkin_out, registration_to_out
from app.services.users_service import get_or_create_user, verified_email_from_claims
from app.services.visitor_session import actor_for_user

logger = logging.getLogger(__name__)

ADMIN_REGISTRATION_SCOPE = "registrations.admin_create"


def _ensure_public_registration_allowed(event: Event) -> None:
    if not event.active or not event.edition.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registrations are not available for this event.",
        )
    # Registration is mandatory for events that require it (capacity-limited ones),
    # and optional-but-offered for walk-in events that still have something to
    # order (e.g. a VIP package) — anyone else can just show up. An event with
    # neither accepts no registrations at all.
    if not event.registration_required and not any(p.purchasable for p in event.products):
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

    if event.registrations_close_at is not None:
        registrations_close_at = event.registrations_close_at
        if registrations_close_at.tzinfo is None:
            registrations_close_at = registrations_close_at.replace(tzinfo=UTC)
        if registrations_close_at <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registrations for this event have closed.",
            )


async def create_public_registration(
    db: AsyncSession,
    body: RegistrationCreate,
    *,
    claims: dict[str, Any] | None,
    session_user: User | None,
    request_id: str | None,
) -> RegistrationPublicOut:
    user = None
    if claims is not None:
        user = await get_or_create_user(db, claims["sub"])

    event = await inventory.lock_event(db, body.event_id)
    if event.volunteers_only:
        raise ApiHTTPException(
            403, "volunteer_event_poll_required", "Use the volunteer attendance poll to register for this event."
        )
    member_identity = await verified_member(db, session_user) if event.members_only else None
    _ensure_public_registration_allowed(event)
    from app.services.order_questions_service import validate_answers

    order_answers = await validate_answers(db, event.id, body.order_answers)
    resolved_order_items, snapshot = inventory.resolve_booking(event, body.order_items, body.guest_count)
    await inventory.check_stock(db, event, resolved_order_items)

    if member_identity is not None:
        person, user = member_identity
    else:
        email_norm = str(body.email).lower().strip()
        name_norm = " ".join(body.name.lower().split())
        phone_norm = people_service.parse_phone(body.phone)

        candidates = (
            (await db.execute(select(Person).where(Person.email == email_norm, Person.phone == phone_norm)))
            .scalars()
            .all()
        )
        person = next(
            (candidate for candidate in candidates if " ".join(candidate.name.lower().split()) == name_norm),
            None,
        )
        if person is None:
            person = Person(
                id=make_id("per"),
                preferred_language=body.preferred_language,
                name=body.name,
                email=email_norm,
                phone=phone_norm,
            )
            db.add(person)
            await db.flush()
        else:
            if user is not None and await db.scalar(
                select(Registration.id)
                .where(Registration.person_id == person.id, Registration.user_id == user.id)
                .limit(1)
            ):
                person.preferred_language = body.preferred_language

    consent_confirmation = None
    if body.new_editions_opt_in:
        # Ticking the box is a request, not consent: it becomes consent only for a verified address.
        if claims is not None:
            consent_actor, consent_auth_source = claims["sub"], None
        elif session_user is not None:
            consent_actor, consent_auth_source = actor_for_user(session_user, None)
        else:
            consent_actor, consent_auth_source = "anonymous", None
        consent_confirmation = await email_consent_service.request_new_editions_consent(
            db,
            person,
            verified_emails=[
                email
                for email in (verified_email_from_claims(claims), session_user.verified_email if session_user else None)
                if email
            ],
            actor=consent_actor,
            auth_source=consent_auth_source,
            request_id=request_id,
        )
    consent_mail = (
        (person.email, consent_confirmation[0], consent_confirmation[1].localized_name(person.preferred_language))
        if consent_confirmation is not None
        else None
    )
    consent_language = person.preferred_language

    registration = Registration(
        id=make_id("reg"),
        event_id=event.id,
        guest_count=body.guest_count,
        notes=body.notes,
        person_id=person.id,
        user_id=user.id if user else None,
        check_in_token=secrets.token_urlsafe(32),
    )
    registration.order_answers = order_answers
    registration.order_items = resolved_order_items
    registration.product_snapshot = snapshot
    registration.amount_due = inventory.order_total(resolved_order_items) if resolved_order_items else None
    db.add(registration)
    await enqueue_registration_confirmation(
        db,
        registration.id,
        actor=claims["sub"] if claims is not None else "anonymous",
        request_id=request_id,
    )
    await notify_live_event(
        db,
        live_mapping.registration_changed(
            action="created",
            registration_id=registration.id,
            event_id=event.id,
            edition_id=event.edition_id,
        ),
    )
    await db.commit()

    if consent_mail is not None:
        # Best effort, like the sign-in link: the registration stands either way and the person can
        # tick the option again (or use the preferences screen) if the mail does not arrive.
        recipient, token, category_name = consent_mail
        await send_email_consent_confirmation(
            email=recipient, token=token, category_name=category_name, language=consent_language
        )

    registration = await get_registration_or_404(db, registration.id)
    return registration_to_out(registration, person, event, public=True)


async def get_registration_or_404(db: AsyncSession, registration_id: str) -> Registration:
    result = await db.execute(
        select(Registration)
        .options(
            selectinload(Registration.event).selectinload(Event.edition),
            selectinload(Registration.event).selectinload(Event.products),
        )
        .where(Registration.id == registration_id)
    )
    registration = result.scalar_one_or_none()
    if registration is None:
        raise ApiHTTPException(404, "registration_not_found", "Registration not found.")
    return registration


async def assign_registration_to_volunteer(
    db: AsyncSession,
    registration: Registration,
    volunteer_id: str,
    *,
    actor: str,
    request_id: str | None = None,
) -> RegistrationOut:
    """Admin override (#1044): attach an unowned registration to a
    volunteer's own portal account. The same convergent,
    existing-owner-protected write self-service claiming uses
    (``claim_unowned_registrations_for_email``'s existing-owner-protection,
    mirrored here for a single registration), triggered by an admin instead
    of the volunteer themselves — for a booking they never confirmed via the
    claim flow (e.g. an account they rarely sign into, or a booking made
    before they self-registered).
    """
    from app.services.users_service import get_or_create_user

    volunteer = await db.get(Person, volunteer_id)
    if volunteer is None or "volunteer" not in volunteer.roles:
        raise HTTPException(status_code=404, detail="Volunteer not found.")
    if volunteer.oidc_subject is None:
        raise HTTPException(
            status_code=422,
            detail="This volunteer hasn't linked their own account yet, so there's nothing to assign to.",
        )
    user = await get_or_create_user(db, volunteer.oidc_subject, commit=False)

    # Lock and re-check under the lock rather than trusting the caller's
    # already-loaded `registration` snapshot — mirrors
    # `claim_unowned_registrations_for_email`'s `.with_for_update()` guard
    # against two concurrent assignments both observing `user_id IS NULL`.
    locked = (
        await db.execute(
            select(Registration)
            .options(
                selectinload(Registration.event).selectinload(Event.edition),
                selectinload(Registration.event).selectinload(Event.products),
            )
            .where(Registration.id == registration.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if locked is None:
        raise ApiHTTPException(404, "registration_not_found", "Registration not found.")
    registration = locked
    if registration.user_id == user.id:
        person = (await db.execute(select(Person).where(Person.id == registration.person_id))).scalar_one()
        return registration_to_out(registration, person, registration.event)
    if registration.user_id is not None:
        raise HTTPException(
            status_code=409,
            detail="This registration is already linked to an account.",
        )
    registration.user_id = user.id
    await write_audit_entry(
        db,
        actor=actor,
        action="registration_assigned",
        resource_type="registration",
        resource_id=registration.id,
        request_id=request_id,
        details={"volunteer_id": volunteer_id},
    )
    await db.commit()
    person = (await db.execute(select(Person).where(Person.id == registration.person_id))).scalar_one()
    return registration_to_out(registration, person, registration.event)


def ensure_registration_can_check_in(registration: Registration) -> None:
    """Reject entrance mutations for a canceled registration."""
    if registration.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled registrations cannot be checked in.",
        )


async def _get_by_token_or_401(
    db: AsyncSession,
    reservation_id: str,
    token: str,
    *,
    for_update: bool = False,
) -> Registration:
    async def fetch(*, lock: bool) -> Registration | None:
        stmt = select(Registration).where(Registration.id == reservation_id)
        if lock:
            stmt = stmt.with_for_update().execution_options(populate_existing=True)
        return (await db.execute(stmt)).scalar_one_or_none()

    r = await fetch(lock=False)
    if r is None or not r.check_in_token or not secrets.compare_digest(r.check_in_token, token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid registration ID or token.",
        )
    if for_update:
        r = await fetch(lock=True)
        if r is None or not r.check_in_token or not secrets.compare_digest(r.check_in_token, token):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid registration ID or token.",
            )
    return r


async def _guest_check_in_response(db: AsyncSession, registration: Registration, event: Event) -> CheckInGuestOut:
    person = (await db.execute(select(Person).where(Person.id == registration.person_id))).scalar_one()
    table_name = (
        await db.scalar(select(Table.name).where(Table.id == registration.table_id)) if registration.table_id else None
    )
    return registration_to_checkin_out(registration, person, event, table_name=table_name)


async def lookup_guest_check_in(db: AsyncSession, registration_id: str, token: str) -> CheckInGuestOut:
    registration = await _get_by_token_or_401(db, registration_id, token)
    ensure_registration_can_check_in(registration)
    event = (await db.execute(select(Event).where(Event.id == registration.event_id))).scalar_one()
    return await _guest_check_in_response(db, registration, event)


async def check_in_guest(
    db: AsyncSession,
    registration_id: str,
    *,
    issue_strap: bool,
    actor: str,
    request_id: str | None,
    token: str | None = None,
) -> CheckInOut:
    if token is None:
        registration = await db.scalar(
            select(Registration)
            .where(Registration.id == registration_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if registration is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")
    else:
        registration = await _get_by_token_or_401(db, registration_id, token, for_update=True)
    ensure_registration_can_check_in(registration)
    event = (await db.execute(select(Event).where(Event.id == registration.event_id))).scalar_one()
    already = registration.checked_in
    stamp_progress = await check_in_registration(
        db,
        registration,
        edition_id=event.edition_id,
        checked_in=True,
        strap_issued=True if issue_strap else None,
        actor=actor,
        request_id=request_id,
        source="qr" if token is not None else "volunteer_search",
    )
    result = CheckInOut(
        registration=await _guest_check_in_response(db, registration, event),
        already_checked_in=already,
        stamp_progress=stamp_progress,
    )
    await db.commit()
    return result


async def check_in_registration(
    db: AsyncSession,
    registration: Registration,
    *,
    edition_id: str | None,
    checked_in: bool | None,
    strap_issued: bool | None,
    actor: str,
    request_id: str | None,
    source: Literal["admin", "qr", "volunteer_search"] = "admin",
) -> StampProgress | None:
    """Apply attendance and strap transitions under the caller's registration row lock."""
    from app.services.stamp_cards_service import sync_check_in

    attendance_changed = checked_in is not None and checked_in != registration.checked_in
    strap_changed = strap_issued is not None and strap_issued != registration.strap_issued
    stamp_progress = await sync_check_in(db, registration, checked_in) if checked_in is not None else None

    details = {"event_id": registration.event_id}
    if source == "volunteer_search":
        details["source"] = source
    audit_context = {
        "actor": actor,
        "resource_type": "registration",
        "resource_id": registration.id,
        "request_id": request_id,
        "auth_source": "token" if source == "qr" else None,
    }
    if attendance_changed:
        registration.checked_in_at = datetime.now(UTC) if checked_in else None
        registration._legacy_checked_in = registration.checked_in
        await write_audit_entry(
            db,
            action="check_in",
            details={"checked_in": registration.checked_in} if source == "admin" else details,
            **audit_context,
        )
    if strap_issued is not None and strap_changed:
        registration.strap_issued = strap_issued
        await write_audit_entry(
            db,
            action="strap_issued",
            details={"strap_issued": strap_issued} if source == "admin" else details,
            **audit_context,
        )
    if attendance_changed or strap_changed:
        await notify_live_event(
            db,
            live_mapping.check_in_changed(
                registration_id=registration.id,
                event_id=registration.event_id,
                edition_id=edition_id,
            ),
        )
    return stamp_progress


async def fetch_person_map(db: AsyncSession, rows: list[Registration]) -> dict[str, Person]:
    if not rows:
        return {}
    person_ids = {row.person_id for row in rows}
    people = (await db.execute(select(Person).where(Person.id.in_(person_ids)))).scalars().all()
    return {person.id: person for person in people}


def resolve_order_items(event: Event, requests: list[OrderItemRequest], guest_count: int) -> list[dict]:
    """Resolve a new order using current server-side prices and package rules."""
    return inventory.resolve_booking(event, requests, guest_count)[0]


def apply_delivery_updates(order_items: list[dict] | None, updates: list[RegistrationDeliveryUpdate]) -> list[dict]:
    """Apply delivery counts without trusting clients with priced order data."""
    updated = [dict(item) for item in (order_items or [])]
    by_product_id = {item.get("product_id"): item for item in updated}
    seen: set[str] = set()
    for delivery in updates:
        if delivery.product_id in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{delivery.product_id}' appears more than once in the delivery update.",
            )
        seen.add(delivery.product_id)
        item = by_product_id.get(delivery.product_id)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{delivery.product_id}' is not on this registration.",
            )
        quantity = int(item.get("quantity") or 0)
        if delivery.delivered_quantity > quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"delivered_quantity for product '{delivery.product_id}' cannot exceed quantity.",
            )
        item["delivered_quantity"] = delivery.delivered_quantity
        item["delivered"] = delivery.delivered_quantity == quantity
    return updated


async def update_volunteer_entrance_details(
    db: AsyncSession,
    registration_id: str,
    body: VolunteerRegistrationUpdate,
    *,
    actor: str,
    request_id: str | None,
) -> CheckInGuestOut:
    row = (
        await db.execute(
            select(Registration, Table.name)
            .outerjoin(Table, Registration.table_id == Table.id)
            .where(Registration.id == registration_id)
            .options(selectinload(Registration.person), selectinload(Registration.event))
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    registration, table_name = row
    if registration.person is None or registration.event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    previous_orders = list(registration.order_items) if registration.order_items else []
    previous_strap_issued = registration.strap_issued
    changed = False
    delivery_changed = False
    audit_base = {
        "actor": actor,
        "resource_type": "registration",
        "resource_id": registration.id,
        "request_id": request_id,
    }

    if body.order_items is not None:
        new_orders = apply_delivery_updates(previous_orders, body.order_items)
        if new_orders != previous_orders:
            registration.order_items = new_orders
            changed = True
            delivery_changed = True
            await write_audit_entry(
                db,
                action="delivery_updated",
                details={"event_id": registration.event_id, "source": "volunteer_check_in"},
                **audit_base,
            )

    if body.strap_issued is not None and body.strap_issued != previous_strap_issued:
        registration.strap_issued = body.strap_issued
        changed = True
        await write_audit_entry(
            db,
            action="strap_issued" if registration.strap_issued else "strap_revoked",
            details={"event_id": registration.event_id, "source": "volunteer_check_in"},
            **audit_base,
        )

    if changed:
        scope = {
            "registration_id": registration.id,
            "event_id": registration.event_id,
            "edition_id": registration.event.edition_id,
        }
        if delivery_changed:
            await notify_live_event(db, live_mapping.delivery_changed(**scope))
        if registration.strap_issued != previous_strap_issued:
            await notify_live_event(db, live_mapping.check_in_changed(**scope))
        await db.commit()

    return registration_to_checkin_out(registration, registration.person, registration.event, table_name=table_name)


async def admin_create_registration(
    db: AsyncSession,
    *,
    body: RegistrationAdminCreate,
    actor: str,
    request_id: str | None = None,
    commit: bool = True,
    poll_question_id: str | None = None,
) -> RegistrationOut:
    idempotency_key = body.idempotency_key if commit else None
    request_hash = hash_request(body.model_dump(mode="json", exclude={"idempotency_key"}))
    if idempotency_key:
        try:
            cached = await check_idempotency_key(
                db, scope=ADMIN_REGISTRATION_SCOPE, key=idempotency_key, actor=actor, request_hash=request_hash
            )
        except ConflictError as exc:
            raise to_http_exception(exc) from exc
        if cached is not None:
            response = RegistrationOut.model_validate(cached)
            response._from_idempotency_replay = True
            return response

    person = await people_service.get_person_or_404(db, body.person_id)
    event = await inventory.lock_event(db, body.event_id)
    from app.services.order_questions_service import validate_answers

    order_answers = await validate_answers(db, event.id, body.order_answers, admin=True)
    resolved_order_items, snapshot = inventory.resolve_booking(event, body.order_items, body.guest_count)
    if body.status != "cancelled":
        await inventory.check_stock(db, event, resolved_order_items)

    registration = Registration(
        id=make_id("reg"),
        poll_question_id=poll_question_id,
        event_id=event.id,
        guest_count=body.guest_count,
        notes=body.notes,
        status=body.status,
        person_id=person.id,
        check_in_token=secrets.token_urlsafe(32),
    )
    registration.order_answers = order_answers
    registration.order_items = resolved_order_items
    registration.product_snapshot = snapshot
    registration.amount_due = inventory.order_total(resolved_order_items) if resolved_order_items else None
    db.add(registration)
    await write_audit_entry(
        db,
        actor=actor,
        action="registration_created",
        resource_type="registration",
        resource_id=registration.id,
        request_id=request_id,
        details={"event_id": event.id, "person_id": person.id},
    )
    await enqueue_registration_confirmation(db, registration.id, actor=actor, request_id=request_id)
    await notify_live_event(
        db,
        live_mapping.registration_changed(
            action="created",
            registration_id=registration.id,
            event_id=event.id,
            edition_id=event.edition_id,
        ),
    )
    if not commit:
        await db.flush()
        registration = await get_registration_or_404(db, registration.id)
        return registration_to_out(registration, person, event)

    # The replayed response is staged in the same transaction as the booking, so
    # it is only ever visible once the booking is committed.
    if idempotency_key:
        # Stored in its serialized form: the order totals are Decimals, which the JSON column cannot hold.
        response = RegistrationOut.model_validate(
            registration_to_out(await get_registration_or_404(db, registration.id), person, event)
        ).model_dump(mode="json")
        record_idempotency_key(
            db,
            scope=ADMIN_REGISTRATION_SCOPE,
            key=idempotency_key,
            actor=actor,
            request_hash=request_hash,
            response_body=response,
        )
    try:
        await commit_with_idempotency_guard(db, idempotency_key=idempotency_key)
    except ConflictError as exc:
        raise to_http_exception(exc) from exc
    registration = await get_registration_or_404(db, registration.id)
    return registration_to_out(registration, person, event)


async def apply_registration_update(
    db: AsyncSession,
    registration: Registration,
    body: RegistrationUpdate,
    *,
    actor: str,
    request_id: str | None = None,
    clear_amount_due: bool = False,
    commit: bool = True,
    from_poll: bool = False,
) -> RegistrationOut:
    """Apply a partial registration update and return the refreshed payload.

    ``clear_amount_due`` exists for the MCP adapter, whose
    kwargs cannot distinguish "omitted" from "explicitly null" for this
    nullable field — REST expresses the same intent via an explicit ``null``
    in the JSON body, which already lands in ``body.model_fields_set`` and so
    never needs the flags (it always passes ``False``).
    """
    await inventory.lock_event(db, registration.event_id)
    registration = (
        await db.execute(
            select(Registration)
            .options(
                selectinload(Registration.event).selectinload(Event.edition),
                selectinload(Registration.event).selectinload(Event.products),
            )
            .where(Registration.id == registration.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()

    if registration.poll_question_id and not from_poll:
        for field in ("guest_count", "status", "person_id"):
            if field in body.model_fields_set and getattr(body, field) != getattr(registration, field):
                raise ApiHTTPException(
                    409, "poll_registration_managed", "Change attendance through the linked volunteer poll."
                )
    pre_allocations = [
        TableAllocation(table_id=a.table_id, guest_count=a.guest_count, exclusive=a.exclusive)
        for a in registration.allocations
    ]
    pre_guest_count = registration.guest_count
    pre_order_items = list(registration.order_items) if registration.order_items else []
    pre_status = registration.status
    pre_payment_status = registration.payment_status
    pre_amount_due = registration.amount_due
    event_id = registration.event_id
    edition_id = registration.event.edition_id

    target_status = body.status if body.status is not None else registration.status
    target_guest_count = body.guest_count if body.guest_count is not None else registration.guest_count
    if target_guest_count != registration.guest_count:
        registration.guest_count = target_guest_count

    target_checked_in = body.checked_in if body.checked_in is not None else registration.checked_in
    if target_status == "cancelled" and target_checked_in:
        raise ApiHTTPException(
            status.HTTP_409_CONFLICT,
            "checked_in_cannot_cancel",
            "A checked-in registration must be unchecked before it can be cancelled.",
        )

    if body.status is not None:
        registration.status = body.status
        if body.status == "cancelled" and pre_status != "cancelled":
            registration.check_in_token = secrets.token_urlsafe(32)
    if clear_amount_due:
        registration.amount_due = None
    elif "amount_due" in body.model_fields_set:
        registration.amount_due = body.amount_due

    allocation_entries = [] if target_status == "cancelled" else body.allocations
    capacity_override_used = False

    if body.notes is not None:
        registration.notes = body.notes
    if "person_id" in body.model_fields_set:
        if body.person_id is None:
            raise HTTPException(
                status_code=400, detail="person_id cannot be removed; every registration requires a person."
            )
        if body.person_id != registration.person_id:
            from app.services.stamp_cards_service import guard_registration_history

            await guard_registration_history(db, registration.id)
        await people_service.get_person_or_404(db, body.person_id)
        registration.person_id = body.person_id
    resolved_items = pre_order_items
    if body.order_items is not None or registration.guest_count != pre_guest_count:
        requests = body.order_items if body.order_items is not None else inventory.purchased_requests(pre_order_items)
        resolved_items, snapshot = inventory.resolve_booking(
            registration.event,
            requests,
            registration.guest_count,
            previous_snapshot=registration.product_snapshot,
            previous_items=pre_order_items,
        )
        registration.product_snapshot = snapshot
        if body.order_items is not None or pre_order_items:
            registration.amount_due = inventory.order_total(resolved_items)
    if target_status != "cancelled":
        # Validate against the pre-change reservation before assigning new items/status.
        registration.status = pre_status
        with db.no_autoflush:
            await inventory.check_stock(db, registration.event, resolved_items, registration=registration)
        registration.status = target_status
    registration.order_items = resolved_items
    if allocation_entries is not None or (
        registration.allocations and {"guest_count", "status", "order_items"} & body.model_fields_set
    ):
        selected = allocation_entries if allocation_entries is not None else pre_allocations
        with db.no_autoflush:
            if target_status != "cancelled":
                await allocations_service.validate_allocations(
                    db, registration, selected, confirm_over_capacity=body.confirm_over_capacity
                )
        if allocation_entries is not None:
            allocations_service.replace_allocations(registration, selected)
        capacity_override_used |= bool(body.confirm_over_capacity and selected)
    if registration.amount_due != pre_amount_due:
        # amount_paid/payment_status are ledger-derived (#1019, see
        # payments_service) — this booking's paid total doesn't change just
        # because amount_due did, but payment_status can (e.g. a partly-paid
        # booking becomes "paid" once its due amount is lowered to match).
        await payments_service.sync_registration_payment_fields(db, registration)
    stamp_progress = None
    if body.checked_in is not None or body.strap_issued is not None:
        stamp_progress = await check_in_registration(
            db,
            registration,
            edition_id=edition_id,
            checked_in=body.checked_in,
            strap_issued=body.strap_issued,
            actor=actor,
            request_id=request_id,
        )

    audit_base = {"resource_type": "registration", "resource_id": registration.id, "request_id": request_id}
    if capacity_override_used:
        await write_audit_entry(
            db,
            actor=actor,
            action="table_capacity_exceeded_confirmed",
            details={"table_id": registration.table_id, "guest_count": registration.guest_count},
            **audit_base,
        )
    if registration.guest_count != pre_guest_count:
        await write_audit_entry(
            db,
            actor=actor,
            action="guest_count_changed",
            details={"previous_guest_count": pre_guest_count, "guest_count": registration.guest_count},
            **audit_base,
        )
    if registration.order_items != pre_order_items:
        await write_audit_entry(db, actor=actor, action="order_updated", details={}, **audit_base)
    if registration.status != pre_status or registration.payment_status != pre_payment_status:
        await write_audit_entry(
            db,
            actor=actor,
            action="registration_status_changed",
            details={
                "status": registration.status,
                "payment_status": registration.payment_status,
            },
            **audit_base,
        )
    if registration.amount_due != pre_amount_due:
        await write_audit_entry(
            db,
            actor=actor,
            action="amount_due_updated",
            details={
                "amount_due": float(registration.amount_due) if registration.amount_due is not None else None,
                "previous_amount_due": float(pre_amount_due) if pre_amount_due is not None else None,
            },
            **audit_base,
        )

    scope = {"registration_id": registration.id, "event_id": event_id, "edition_id": edition_id}
    if allocation_entries is not None:
        await write_audit_entry(
            db,
            actor=actor,
            action="table_allocations_updated",
            details={
                "before": [a.model_dump() for a in pre_allocations],
                "after": [a.model_dump() for a in allocation_entries],
                "capacity_override": capacity_override_used,
            },
            **audit_base,
        )
    if allocation_entries is not None:
        await notify_live_event(db, live_mapping.seating_changed(**scope))
    if registration.order_items != pre_order_items:
        await notify_live_event(db, live_mapping.order_changed(**scope))
    metadata_fields = {
        "order_answers",
        "guest_count",
        "status",
        "amount_due",
        "notes",
        "person_id",
    }
    if any(f in body.model_fields_set for f in metadata_fields) or clear_amount_due:
        await notify_live_event(db, live_mapping.registration_changed(action="updated", **scope))

    if body.order_answers is not None:
        from app.services.order_questions_service import validate_answers

        registration.order_answers = await validate_answers(db, registration.event_id, body.order_answers, admin=True)
        await write_audit_entry(
            db,
            actor=actor,
            action="order_answers_set",
            resource_type="registration",
            resource_id=registration.id,
            request_id=request_id,
            details={"answer_count": len(registration.order_answers)},
        )
    if commit:
        await db.commit()
    else:
        await db.flush()
    registration = await get_registration_or_404(db, registration.id)
    person_map = await fetch_person_map(db, [registration])

    result = registration_to_out(registration, person_map[registration.person_id], registration.event)
    result = result.model_copy(update={"stamp_progress": stamp_progress})
    return result


async def delete_registration(
    db: AsyncSession, registration: Registration, *, actor: str, request_id: str | None = None
) -> dict:
    await inventory.lock_event(db, registration.event_id)
    from app.services.stamp_cards_service import guard_registration_history

    await guard_registration_history(db, registration.id)
    if registration.poll_question_id:
        raise ApiHTTPException(409, "poll_registration_managed", "Change attendance through the linked volunteer poll.")
    reg_id = registration.id
    event_id = registration.event_id
    edition_id = registration.event.edition_id
    await write_audit_entry(
        db,
        actor=actor,
        action="registration_deleted",
        resource_type="registration",
        resource_id=reg_id,
        request_id=request_id,
        details={"event_id": event_id},
    )
    await db.delete(registration)
    try:
        # Inside the guard: notify_live_event's execute autoflushes the pending
        # DELETE (SQLAlchemy 2.1), which is where the RESTRICT violation fires.
        await notify_live_event(
            db,
            live_mapping.registration_changed(
                action="deleted",
                registration_id=reg_id,
                event_id=event_id,
                edition_id=edition_id,
            ),
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # payment_transactions.registration_id is ondelete="RESTRICT" (#1019):
        # a booking with recorded ledger entries must not silently lose them.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This booking has recorded payment transactions and cannot be deleted.",
        ) from exc
    return {"deleted": True, "id": reg_id}
