"""Volunteer-accessible operational read endpoints.

Provides registration search for on-site volunteers. These endpoints require
a valid Bearer JWT with at least the ``volunteer`` or ``admin`` role.

No PII (email, phone, address, national_register_number) is returned — only
the fields volunteers need on-site: guest name, party size, event, check-in
and strap status, pre-orders, and internal notes (arrival notes visible to
staff).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.auth import get_actor_id, require_volunteer
from app.database import get_db
from app.dependencies import Pagination
from app.live import live_bus
from app.live import mapping as live_mapping
from app.models import Event, Person, Registration, Table
from app.schemas import CheckInGuestOut, CheckInOut, OrderItemBase
from app.services.operational_search import (
    DEFAULT_RESULT_LIMIT,
    best_registration_match,
    bounded_limit,
    matches_order_filters,
    normalize_table_reference,
    person_search_predicate,
    rank_table_reference,
)
from app.utils import registration_to_checkin_dict

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/volunteer",
    tags=["volunteer"],
    dependencies=[Depends(require_volunteer)],
)


class VolunteerCheckInRequest(BaseModel):
    issue_strap: bool = True


class VolunteerRegistrationUpdate(BaseModel):
    pre_orders: list[OrderItemBase] | None = None
    strap_issued: bool | None = None


async def _resolve_tables(db: AsyncSession, reference: str) -> list[Table]:
    reference = reference.strip()
    if not reference:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Provide a table reference.")
    normalized = normalize_table_reference(reference)
    if not normalized:
        return []
    escaped = normalized.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    rows = (
        (
            await db.execute(
                select(Table)
                .where(or_(Table.id.ilike(f"%{escaped}%", escape="\\"), Table.name.ilike(f"%{escaped}%", escape="\\")))
                .order_by(Table.name)
            )
        )
        .scalars()
        .all()
    )
    ranked = [
        (match, table)
        for table in rows
        if (match := rank_table_reference(reference, table_id=table.id, table_name=table.name)) is not None
    ]
    ranked.sort(key=lambda item: (item[0], item[1].name, item[1].id))
    return [table for _, table in ranked[:DEFAULT_RESULT_LIMIT]]


@router.get("/tables/resolve")
async def resolve_table_reference(
    reference: str = Query(min_length=1, description="Visible table number, name, or label"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Resolve a human-facing table reference without fuzzy numeric matching."""

    tables = await _resolve_tables(db, reference)
    return {
        "tables": [
            {"table_id": table.id, "table_name": table.name, "capacity": table.capacity, "layout_id": table.layout_id}
            for table in tables
        ],
        "count": len(tables),
    }


@router.get("/table-orders")
async def get_table_order_summary(
    table_id: str | None = Query(default=None),
    table_reference: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return PII-free registration and order details for a table."""

    if table_id is None and table_reference is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide 'table_id' or 'table_reference'.",
        )
    table: Table | None = None
    if table_id is not None:
        table = (await db.execute(select(Table).where(Table.id == table_id))).scalar_one_or_none()
    elif table_reference is not None:
        candidates = await _resolve_tables(db, table_reference)
        if len(candidates) != 1:
            return {
                "table_reference": table_reference,
                "registrations": [],
                "candidates": [{"table_id": item.id, "table_name": item.name} for item in candidates],
                "message": (
                    "No table matched this reference."
                    if not candidates
                    else "Multiple tables matched this reference; choose a table_id."
                ),
            }
        table = candidates[0]
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found.")

    rows = (
        (
            await db.execute(
                select(Registration)
                .where(Registration.table_id == table.id)
                .options(selectinload(Registration.person), selectinload(Registration.event))
                .order_by(Registration.created_at)
                .limit(DEFAULT_RESULT_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    return {
        "table_id": table.id,
        "table_name": table.name,
        "registrations": [
            registration_to_checkin_dict(registration, registration.person, registration.event, table_name=table.name)
            for registration in rows
            if registration.person is not None and registration.event is not None
        ],
        "count": len(rows),
    }


@router.get("/registrations", response_model=list[CheckInGuestOut])
async def search_registrations(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, description="Search by guest or table (partial, case-insensitive)"),
    event_id: str | None = Query(default=None, description="Filter to a specific event"),
    order_category: str | None = Query(default=None, description="Filter by exact normalized order category"),
    delivery_state: Literal["pending", "delivered"] | None = Query(default=None, description="Filter matching orders"),
    pagination: Pagination = Depends(),
) -> list[dict]:
    """Search registrations by guest or table for on-site volunteer check-in.

    Returns a minimal, PII-free view of matching registrations. No email,
    phone, or address fields are exposed. The volunteer can use this endpoint
    to look up a guest by name when the QR code is unavailable.

    Results are ordered by guest name then registration creation time.
    Requires ``volunteer`` or ``admin`` role.
    """
    stmt = (
        select(Registration, Table.name)
        .join(Person, Registration.person_id == Person.id)
        .join(Event, Registration.event_id == Event.id)
        .outerjoin(Table, Registration.table_id == Table.id)
        .options(selectinload(Registration.person), selectinload(Registration.event))
        .order_by(Person.name, Registration.created_at)
    )

    if event_id is not None:
        stmt = stmt.where(Registration.event_id == event_id)

    q_stripped = q.strip() if q else ""
    if q_stripped:
        q_escaped = q_stripped.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        q_like = f"%{q_escaped}%"
        table_query = normalize_table_reference(q_stripped)
        if q_stripped.isdigit():
            # Numeric-only queries: skip fuzzy-text predicates; use deterministic matches only.
            or_conditions: list = [
                Registration.id.ilike(q_like, escape="\\"),
                Registration.event_id.ilike(q_like, escape="\\"),
            ]
            if table_query:
                table_query_escaped = table_query.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
                table_query_like = f"%{table_query_escaped}%"
                or_conditions.extend(
                    [
                        Table.id.ilike(table_query_like, escape="\\"),
                        Table.name.ilike(table_query_like, escape="\\"),
                    ]
                )
        else:
            or_conditions = [
                person_search_predicate(name=q_stripped, email=q_stripped),
                Registration.id.ilike(q_like, escape="\\"),
                Registration.event_id.ilike(q_like, escape="\\"),
                func.unaccent(Event.title).ilike(func.unaccent(q_like), escape="\\"),
                func.unaccent(cast(Registration.pre_orders, Text)).ilike(func.unaccent(q_like), escape="\\"),
            ]
            if table_query:
                table_query_escaped = table_query.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
                table_query_like = f"%{table_query_escaped}%"
                or_conditions.extend(
                    [
                        Table.id.ilike(table_query_like, escape="\\"),
                        Table.name.ilike(table_query_like, escape="\\"),
                    ]
                )
        stmt = stmt.where(or_(*or_conditions))
    stmt = stmt.limit(250)
    rows = (await db.execute(stmt)).all()
    ranked_rows = []
    for registration, table_name in rows:
        if registration.person is None or registration.event is None:
            continue
        if not matches_order_filters(
            registration.pre_orders,
            category=order_category,
            delivery_state=delivery_state,
        ):
            continue
        match = (
            best_registration_match(
                q_stripped,
                person_name=registration.person.name,
                person_email=registration.person.email,
                registration_id=registration.id,
                event_id=registration.event_id,
                event_title=registration.event.title,
                table_id=registration.table_id,
                table_name=table_name,
                pre_orders=registration.pre_orders,
            )
            if q_stripped
            else None
        )
        if q_stripped and match is None:
            continue
        ranked_rows.append((match, registration, table_name))

    ranked_rows.sort(
        key=lambda item: (
            item[0] is None,
            item[0].rank if item[0] is not None else 99,
            item[0].distance if item[0] is not None else 0.0,
            item[1].person.name,
            item[1].created_at,
        )
    )
    limit = bounded_limit(pagination.limit or DEFAULT_RESULT_LIMIT)
    offset = (pagination.page - 1) * limit
    return [
        registration_to_checkin_dict(registration, registration.person, registration.event, table_name=table_name)
        for _, registration, table_name in ranked_rows[offset : offset + limit]
    ]


@router.put("/registrations/{registration_id}", response_model=CheckInGuestOut)
async def update_volunteer_registration(
    registration_id: str,
    body: VolunteerRegistrationUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Update entrance-facing registration fields from volunteer check-in."""

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

    previous_orders = list(registration.pre_orders) if registration.pre_orders else []
    previous_strap_issued = registration.strap_issued
    changed = False
    request_id = getattr(request.state, "request_id", None)
    audit_base = {
        "actor": actor,
        "resource_type": "registration",
        "resource_id": registration.id,
        "request_id": request_id,
    }

    if body.pre_orders is not None:
        registration.pre_orders = [item.model_dump() for item in body.pre_orders]
        if registration.pre_orders != previous_orders:
            changed = True
            await write_audit_entry(
                db,
                action="delivery_updated",
                details={"event_id": registration.event_id, "source": "volunteer_check_in"},
                **audit_base,
            )

    if body.strap_issued is not None:
        registration.strap_issued = body.strap_issued
        if registration.strap_issued != previous_strap_issued:
            changed = True
            await write_audit_entry(
                db,
                action="strap_issued" if registration.strap_issued else "strap_revoked",
                details={"event_id": registration.event_id, "source": "volunteer_check_in"},
                **audit_base,
            )

    if changed:
        await db.commit()
        await db.refresh(registration)
        try:
            await live_bus.publish(
                live_mapping.registration_changed(
                    action="updated",
                    registration_id=registration.id,
                    event_id=registration.event_id,
                    edition_id=registration.event.edition_id,
                )
            )
        except Exception:
            logger.warning(
                "live_bus.publish failed for volunteer registration update %s", registration.id, exc_info=True
            )

    return registration_to_checkin_dict(registration, registration.person, registration.event, table_name=table_name)


@router.post("/registrations/{registration_id}/check-in", response_model=CheckInOut)
async def volunteer_check_in_registration(
    registration_id: str,
    body: VolunteerCheckInRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    """Mark a registration checked in from the authenticated volunteer flow.

    This is the QR-code fallback for entrance volunteers. It accepts the same
    ``issue_strap`` flag as the token-gated public check-in endpoint, but uses
    the volunteer/admin Bearer token dependency instead of a per-registration
    QR token. The response remains PII-free.
    """

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

    already = registration.checked_in
    changed = False
    strap_newly_issued = False

    if not already:
        registration.checked_in = True
        registration.checked_in_at = datetime.now(UTC)
        changed = True

    if body.issue_strap and not registration.strap_issued:
        registration.strap_issued = True
        strap_newly_issued = True
        changed = True

    if changed:
        request_id = getattr(request.state, "request_id", None)
        audit_base = {
            "actor": actor,
            "resource_type": "registration",
            "resource_id": registration.id,
            "request_id": request_id,
        }
        if not already:
            await write_audit_entry(
                db,
                action="check_in",
                details={"event_id": registration.event_id, "source": "volunteer_search"},
                **audit_base,
            )
        if strap_newly_issued:
            await write_audit_entry(
                db,
                action="strap_issued",
                details={"event_id": registration.event_id, "source": "volunteer_search"},
                **audit_base,
            )
        await db.commit()
        await db.refresh(registration)
        try:
            await live_bus.publish(
                live_mapping.check_in_changed(
                    registration_id=registration.id,
                    event_id=registration.event_id,
                    edition_id=registration.event.edition_id,
                )
            )
        except Exception:
            logger.warning("live_bus.publish failed for volunteer check-in %s", registration.id, exc_info=True)

    return {
        "registration": registration_to_checkin_dict(
            registration, registration.person, registration.event, table_name=table_name
        ),
        "already_checked_in": already,
    }
