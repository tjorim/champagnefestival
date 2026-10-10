"""Shared application-service operations for editions.

Used by both ``app.routers.editions`` (REST) and ``app.mcp.admin.editions``
(MCP) so the deferred ``active``/``edition_type`` application, target-value
computation, implicit organization clearing, the ``deactivate_conflicting_editions``
call, and audit-detail assembly for ``create_edition``/``apply_edition_update``
live in exactly one place instead of two near-identical copies (#860, following
on from #832 and #855). The payload-building and lookup helpers below back
several other edition endpoints too, so they live here rather than in the
router, following the pattern already used by ``app/services/rooms_service.py``
and ``app/services/layouts_service.py``.

Unlike those two modules, edition endpoints raise ``HTTPException`` directly
(matching the pre-existing helpers this module consolidates) rather than the
``ServiceError`` hierarchy in ``app/services/errors.py``: the REST router can
therefore call these functions unwrapped, while the MCP adapter is
responsible for translating ``HTTPException`` into ``MCPToolError`` at its own
boundary (see ``app.mcp.utils.as_value_error``).
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.database import violated_constraint_name
from app.models import Edition, Event, Organization, Venue
from app.schemas import EditionCreate, EditionScratchpadUpdate, EditionType, EditionUpdate
from app.services import edition_artwork
from app.services.public_render_cache import notify_render_cache_invalidate
from app.utils import edition_to_dict, event_to_summary_dict, get_or_404, venue_to_dict

logger = logging.getLogger(__name__)


async def load_editions(
    db: AsyncSession,
    include_inactive: bool,
    edition_type: EditionType | None = None,
) -> list[Edition]:
    stmt = select(Edition).options(selectinload(Edition.events).selectinload(Event.products))
    if not include_inactive:
        stmt = stmt.where(Edition.active.is_(True))
    if edition_type is not None:
        stmt = stmt.where(Edition.edition_type == edition_type)
    return list((await db.execute(stmt)).scalars().all())


async def get_edition_or_404(db: AsyncSession, edition_id: str) -> Edition:
    return await get_or_404(
        db,
        Edition,
        edition_id,
        "Edition not found.",
        options=[selectinload(Edition.events).selectinload(Event.products)],
    )


async def get_edition_scratchpad(db: AsyncSession, edition_id: str) -> dict:
    edition = await get_edition_or_404(db, edition_id)
    return {"content": edition.scratchpad, "updated_at": edition.updated_at}


async def update_edition_scratchpad(
    db: AsyncSession, edition: Edition, *, body: EditionScratchpadUpdate, actor: str, request_id: str | None = None
) -> dict:
    edition.scratchpad = body.content
    await write_audit_entry(
        db,
        actor=actor,
        action="edition_scratchpad_updated",
        resource_type="edition",
        resource_id=edition.id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    await db.refresh(edition)
    return {"content": edition.scratchpad, "updated_at": edition.updated_at}


async def deactivate_conflicting_editions(
    db: AsyncSession,
    *,
    edition_type: str,
    exclude_id: str | None,
    actor: str,
    request_id: str | None,
) -> list[str]:
    """Deactivate any other active edition of the same type in the same transaction.

    Backs the "at most one active edition per type" invariant (#832) on the normal
    single-request path: activating an edition transparently supersedes whichever
    edition of that type was active before, rather than requiring the caller to
    deactivate it first. Rows are locked with ``FOR UPDATE`` before being flipped so a
    concurrent activation targeting one of them can't interleave. That still leaves one
    race unresolved — two brand-new editions of the same type activated at once, with no
    existing active row for either to lock — which is why this alone isn't the
    invariant's backstop: the ``uq_editions_active_type`` partial unique index
    (migration 009) is, and ``commit_or_conflict`` turns its violation into a 409.
    """
    stmt = select(Edition).where(Edition.edition_type == edition_type, Edition.active.is_(True))
    if exclude_id is not None:
        stmt = stmt.where(Edition.id != exclude_id)
    conflicting = list((await db.execute(stmt.with_for_update())).scalars().all())
    for other in conflicting:
        other.active = False
        await write_audit_entry(
            db,
            actor=actor,
            action="edition_deactivated",
            resource_type="edition",
            resource_id=other.id,
            request_id=request_id,
            details={"reason": "superseded_by_activation", "edition_type": edition_type},
        )
    if conflicting:
        await db.flush()
    return [other.id for other in conflicting]


async def commit_or_conflict(db: AsyncSession) -> None:
    """Queue the render-cache invalidation and commit, translating a
    ``uq_editions_active_type`` violation into a 409.

    A concurrent activation of two editions of the same type can race past
    `deactivate_conflicting_editions` with nothing to lock; see that function's
    docstring. The violation surfaces at the first flush of the pending insert or
    update — which ``notify_render_cache_invalidate``'s ``db.execute`` triggers
    via autoflush — or at commit, so both sit inside the guarded block. Other
    integrity violations reaching it — a duplicate id slipping past
    `create_edition`'s existence check, or a venue/co-organizer deleted
    concurrently with this request — are re-raised as-is for
    ``app.main.integrity_error_handler`` to report accurately instead of being
    misreported as this specific conflict.
    """
    try:
        await notify_render_cache_invalidate(db)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if violated_constraint_name(exc) != "uq_editions_active_type":
            raise
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another edition of this type was activated concurrently. Please retry.",
        ) from exc


async def load_venue(db: AsyncSession, venue_id: str) -> dict:
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


async def _load_organizations_by_ids(db: AsyncSession, ids: set[int]) -> dict[int, dict]:
    if not ids:
        return {}
    result = await db.execute(select(Organization).where(Organization.id.in_(ids), Organization.active.is_(True)))
    return {
        organization.id: {
            "id": organization.id,
            "name": organization.name,
            "image": organization.image,
            "website": organization.website,
            "description_language": organization.description_language,
            "description_nl": organization.description_nl,
            "description_fr": organization.description_fr,
            "description_en": organization.description_en,
            "type": organization.type,
        }
        for organization in result.scalars().all()
    }


async def validate_organization_ids(db: AsyncSession, organization_ids: list[int]) -> None:
    if not organization_ids:
        return
    # Lock the referenced organization rows so a concurrent retype-to-vendor (see
    # organizations.update_organization, which locks the same rows) can't interleave
    # with this check and leave a vendor organization linked to an edition lineup.
    # Ordered by id so two overlapping requests always acquire locks in the same
    # sequence and can't deadlock against each other.
    await db.execute(
        select(Organization.id).where(Organization.id.in_(organization_ids)).order_by(Organization.id).with_for_update()
    )
    organization_map = await _load_organizations_by_ids(db, set(organization_ids))
    invalid = [eid for eid in organization_ids if eid not in organization_map]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid or inactive organization IDs: {invalid}")
    vendor_ids = [eid for eid in organization_ids if organization_map[eid]["type"] == "vendor"]
    if vendor_ids:
        raise HTTPException(
            status_code=400, detail=f"Vendor-type organizations may not be linked to editions: {vendor_ids}"
        )


async def validate_co_organizer(db: AsyncSession, organization_id: int | None) -> None:
    """A co-organizer must be an existing, active organization.

    Unlike the lineup, any organization type is acceptable and any edition type may
    have one — co-organizing says who ran the event with the vzw, not who was
    programmed at it.
    """
    if organization_id is None:
        return
    organization = (
        await db.execute(select(Organization).where(Organization.id == organization_id, Organization.active.is_(True)))
    ).scalar_one_or_none()
    if organization is None:
        raise HTTPException(
            status_code=400, detail=f"Invalid or inactive co-organizer organization id: {organization_id}"
        )


def validate_organizations_allowed(edition_type: EditionType, organizations: list[int]) -> None:
    if edition_type != "festival" and organizations:
        raise HTTPException(
            status_code=400,
            detail="Organizations are only supported on festival editions.",
        )


def active_events(edition: Edition) -> list[Event]:
    return [event for event in edition.events if event.active]


def _edition_dates(events: list[Event]) -> list[date]:
    """Unique event dates in chronological order (relies on `events` being pre-sorted by date)."""
    return list(dict.fromkeys(event.date for event in events))


def edition_start_date(events: list[Event]) -> date | None:
    return events[0].date if events else None


def edition_end_date(events: list[Event]) -> date | None:
    return events[-1].date if events else None


async def find_active_edition(db: AsyncSession, *, edition_type: EditionType | None = None) -> Edition | None:
    """The current or next upcoming active edition, or ``None`` — never raises.

    Shared by ``app.routers.editions.get_active_edition`` (404s on ``None``)
    and ``app.routers.public_pages`` (renders without a hero/JSON-LD section
    on ``None`` instead — see #992's "never advertise a fake event").
    """
    editions = await load_editions(db, include_inactive=False, edition_type=edition_type)
    if not editions:
        return None
    today = datetime.now(UTC).date()
    dated = sorted_editions(editions, active_only=True)
    return next(
        (edition for edition in dated if (end_date := edition_end_date(active_events(edition))) and end_date >= today),
        None,
    )


def sorted_editions(editions: list[Edition], *, active_only: bool) -> list[Edition]:
    def sort_key(edition: Edition) -> tuple:
        events = active_events(edition) if active_only else edition.events
        return (
            edition_start_date(events) or date.max,
            edition_end_date(events) or date.max,
            edition.year,
            edition.month,
            edition.created_at,
        )

    return sorted(editions, key=sort_key)


def _resolve_organizations(
    edition: Edition, organization_map: dict[int, dict]
) -> tuple[list[dict], list[dict], list[dict]]:
    producers: list[dict] = []
    sponsors: list[dict] = []
    vendors: list[dict] = []
    for organization_id in edition.organizations:
        item = organization_map.get(organization_id)
        if item is None:
            continue
        if item["type"] == "producer":
            producers.append(item)
        elif item["type"] == "sponsor":
            sponsors.append(item)
        elif item["type"] == "vendor":
            vendors.append(item)
    return producers, sponsors, vendors


async def edition_payloads(
    db: AsyncSession, editions: list[Edition], *, active_only: bool, public: bool = False, locale: str | None = None
) -> list[dict]:
    """Build edition response payloads.

    `active_only` controls whether inactive events are dropped from the serialized
    `events`/`dates` fields. Public endpoints (`/active`, `/upcoming`) pass `True` so
    inactive (draft/cancelled) events never appear in unauthenticated responses;
    admin endpoints pass `False` so event management keeps seeing everything.

    `public` controls each event's `products` — see `event_to_summary_dict`.
    Public endpoints pass `True`; the caller must also use a response_model
    built from `ProductPublicOut` (see `app.schemas.EditionPublicOut`), since
    the two shapes are incompatible.

    `locale` resolves each event's `title`/`description` for that language
    (original language when `None`); see `event_to_summary_dict`.
    """
    venues = await _load_venues_by_ids(db, {edition.venue_id for edition in editions})
    organization_map = await _load_organizations_by_ids(
        db,
        {eid for edition in editions for eid in edition.organizations}
        | {edition.co_organizer_organization_id for edition in editions if edition.co_organizer_organization_id},
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
        producers, sponsors, vendors = _resolve_organizations(edition, organization_map)
        # `Edition.events` is loaded pre-ordered by (date, start_time, created_at); filtering
        # to active events preserves that order, so no re-sort is needed here.
        events = active_events(edition) if active_only else edition.events
        payloads.append(
            edition_to_dict(
                edition,
                venue=venues[edition.venue_id],
                dates=_edition_dates(events),
                events=[event_to_summary_dict(event, public=public, locale=locale) for event in events],
                producers=producers,
                sponsors=sponsors,
                vendors=vendors,
                co_organizer=organization_map.get(edition.co_organizer_organization_id)
                if edition.co_organizer_organization_id
                else None,
            )
        )
    return payloads


async def edition_payload(
    db: AsyncSession, edition: Edition, *, active_only: bool, public: bool = False, locale: str | None = None
) -> dict:
    payloads = await edition_payloads(db, [edition], active_only=active_only, public=public, locale=locale)
    if not payloads:
        raise HTTPException(status_code=404, detail="Edition not found.")
    return payloads[0]


async def create_edition(db: AsyncSession, *, body: EditionCreate, actor: str, request_id: str | None = None) -> dict:
    if (await db.execute(select(Edition).where(Edition.id == body.id))).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Edition '{body.id}' already exists.",
        )
    await load_venue(db, body.venue_id)
    validate_organizations_allowed(body.edition_type, body.organizations)

    edition = Edition(
        id=body.id,
        year=body.year,
        month=body.month,
        venue_id=body.venue_id,
        edition_type=body.edition_type,
        organizations=list(body.organizations),
        co_organizer_organization_id=body.co_organizer_organization_id,
        active=body.active,
    )
    await validate_organization_ids(db, edition.organizations)
    await validate_co_organizer(db, edition.co_organizer_organization_id)

    deactivated: list[str] = []
    if edition.active:
        deactivated = await deactivate_conflicting_editions(
            db, edition_type=edition.edition_type, exclude_id=None, actor=actor, request_id=request_id
        )

    db.add(edition)
    details: dict = {"year": edition.year, "month": edition.month, "edition_type": edition.edition_type}
    if deactivated:
        details["deactivated_conflicting_editions"] = deactivated
    await write_audit_entry(
        db,
        actor=actor,
        action="edition_created",
        resource_type="edition",
        resource_id=edition.id,
        request_id=request_id,
        details=details,
    )
    await commit_or_conflict(db)
    edition = await get_edition_or_404(db, edition.id)
    return await edition_payload(db, edition, active_only=False)


async def apply_edition_update(
    db: AsyncSession, edition: Edition, body: EditionUpdate, *, actor: str, request_id: str | None = None
) -> dict:
    if "co_organizer_organization_id" in body.model_fields_set:
        await validate_co_organizer(db, body.co_organizer_organization_id)
        edition.co_organizer_organization_id = body.co_organizer_organization_id

    for field in ["year", "month"]:
        if field in body.model_fields_set:
            setattr(edition, field, getattr(body, field))

    if "venue_id" in body.model_fields_set and body.venue_id is not None:
        await load_venue(db, body.venue_id)
        edition.venue_id = body.venue_id

    # `active`/`edition_type` are deliberately not applied to `edition` yet: doing so
    # here would dirty the object before `deactivate_conflicting_editions` runs below,
    # and any autoflush in between (the organization/co-organizer validations above already
    # ran, but `validate_organization_ids` below issues one too) could flush this row into
    # an (edition_type, active) state that collides with the still-active conflicting
    # row — the exact violation the deactivation step exists to avoid causing.
    persisted_edition_type = edition.edition_type
    if persisted_edition_type not in ("festival", "bourse", "capsule_exchange"):
        raise ValueError(f"Unsupported persisted edition type: {persisted_edition_type}")
    target_edition_type: EditionType = body.edition_type or persisted_edition_type
    target_active = body.active if body.active is not None else edition.active

    organizations_implicitly_cleared = False
    if "organizations" in body.model_fields_set and body.organizations is not None:
        validate_organizations_allowed(target_edition_type, body.organizations)
        await validate_organization_ids(db, body.organizations)
        edition.organizations = list(body.organizations)
    elif target_edition_type != "festival" and edition.organizations:
        # The edition type changed away from festival without an explicit organizations
        # payload — either just now (edition_type in this update) or on an edition
        # already non-festival before this update. Off-festival editions can't carry
        # organizations, so clear the now-invalid associations as part of the same atomic
        # transition instead of rejecting the update.
        edition.organizations = []
        organizations_implicitly_cleared = True

    validate_organizations_allowed(target_edition_type, edition.organizations)

    deactivated: list[str] = []
    if target_active:
        deactivated = await deactivate_conflicting_editions(
            db, edition_type=target_edition_type, exclude_id=edition.id, actor=actor, request_id=request_id
        )

    # Safe to apply now: any conflicting active row of `target_edition_type` has
    # already been deactivated and flushed above.
    for field in ("active", "edition_type"):
        if field in body.model_fields_set and getattr(body, field) is not None:
            setattr(edition, field, getattr(body, field))

    details: dict = {"fields_changed": sorted(body.model_fields_set)}
    if organizations_implicitly_cleared:
        details["organizations_cleared"] = True
    if deactivated:
        details["deactivated_conflicting_editions"] = deactivated
    await write_audit_entry(
        db,
        actor=actor,
        action="edition_updated",
        resource_type="edition",
        resource_id=edition.id,
        request_id=request_id,
        details=details,
    )
    await commit_or_conflict(db)
    edition = await get_edition_or_404(db, edition.id)
    return await edition_payload(db, edition, active_only=False)


async def _lock_edition(db: AsyncSession, edition_id: str) -> Edition:
    """Re-read the edition under a row lock so concurrent artwork changes serialise."""
    locked = (
        await db.execute(
            select(Edition)
            .where(Edition.id == edition_id)
            .options(selectinload(Edition.events).selectinload(Event.products))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if locked is None:
        raise HTTPException(status_code=404, detail="Edition not found.")
    return locked


async def _commit_artwork_change(
    db: AsyncSession,
    edition: Edition,
    slot: edition_artwork.Slot,
    *,
    operation: str,
    actor: str,
    request_id: str | None,
) -> dict:
    await write_audit_entry(
        db,
        actor=actor,
        action="edition_artwork_updated",
        resource_type="edition",
        resource_id=edition.id,
        request_id=request_id,
        details={"slot": slot, "operation": operation},
    )
    await notify_render_cache_invalidate(db)
    await db.commit()
    edition = await get_edition_or_404(db, edition.id)
    return await edition_payload(db, edition, active_only=False)


async def upload_edition_artwork(
    db: AsyncSession,
    edition_id: str,
    slot: edition_artwork.Slot,
    data: bytes,
    *,
    actor: str,
    request_id: str | None = None,
) -> dict:
    """Publish *data* (already validated by ``edition_artwork.encode``) in one slot immediately.

    The previous file is deleted after commit; the new one is removed again if the
    transaction rolls back. Raises ``HTTPException`` for an unknown edition.
    """
    await edition_artwork.lock(db)
    edition = await _lock_edition(db, edition_id)
    column = edition_artwork.COLUMNS[slot]
    previous = getattr(edition, column)
    setattr(edition, column, edition_artwork.add(db, data))
    await edition_artwork.retire(db, previous)
    return await _commit_artwork_change(db, edition, slot, operation="upload", actor=actor, request_id=request_id)


async def clear_edition_artwork(
    db: AsyncSession, edition_id: str, slot: edition_artwork.Slot, *, actor: str, request_id: str | None = None
) -> dict:
    """Empty a slot so the site falls back to its static image. Clearing an empty slot is a no-op."""
    await edition_artwork.lock(db)
    edition = await _lock_edition(db, edition_id)
    column = edition_artwork.COLUMNS[slot]
    previous = getattr(edition, column)
    if previous is None:
        return await edition_payload(db, edition, active_only=False)
    setattr(edition, column, None)
    await edition_artwork.retire(db, previous)
    return await _commit_artwork_change(db, edition, slot, operation="clear", actor=actor, request_id=request_id)


async def delete_edition(db: AsyncSession, edition: Edition, *, actor: str, request_id: str | None = None) -> dict:
    edition_id = edition.id
    await edition_artwork.lock(db)
    # Re-read under the lock: an upload that committed after the caller loaded `edition` must have
    # its new file retired too, not the stale URL.
    edition = await _lock_edition(db, edition_id)
    artwork = [getattr(edition, column) for column in edition_artwork.COLUMNS.values()]
    await db.delete(edition)
    for url in artwork:
        await edition_artwork.retire(db, url)
    await write_audit_entry(
        db,
        actor=actor,
        action="edition_deleted",
        resource_type="edition",
        resource_id=edition_id,
        request_id=request_id,
        details={},
    )
    await notify_render_cache_invalidate(db)
    await db.commit()
    return {"deleted": True, "id": edition_id}
