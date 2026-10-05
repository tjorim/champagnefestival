"""People CRUD endpoints (admin-only).

Business logic — identity normalisation, phone parsing, and the
create/update/delete/merge transitions — lives in
``app.services.people_service`` and is shared with ``app.mcp.admin.people``.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import ListQuery, get_request_id
from app.models import Event, Person, Registration
from app.schemas import (
    PersonAdminSummaryOut,
    PersonCreate,
    PersonListEnvelope,
    PersonOut,
    PersonPaymentSummary,
    PersonUpdate,
)
from app.services import payments_service, people_service
from app.services.people_listing import PersonSortKey, filtered_people_stmt, order_people_stmt
from app.utils import person_to_dict, registration_to_list_dict

# The identity-field anonymisation window (docs/decisions/934-data-retention-and-erasure.md):
# 7 years after a person's most recent registration's event date. 365.25 days/year
# is precise enough for a "due" surface an admin reviews manually — not a hard
# legal cutoff computed to the day.
ANONYMISATION_WINDOW = timedelta(days=round(365.25 * 7))

router = APIRouter(
    prefix="/api/people",
    tags=["people"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(
    body: PersonCreate,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    return await people_service.create_person(db, body=body, actor=actor, request_id=request_id)


@router.get("", response_model=PersonListEnvelope)
async def list_people(
    db: AsyncSession = Depends(get_db),
    role: str | None = Query(default=None, description="Filter by role (case-insensitive)"),
    active: bool | None = Query(default=None),
    sort: PersonSortKey | None = Query(
        default=None,
        description="Sort column; overrides the default relevance/newest-first order. "
        "Applies across the whole filtered set, not just the current page.",
    ),
    list_query: ListQuery = Depends(),
) -> dict:
    """Paged people list on the shared list contract (see ``ListQuery``).

    ``q`` searches name, email, phone, address, NISS, eID, club, notes and
    roles. Without ``sort`` a search is ordered by relevance and a plain list
    newest first; every order ends in ``id`` so paging is stable.
    """
    filtered_stmt = filtered_people_stmt(q=list_query.q, role=role, active=active)
    total = (await db.execute(select(func.count()).select_from(filtered_stmt.subquery()))).scalar_one()

    stmt = order_people_stmt(filtered_stmt, q=list_query.q, sort=sort, sort_dir=list_query.sort_dir)
    rows = (await db.execute(list_query.apply(stmt))).scalars().all()
    return list_query.envelope([person_to_dict(p) for p in rows], total)


@router.get("/due-for-anonymisation", response_model=list[PersonAdminSummaryOut])
async def list_people_due_for_anonymisation(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """People whose identity fields are due for anonymisation.

    "Due" means: no NISS/eID on file (a current or former volunteer is never
    due — see ``people_service.anonymise_person``), already anonymised people
    excluded (nothing further to do), and their most recent registration's
    event date is more than 7 years in the past. Deliberately not automatic —
    an admin reviews this list and triggers each anonymisation individually
    via ``POST /{person_id}/anonymise``.

    Registered before ``/{person_id}`` so this literal path isn't swallowed by
    that dynamic one.
    """
    last_event_date = (
        select(func.max(Event.date))
        .join(Registration, Registration.event_id == Event.id)
        .where(Registration.person_id == Person.id)
        .correlate(Person)
        .scalar_subquery()
    )
    cutoff = (datetime.now(UTC) - ANONYMISATION_WINDOW).date()
    stmt = (
        select(Person)
        .where(
            Person.national_register_number.is_(None),
            Person.eid_document_number.is_(None),
            Person.active.is_(True),
            last_event_date.isnot(None),
            last_event_date < cutoff,
        )
        .order_by(last_event_date.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [person_to_dict(p) for p in rows]


@router.get("/{person_id}", response_model=PersonAdminSummaryOut)
async def get_person(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    person = await people_service.get_person_or_404(db, person_id)
    return person_to_dict(person)


@router.put("/{person_id}", response_model=PersonOut)
async def update_person(
    person_id: str,
    body: PersonUpdate,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    person = await people_service.get_person_or_404(db, person_id)
    return await people_service.apply_person_update(db, person, body, actor=actor, request_id=request_id)


@router.get("/{person_id}/registrations")
async def list_person_registrations(
    person_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    person = await people_service.get_person_or_404(db, person_id)

    result = await db.execute(
        select(Registration)
        .options(
            selectinload(Registration.event).selectinload(Event.edition),
            selectinload(Registration.event).selectinload(Event.products),
        )
        .where(Registration.person_id == person.id)
        .order_by(Registration.created_at.desc())
    )
    rows = result.scalars().all()
    return [registration_to_list_dict(r, person, r.event) for r in rows]


@router.get("/{person_id}/payment-summary", response_model=PersonPaymentSummary)
async def get_person_payment_summary(person_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Received/refunded/net paid/due/outstanding/refund-liability across one
    person's non-cancelled bookings. See ``payments_service.person_payment_summary``."""
    await people_service.get_person_or_404(db, person_id)
    return await payments_service.person_payment_summary(db, person_id)


@router.post("/{person_id}/merge/{duplicate_id}", response_model=PersonOut)
async def merge_people(
    person_id: str,
    duplicate_id: str,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    """Merge duplicate_id into person_id (admin-only). See
    ``app.services.people_service.merge_people`` for the exact semantics."""
    if person_id == duplicate_id:
        raise HTTPException(status_code=400, detail="Cannot merge a person with themselves.")

    canonical = await people_service.get_person_or_404(db, person_id)
    duplicate = await people_service.get_person_or_404(db, duplicate_id)
    return await people_service.merge_people(db, canonical, duplicate, actor=actor, request_id=request_id)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(
    person_id: str,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> None:
    person = await people_service.get_person_or_404(db, person_id)
    await people_service.delete_person(db, person, actor=actor, request_id=request_id)


@router.post("/{person_id}/anonymise", response_model=PersonOut)
async def anonymise_person(
    person_id: str,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    """Blank a person's identity fields, keeping their registrations intact.

    See ``app.services.people_service.anonymise_person``. Admin-triggered
    only; no scheduled job invokes person anonymisation.
    """
    person = await people_service.get_person_or_404(db, person_id)
    return await people_service.anonymise_person(db, person, actor=actor, request_id=request_id)
