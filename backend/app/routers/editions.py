"""Festival edition management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import ContentItem, Edition
from app.schemas import EditionCreate, EditionOut, EditionUpdate
from app.utils import edition_to_dict

router = APIRouter(prefix="/api/editions", tags=["editions"])


# ---------------------------------------------------------------------------
# Public: list active editions (used by frontend reservation modal)
# ---------------------------------------------------------------------------


@router.get("", response_model=list[EditionOut])
async def list_editions(
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = Query(False),
) -> list[dict]:
    """Return festival editions, ordered by year and month.

    By default only active editions are returned. Admin clients may pass
    ``include_inactive=true`` to receive all editions regardless of status.
    """
    stmt = select(Edition).order_by(Edition.year, Edition.month)
    if not include_inactive:
        stmt = stmt.where(Edition.active.is_(True))
    result = await db.execute(stmt)
    editions = result.scalars().all()
    pools = await _load_content_pools(db)
    return [edition_to_dict(e, **_resolve_pools(e, pools)) for e in editions]


# ---------------------------------------------------------------------------
# Public: get single edition
# ---------------------------------------------------------------------------


@router.get("/{edition_id}", response_model=EditionOut)
async def get_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    e = await _get_active_or_404(db, edition_id)
    pools = await _load_content_pools(db)
    return edition_to_dict(e, **_resolve_pools(e, pools))


# ---------------------------------------------------------------------------
# Admin: get single edition (including inactive)
# ---------------------------------------------------------------------------


@router.get(
    "/admin/{edition_id}",
    response_model=EditionOut,
    dependencies=[Depends(require_admin)],
)
async def admin_get_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    e = await _get_or_404(db, edition_id)
    pools = await _load_content_pools(db)
    return edition_to_dict(e, **_resolve_pools(e, pools))


# ---------------------------------------------------------------------------
# Admin: create edition
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=EditionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_edition(
    body: EditionCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Check for duplicate ID
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
    e.set_producers(body.producers)
    e.set_sponsors(body.sponsors)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    pools = await _load_content_pools(db)
    return edition_to_dict(e, **_resolve_pools(e, pools))


# ---------------------------------------------------------------------------
# Admin: update edition
# ---------------------------------------------------------------------------


@router.put(
    "/{edition_id}",
    response_model=EditionOut,
    dependencies=[Depends(require_admin)],
)
async def update_edition(
    edition_id: str,
    body: EditionUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    e = await _get_or_404(db, edition_id)

    simple_fields = ["year", "month", "friday", "saturday", "sunday", "active"]
    for field in simple_fields:
        if field in body.model_fields_set and getattr(body, field) is not None:
            setattr(e, field, getattr(body, field))
    # venue_id is non-nullable — only update when a real value is provided
    if "venue_id" in body.model_fields_set and body.venue_id is not None:
        e.venue_id = body.venue_id

    if "schedule" in body.model_fields_set and body.schedule is not None:
        e.set_schedule([ev.model_dump() for ev in body.schedule])
    if "producers" in body.model_fields_set and body.producers is not None:
        e.set_producers(body.producers)
    if "sponsors" in body.model_fields_set and body.sponsors is not None:
        e.set_sponsors(body.sponsors)

    await db.commit()
    await db.refresh(e)
    pools = await _load_content_pools(db)
    return edition_to_dict(e, **_resolve_pools(e, pools))


# ---------------------------------------------------------------------------
# Admin: delete edition
# ---------------------------------------------------------------------------


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


async def _get_active_or_404(db: AsyncSession, edition_id: str) -> Edition:
    result = await db.execute(
        select(Edition).where(Edition.id == edition_id, Edition.active.is_(True))
    )
    e = result.scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=404, detail="Edition not found.")
    return e


async def _load_content_pools(db: AsyncSession) -> dict[str, list[dict]]:
    """Load producers and sponsors content items in one query."""
    result = await db.execute(
        select(ContentItem).where(ContentItem.key.in_(["producers", "sponsors"]))
    )
    pools: dict[str, list[dict]] = {"producers": [], "sponsors": []}
    for item in result.scalars().all():
        pools[item.key] = item.get_items()
    return pools


def _resolve_pools(e: Edition, pools: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Filter each pool to the IDs stored on the edition, preserving the edition's saved order."""
    producer_idx = {i["id"]: i for i in pools["producers"] if "id" in i}
    sponsor_idx = {i["id"]: i for i in pools["sponsors"] if "id" in i}
    return {
        "producers": [producer_idx[pid] for pid in e.get_producers() if pid in producer_idx],
        "sponsors": [sponsor_idx[sid] for sid in e.get_sponsors() if sid in sponsor_idx],
    }
