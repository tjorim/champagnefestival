"""Volunteer CRUD endpoints (admin-only).

Volunteers are stored in the people table as a subset with role='volunteer'.
Volunteer help periods are stored separately so a person can help across
multiple non-contiguous festival dates. Business logic lives in
``app.services.volunteers_service`` and is shared with
``app.mcp.admin.volunteers``.
"""

import csv
import io

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.dependencies import ListQuery, get_request_id
from app.models import Person
from app.schemas import VolunteerCreate, VolunteerListEnvelope, VolunteerOut, VolunteerUpdate
from app.services import volunteers_service
from app.services.people_listing import VolunteerSortKey, filtered_people_stmt, order_people_stmt
from app.utils import csv_safe, roles_contains

router = APIRouter(
    prefix="/api/volunteers",
    tags=["volunteers"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=VolunteerOut, status_code=status.HTTP_201_CREATED)
async def create_volunteer(
    body: VolunteerCreate,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    return await volunteers_service.create_volunteer(db, body=body, actor=actor, request_id=request_id)


@router.get("", response_model=VolunteerListEnvelope)
async def list_volunteers(
    db: AsyncSession = Depends(get_db),
    active: bool | None = Query(default=None),
    sort: VolunteerSortKey | None = Query(
        default=None,
        description="Sort column; overrides the default relevance/newest-first order. "
        "Applies across the whole filtered set, not just the current page.",
    ),
    list_query: ListQuery = Depends(),
) -> dict:
    """Paged volunteer list on the shared list contract (see ``ListQuery``).

    Same ``q`` semantics, defaults and ordering rules as ``GET /api/people``
    (restricted to people holding the volunteer role), with help periods
    included in each item.
    """
    filtered_stmt = filtered_people_stmt(q=list_query.q, role="volunteer", active=active)
    total = (await db.execute(select(func.count()).select_from(filtered_stmt.subquery()))).scalar_one()

    stmt = order_people_stmt(filtered_stmt, q=list_query.q, sort=sort, sort_dir=list_query.sort_dir)
    rows = (await db.execute(list_query.apply(stmt))).scalars().all()
    periods_map = await volunteers_service.load_periods_map(db, [row.id for row in rows])
    items = [volunteers_service.to_volunteer_out(v, periods_map.get(v.id, [])) for v in rows]
    return list_query.envelope(items, total)


@router.get("/export")
async def export_volunteers_csv(db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    """Export active volunteers with their help periods as CSV, for insurance reporting.

    One row per help period (a volunteer with multiple non-contiguous periods
    gets one row per period) since insurers typically need each covered date
    range listed separately.
    """
    stmt = select(Person).where(roles_contains("volunteer"), Person.active.is_(True)).order_by(Person.name)
    volunteers = (await db.execute(stmt)).scalars().all()
    periods_map = await volunteers_service.load_periods_map(db, [v.id for v in volunteers])

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(map(csv_safe, ["Name", "National Register Number", "Address", "Period Start", "Period End"]))
    for volunteer in volunteers:
        periods = periods_map.get(volunteer.id, [])
        if not periods:
            writer.writerow(
                map(csv_safe, [volunteer.name, volunteer.national_register_number, volunteer.address, None, None])
            )
            continue
        for period in periods:
            writer.writerow(
                map(
                    csv_safe,
                    [
                        volunteer.name,
                        volunteer.national_register_number,
                        volunteer.address,
                        period.first_help_day.isoformat(),
                        period.last_help_day.isoformat() if period.last_help_day else None,
                    ],
                )
            )
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="volunteers-insurance-list.csv"'},
    )


@router.get("/{volunteer_id}", response_model=VolunteerOut)
async def get_volunteer(volunteer_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    volunteer = await volunteers_service.get_volunteer_or_404(db, volunteer_id)
    periods_map = await volunteers_service.load_periods_map(db, [volunteer.id])
    return volunteers_service.to_volunteer_out(volunteer, periods_map.get(volunteer.id, []))


@router.put("/{volunteer_id}", response_model=VolunteerOut)
async def update_volunteer(
    volunteer_id: str,
    body: VolunteerUpdate,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    volunteer = await volunteers_service.get_volunteer_or_404(db, volunteer_id)
    return await volunteers_service.apply_volunteer_update(db, volunteer, body, actor=actor, request_id=request_id)


@router.delete("/{volunteer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_volunteer(
    volunteer_id: str,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
    request_id: str | None = Depends(get_request_id),
) -> None:
    """Remove the volunteer role from a person (soft archive).

    See ``app.services.volunteers_service.delete_volunteer`` for the exact
    semantics.
    """
    volunteer = await volunteers_service.get_volunteer_or_404(db, volunteer_id)
    await volunteers_service.delete_volunteer(db, volunteer, actor=actor, request_id=request_id)
