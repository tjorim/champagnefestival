"""Festival edition management endpoints."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Edition, Exhibitor, Venue
from app.schemas import EditionCreate, EditionOut, EditionUpdate
from app.utils import edition_to_dict, venue_to_dict

router = APIRouter(prefix="/api/editions", tags=["editions"])


# ---------------------------------------------------------------------------
# Public: active edition (used by the visitor-facing website)
# ---------------------------------------------------------------------------


@router.get("/active", response_model=EditionOut)
async def get_active_edition(db: AsyncSession = Depends(get_db)) -> dict:
    """Return the current or next upcoming active edition with embedded venue
    and exhibitors.  Falls back to the most-recent past edition when
    all known editions are in the past.
    """
    result = await db.execute(
        select(Edition).where(Edition.active.is_(True)).order_by(Edition.friday)
    )
    editions = result.scalars().all()
    if not editions:
        raise HTTPException(status_code=404, detail="No active editions found.")

    now = datetime.now(timezone.utc).date()
    active = next((e for e in editions if e.sunday >= now), editions[-1])

    venue = await _load_venue(db, active.venue_id)
    exhibitor_map = await _load_exhibitors_by_ids(db, set(active.get_exhibitors()))
    producers, sponsors = _resolve_exhibitors(active, exhibitor_map)
    return edition_to_dict(active, venue=venue, producers=producers, sponsors=sponsors)


# ---------------------------------------------------------------------------
# Admin: list all editions
# ---------------------------------------------------------------------------


@router.get("", response_model=list[EditionOut], dependencies=[Depends(require_admin)])
async def list_editions(
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = Query(False),
) -> list[dict]:
    stmt = select(Edition).order_by(Edition.year, Edition.friday)
    if not include_inactive:
        stmt = stmt.where(Edition.active.is_(True))
    result = await db.execute(stmt)
    editions = result.scalars().all()

    venues = await _load_venues_by_ids(db, {e.venue_id for e in editions})
    all_ids = {eid for e in editions for eid in e.get_exhibitors()}
    exhibitor_map = await _load_exhibitors_by_ids(db, all_ids)
    result_list = []
    for e in editions:
        if e.venue_id not in venues:
            continue
        producers, sponsors = _resolve_exhibitors(e, exhibitor_map)
        result_list.append(edition_to_dict(e, venue=venues[e.venue_id], producers=producers, sponsors=sponsors))
    return result_list


# ---------------------------------------------------------------------------
# Admin: get / create / update / delete
# ---------------------------------------------------------------------------


@router.get("/{edition_id}", response_model=EditionOut, dependencies=[Depends(require_admin)])
async def get_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    e = await _get_or_404(db, edition_id)
    venue = await _load_venue(db, e.venue_id)
    exhibitor_map = await _load_exhibitors_by_ids(db, set(e.get_exhibitors()))
    producers, sponsors = _resolve_exhibitors(e, exhibitor_map)
    return edition_to_dict(e, venue=venue, producers=producers, sponsors=sponsors)


@router.post(
    "",
    response_model=EditionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_edition(body: EditionCreate, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(select(Edition).where(Edition.id == body.id))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Edition '{body.id}' already exists.",
        )
    e = Edition(
        id=body.id,
        year=body.year,
        month=body.month,
        friday=body.friday,
        saturday=body.saturday,
        sunday=body.sunday,
        venue_id=body.venue_id,
        active=body.active,
    )
    e.set_schedule([ev.model_dump() for ev in body.schedule])
    e.set_exhibitors(body.exhibitors)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    venue = await _load_venue(db, e.venue_id)
    exhibitor_map = await _load_exhibitors_by_ids(db, set(e.get_exhibitors()))
    producers, sponsors = _resolve_exhibitors(e, exhibitor_map)
    return edition_to_dict(e, venue=venue, producers=producers, sponsors=sponsors)


@router.put("/{edition_id}", response_model=EditionOut, dependencies=[Depends(require_admin)])
async def update_edition(
    edition_id: str, body: EditionUpdate, db: AsyncSession = Depends(get_db)
) -> dict:
    e = await _get_or_404(db, edition_id)

    for field in ["year", "month", "friday", "saturday", "sunday", "active"]:
        if field in body.model_fields_set and getattr(body, field) is not None:
            setattr(e, field, getattr(body, field))
    if "venue_id" in body.model_fields_set and body.venue_id is not None:
        e.venue_id = body.venue_id
    if "schedule" in body.model_fields_set and body.schedule is not None:
        e.set_schedule([ev.model_dump() for ev in body.schedule])
    if "exhibitors" in body.model_fields_set and body.exhibitors is not None:
        e.set_exhibitors(body.exhibitors)

    await db.commit()
    await db.refresh(e)
    venue = await _load_venue(db, e.venue_id)
    exhibitor_map = await _load_exhibitors_by_ids(db, set(e.get_exhibitors()))
    producers, sponsors = _resolve_exhibitors(e, exhibitor_map)
    return edition_to_dict(e, venue=venue, producers=producers, sponsors=sponsors)


@router.delete(
    "/{edition_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> None:
    e = await _get_or_404(db, edition_id)
    await db.delete(e)
    await db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_404(db: AsyncSession, edition_id: str) -> Edition:
    result = await db.execute(select(Edition).where(Edition.id == edition_id))
    e = result.scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=404, detail="Edition not found.")
    return e


async def _load_venue(db: AsyncSession, venue_id: str) -> dict:
    result = await db.execute(select(Venue).where(Venue.id == venue_id))
    v = result.scalar_one_or_none()
    if v is None:
        raise HTTPException(status_code=404, detail=f"Venue '{venue_id}' not found.")
    return venue_to_dict(v)


async def _load_venues_by_ids(db: AsyncSession, ids: set[str]) -> dict[str, dict]:
    if not ids:
        return {}
    result = await db.execute(select(Venue).where(Venue.id.in_(ids)))
    return {v.id: venue_to_dict(v) for v in result.scalars().all()}


async def _load_exhibitors_by_ids(db: AsyncSession, ids: set[int]) -> dict[int, dict]:
    if not ids:
        return {}
    result = await db.execute(select(Exhibitor).where(Exhibitor.id.in_(ids)))
    return {
        e.id: {"id": e.id, "name": e.name, "image": e.image, "website": e.website, "type": e.type}
        for e in result.scalars().all()
    }


def _resolve_exhibitors(e: Edition, exhibitor_map: dict[int, dict]) -> tuple[list[dict], list[dict]]:
    producers = []
    sponsors = []
    for eid in e.get_exhibitors():
        item = exhibitor_map.get(eid)
        if item is None:
            continue
        if item["type"] == "producer":
            producers.append(item)
        elif item["type"] == "sponsor":
            sponsors.append(item)
    return producers, sponsors
