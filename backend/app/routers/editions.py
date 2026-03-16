"""Festival edition management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Edition
from app.schemas import EditionCreate, EditionOut, EditionUpdate
from app.utils import edition_to_dict

router = APIRouter(prefix="/api/editions", tags=["editions"])


# ---------------------------------------------------------------------------
# Public: list active editions (used by frontend reservation modal)
# ---------------------------------------------------------------------------


@router.get("", response_model=list[EditionOut])
async def list_editions(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Return all active festival editions, ordered by year and month."""
    result = await db.execute(
        select(Edition).where(Edition.active.is_(True)).order_by(Edition.year, Edition.month)
    )
    return [edition_to_dict(e) for e in result.scalars().all()]


# ---------------------------------------------------------------------------
# Public: get single edition
# ---------------------------------------------------------------------------


@router.get("/{edition_id}", response_model=EditionOut)
async def get_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return edition_to_dict(await _get_or_404(db, edition_id))


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
        venue_name=body.venue_name,
        venue_address=body.venue_address,
        venue_city=body.venue_city,
        venue_postal_code=body.venue_postal_code,
        venue_country=body.venue_country,
        venue_lat=body.venue_lat,
        venue_lng=body.venue_lng,
        active=body.active,
    )
    e.set_schedule([ev.model_dump() for ev in body.schedule])
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return edition_to_dict(e)


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

    simple_fields = [
        "year", "month", "friday", "saturday", "sunday",
        "venue_name", "venue_address", "venue_city", "venue_postal_code",
        "venue_country", "venue_lat", "venue_lng", "active",
    ]
    for field in simple_fields:
        if field in body.model_fields_set and getattr(body, field) is not None:
            setattr(e, field, getattr(body, field))

    if "schedule" in body.model_fields_set and body.schedule is not None:
        e.set_schedule([ev.model_dump() for ev in body.schedule])

    await db.commit()
    await db.refresh(e)
    return edition_to_dict(e)


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
# Helper
# ---------------------------------------------------------------------------


async def _get_or_404(db: AsyncSession, edition_id: str) -> Edition:
    result = await db.execute(select(Edition).where(Edition.id == edition_id))
    e = result.scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=404, detail="Edition not found.")
    return e
