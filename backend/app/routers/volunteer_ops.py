"""Volunteer-accessible operational read endpoints.

Provides registration search for on-site volunteers. These endpoints require
a valid Bearer JWT with at least the ``volunteer`` or ``admin`` role.

No PII (email, phone, address, national_register_number) is returned — only
the fields volunteers need on-site: guest name, party size, event, check-in
and strap status, order items, and internal notes (arrival notes visible to
staff).
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_actor_id, require_volunteer
from app.core.dependencies import Pagination
from app.db.session import get_db
from app.models import Event, Person, Registration, RegistrationAllocation, RegistrationOrderLine, Table
from app.schemas import (
    CheckInGuestOut,
    CheckInOut,
    VolunteerCheckInRequest,
    VolunteerRegistrationUpdate,
    VolunteerTableOrdersOut,
    VolunteerTableOrdersUnresolvedOut,
    VolunteerTableResolveOut,
)
from app.services.allocations_service import allocated_registration_filter
from app.services.check_in_service import check_in_guest
from app.services.operational_search import (
    DEFAULT_RESULT_LIMIT,
    best_registration_match,
    bounded_limit,
    matches_order_filters,
    normalize_table_reference,
    person_search_predicate,
    rank_table_reference,
)
from app.services.registrations_service import update_volunteer_entrance_details
from app.services.serializers import registration_to_checkin_out

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/volunteer",
    tags=["volunteer"],
    dependencies=[Depends(require_volunteer)],
)


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


@router.get("/tables/resolve", response_model=VolunteerTableResolveOut)
async def resolve_table_reference(
    reference: str = Query(min_length=1, description="Visible table number, name, or label"),
    db: AsyncSession = Depends(get_db),
) -> VolunteerTableResolveOut:
    """Resolve a human-facing table reference without fuzzy numeric matching."""

    tables = await _resolve_tables(db, reference)
    return VolunteerTableResolveOut(
        tables=[
            {"table_id": table.id, "table_name": table.name, "capacity": table.capacity, "layout_id": table.layout_id}
            for table in tables
        ],
        count=len(tables),
    )


@router.get(
    "/table-orders",
    response_model=VolunteerTableOrdersOut | VolunteerTableOrdersUnresolvedOut,
)
async def get_table_order_summary(
    table_id: str | None = Query(default=None),
    table_reference: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> VolunteerTableOrdersOut | VolunteerTableOrdersUnresolvedOut:
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
            return VolunteerTableOrdersUnresolvedOut(
                table_reference=table_reference,
                registrations=[],
                candidates=[{"table_id": item.id, "table_name": item.name} for item in candidates],
                message="No table matched this reference."
                if not candidates
                else "Multiple tables matched this reference; choose a table_id.",
            )
        table = candidates[0]
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found.")

    rows = (
        (
            await db.execute(
                select(Registration)
                .where(allocated_registration_filter([table.id]))
                .options(selectinload(Registration.person), selectinload(Registration.event))
                .order_by(Registration.created_at)
            )
        )
        .scalars()
        .all()
    )
    return VolunteerTableOrdersOut(
        table_id=table.id,
        table_name=table.name,
        registrations=[
            registration_to_checkin_out(registration, registration.person, registration.event, table_name=table.name)
            for registration in rows
            if registration.person is not None and registration.event is not None
        ],
        count=len(rows),
    )


@router.get("/registrations", response_model=list[CheckInGuestOut])
async def search_registrations(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, description="Search by guest or table (partial, case-insensitive)"),
    event_id: str | None = Query(default=None, description="Filter to a specific event"),
    order_category: str | None = Query(default=None, description="Filter by exact normalized order category"),
    delivery_state: Literal["pending", "delivered"] | None = Query(default=None, description="Filter matching orders"),
    pagination: Pagination = Depends(),
) -> list[CheckInGuestOut]:
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
                        Registration.allocations.any(
                            RegistrationAllocation.table.has(
                                or_(
                                    Table.id.ilike(table_query_like, escape="\\"),
                                    Table.name.ilike(table_query_like, escape="\\"),
                                )
                            )
                        ),
                    ]
                )
        else:
            or_conditions = [
                person_search_predicate(name=q_stripped, email=q_stripped),
                Registration.id.ilike(q_like, escape="\\"),
                Registration.event_id.ilike(q_like, escape="\\"),
                func.unaccent(Event.title).ilike(func.unaccent(q_like), escape="\\"),
                Registration.order_lines.any(
                    or_(
                        *(
                            func.unaccent(column).ilike(func.unaccent(q_like), escape="\\")
                            for column in (
                                RegistrationOrderLine.product_id,
                                RegistrationOrderLine.name_nl,
                                RegistrationOrderLine.name_fr,
                                RegistrationOrderLine.name_en,
                                RegistrationOrderLine.category,
                            )
                        )
                    )
                ),
            ]
            if table_query:
                table_query_escaped = table_query.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
                table_query_like = f"%{table_query_escaped}%"
                or_conditions.extend(
                    [
                        Registration.allocations.any(
                            RegistrationAllocation.table.has(
                                or_(
                                    Table.id.ilike(table_query_like, escape="\\"),
                                    Table.name.ilike(table_query_like, escape="\\"),
                                )
                            )
                        ),
                    ]
                )
        stmt = stmt.where(or_(*or_conditions))
    rows = (await db.execute(stmt)).all()
    ranked_rows = []
    for registration, table_name in rows:
        if registration.person is None or registration.event is None:
            continue
        if not matches_order_filters(
            registration.order_items,
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
                order_items=registration.order_items,
            )
            if q_stripped
            else None
        )
        if q_stripped:
            matches = [
                rank_table_reference(q_stripped, table_id=a.table_id, table_name=a.table.name)
                for a in registration.allocations
            ]
            candidates = [m for m in [match, *matches] if m is not None]
            match = min(candidates, key=lambda m: (m.rank, m.distance)) if candidates else None
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
        registration_to_checkin_out(registration, registration.person, registration.event, table_name=table_name)
        for _, registration, table_name in ranked_rows[offset : offset + limit]
    ]


@router.put("/registrations/{registration_id}", response_model=CheckInGuestOut)
async def update_volunteer_registration(
    registration_id: str,
    body: VolunteerRegistrationUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> CheckInGuestOut:
    """Update entrance-facing registration fields from volunteer check-in."""

    return await update_volunteer_entrance_details(
        db,
        registration_id,
        body,
        actor=actor,
        request_id=getattr(request.state, "request_id", None),
    )


@router.post("/registrations/{registration_id}/check-in", response_model=CheckInOut)
async def volunteer_check_in_registration(
    registration_id: str,
    body: VolunteerCheckInRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> CheckInOut:
    """Mark a registration checked in from the authenticated volunteer flow.

    This is the QR-code fallback for entrance volunteers. It accepts the same
    ``issue_strap`` flag as the token-gated public check-in endpoint, but uses
    the volunteer/admin Bearer token dependency instead of a per-registration
    QR token. The response remains PII-free.
    """

    return await check_in_guest(
        db,
        registration_id,
        issue_strap=body.issue_strap,
        actor=actor,
        request_id=getattr(request.state, "request_id", None),
    )
