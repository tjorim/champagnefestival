"""Edition management endpoints."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_admin
from app.database import get_db
from app.models import Edition, Exhibitor, Venue
from app.schemas import EditionCreate, EditionOut, EditionType, EditionUpdate
from app.utils import edition_to_dict, event_to_summary_dict, venue_to_dict

router = APIRouter(prefix="/api/editions", tags=["editions"])
logger = logging.getLogger(__name__)


@router.get("/active", response_model=EditionOut)
async def get_active_edition(
    db: AsyncSession = Depends(get_db),
    edition_type: EditionType | None = Query(default=None),
) -> dict:
    """Return the current or next upcoming active edition, optionally filtered by type."""
    editions = await _load_editions(db, include_inactive=False, edition_type=edition_type)
    if not editions:
        raise HTTPException(status_code=404, detail="No active editions found.")

    today = datetime.now(UTC).date()
    dated = _sorted_editions(editions)
    active = next(
        (
            edition
            for edition in dated
            if (edition_end_date := _edition_end_date(edition)) and edition_end_date >= today
        ),
        None,
    )
    if active is None:
        raise HTTPException(status_code=404, detail="No active or upcoming editions found.")
    return await _edition_payload(db, active)


@router.get("/upcoming", response_model=list[EditionOut])
async def list_upcoming_editions(
    db: AsyncSession = Depends(get_db),
    edition_type: EditionType | None = Query(default=None),
) -> list[dict]:
    """List upcoming active editions across all supported edition types."""
    today = datetime.now(UTC).date()
    editions = await _load_editions(db, include_inactive=False, edition_type=edition_type)
    upcoming = [edition for edition in editions if (_edition_end_date(edition) or date.min) >= today]
    return await _edition_payloads(db, _sorted_editions(upcoming))


@router.get("", response_model=list[EditionOut], dependencies=[Depends(require_admin)])
async def list_editions(
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = Query(False),
) -> list[dict]:
    editions = await _load_editions(db, include_inactive=include_inactive)
    return await _edition_payloads(db, _sorted_editions(editions))


@router.get("/{edition_id}", response_model=EditionOut, dependencies=[Depends(require_admin)])
async def get_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    edition = await _get_or_404(db, edition_id)
    return await _edition_payload(db, edition)


@router.post(
    "",
    response_model=EditionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_edition(body: EditionCreate, db: AsyncSession = Depends(get_db)) -> dict:
    if (await db.execute(select(Edition).where(Edition.id == body.id))).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Edition '{body.id}' already exists.",
        )
    await _load_venue(db, body.venue_id)
    _validate_exhibitors_allowed(body.edition_type, body.exhibitors)

    edition = Edition(
        id=body.id,
        year=body.year,
        month=body.month,
        venue_id=body.venue_id,
        edition_type=body.edition_type,
        external_partner=body.external_partner,
        external_contact_name=body.external_contact_name,
        external_contact_email=(str(body.external_contact_email) if body.external_contact_email else None),
        exhibitors=list(body.exhibitors),
        active=body.active,
    )
    await _validate_exhibitor_ids(db, edition.exhibitors)
    db.add(edition)
    await db.commit()
    edition = await _get_or_404(db, edition.id)
    return await _edition_payload(db, edition)


@router.put("/{edition_id}", response_model=EditionOut, dependencies=[Depends(require_admin)])
async def update_edition(edition_id: str, body: EditionUpdate, db: AsyncSession = Depends(get_db)) -> dict:
    edition = await _get_or_404(db, edition_id)

    for field in [
        "year",
        "month",
        "active",
        "edition_type",
        "external_partner",
        "external_contact_name",
        "external_contact_email",
    ]:
        if field in body.model_fields_set:
            value = getattr(body, field)
            if field == "external_contact_email" and value is not None:
                value = str(value)
            setattr(edition, field, value)

    if "venue_id" in body.model_fields_set and body.venue_id is not None:
        await _load_venue(db, body.venue_id)
        edition.venue_id = body.venue_id

    if "exhibitors" in body.model_fields_set and body.exhibitors is not None:
        _validate_exhibitors_allowed(edition.edition_type, body.exhibitors)  # ty: ignore[invalid-argument-type]
        await _validate_exhibitor_ids(db, body.exhibitors)
        edition.exhibitors = list(body.exhibitors)

    _validate_exhibitors_allowed(edition.edition_type, edition.exhibitors)  # ty: ignore[invalid-argument-type]

    await db.commit()
    edition = await _get_or_404(db, edition.id)
    return await _edition_payload(db, edition)


@router.delete(
    "/{edition_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> None:
    edition = await _get_or_404(db, edition_id)
    await db.delete(edition)
    await db.commit()


async def _load_editions(
    db: AsyncSession,
    include_inactive: bool,
    edition_type: EditionType | None = None,
) -> list[Edition]:
    stmt = select(Edition).options(selectinload(Edition.events))
    if not include_inactive:
        stmt = stmt.where(Edition.active.is_(True))
    if edition_type is not None:
        stmt = stmt.where(Edition.edition_type == edition_type)
    return list((await db.execute(stmt)).scalars().all())


async def _get_or_404(db: AsyncSession, edition_id: str) -> Edition:
    result = await db.execute(select(Edition).options(selectinload(Edition.events)).where(Edition.id == edition_id))
    edition = result.scalar_one_or_none()
    if edition is None:
        raise HTTPException(status_code=404, detail="Edition not found.")
    return edition


async def _load_venue(db: AsyncSession, venue_id: str) -> dict:
    result = await db.execute(select(Venue).where(Venue.id == venue_id))
    venue = result.scalar_one_or_none()
    if venue is None:
        raise HTTPException(status_code=404, detail=f"Venue '{venue_id}' not found.")
    return venue_to_dict(venue)


async def _load_venues_by_ids(db: AsyncSession, ids: set[str]) -> dict[str, dict]:
    if not ids:
        return {}
    result = await db.execute(select(Venue).where(Venue.id.in_(ids)))
    return {venue.id: venue_to_dict(venue) for venue in result.scalars().all()}


async def _load_exhibitors_by_ids(db: AsyncSession, ids: set[int]) -> dict[int, dict]:
    if not ids:
        return {}
    result = await db.execute(select(Exhibitor).where(Exhibitor.id.in_(ids), Exhibitor.active.is_(True)))
    return {
        exhibitor.id: {
            "id": exhibitor.id,
            "name": exhibitor.name,
            "image": exhibitor.image,
            "website": exhibitor.website,
            "type": exhibitor.type,
        }
        for exhibitor in result.scalars().all()
    }


async def _validate_exhibitor_ids(db: AsyncSession, exhibitor_ids: list[int]) -> None:
    if not exhibitor_ids:
        return
    exhibitor_map = await _load_exhibitors_by_ids(db, set(exhibitor_ids))
    invalid = [eid for eid in exhibitor_ids if eid not in exhibitor_map]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid or inactive exhibitor IDs: {invalid}")
    vendor_ids = [eid for eid in exhibitor_ids if exhibitor_map[eid]["type"] == "vendor"]
    if vendor_ids:
        raise HTTPException(
            status_code=400, detail=f"Vendor-type exhibitors may not be linked to editions: {vendor_ids}"
        )


async def _edition_payloads(db: AsyncSession, editions: list[Edition]) -> list[dict]:
    venues = await _load_venues_by_ids(db, {edition.venue_id for edition in editions})
    exhibitor_map = await _load_exhibitors_by_ids(
        db,
        {eid for edition in editions for eid in edition.exhibitors},
    )
    payloads = []
    for edition in editions:
        if edition.venue_id not in venues:
            logger.warning(
                "Skipping edition payload because venue is missing. edition_id=%s venue_id=%s",
                edition.id,
                edition.venue_id,
            )
            continue
        producers, sponsors, vendors = _resolve_exhibitors(edition, exhibitor_map)
        payloads.append(
            edition_to_dict(
                edition,
                venue=venues[edition.venue_id],
                dates=_edition_dates(edition),
                events=[
                    event_to_summary_dict(event)
                    for event in sorted(
                        edition.events,
                        key=lambda event: (event.date, event.start_time, event.created_at),
                    )
                ],
                producers=producers,
                sponsors=sponsors,
                vendors=vendors,
            )
        )
    return payloads


async def _edition_payload(db: AsyncSession, edition: Edition) -> dict:
    payloads = await _edition_payloads(db, [edition])
    if not payloads:
        raise HTTPException(status_code=404, detail="Edition not found.")
    return payloads[0]


def _resolve_exhibitors(edition: Edition, exhibitor_map: dict[int, dict]) -> tuple[list[dict], list[dict], list[dict]]:
    producers: list[dict] = []
    sponsors: list[dict] = []
    vendors: list[dict] = []
    for exhibitor_id in edition.exhibitors:
        item = exhibitor_map.get(exhibitor_id)
        if item is None:
            continue
        if item["type"] == "producer":
            producers.append(item)
        elif item["type"] == "sponsor":
            sponsors.append(item)
        elif item["type"] == "vendor":
            vendors.append(item)
    return producers, sponsors, vendors


def _edition_dates(edition: Edition) -> list[date]:
    return sorted({event.date for event in edition.events})


def _edition_start_date(edition: Edition) -> date | None:
    return min((event.date for event in edition.events), default=None)


def _edition_end_date(edition: Edition) -> date | None:
    return max((event.date for event in edition.events), default=None)


def _sorted_editions(editions: list[Edition]) -> list[Edition]:
    return sorted(
        editions,
        key=lambda edition: (
            _edition_start_date(edition) or date.max,
            _edition_end_date(edition) or date.max,
            edition.year,
            edition.month,
            edition.created_at,
        ),
    )


def _validate_exhibitors_allowed(edition_type: EditionType, exhibitors: list[int]) -> None:
    if edition_type != "festival" and exhibitors:
        raise HTTPException(
            status_code=400,
            detail="Exhibitors are only supported on festival editions.",
        )
