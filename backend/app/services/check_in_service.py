"""Check-in operations: the QR and volunteer-search entrance flow and the shared attendance/strap transition.

Split from ``app.services.registrations_service``; the admin registration update calls ``check_in_registration`` too."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Person, Registration, Table
from app.schemas import (
    CheckInGuestOut,
    CheckInOut,
    StampProgress,
)
from app.services.audit_service import write_audit_entry
from app.services.live import mapping as live_mapping
from app.services.live import notify_live_event
from app.services.serializers import registration_to_checkin_out


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
