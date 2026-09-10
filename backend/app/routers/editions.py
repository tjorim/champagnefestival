"""Edition management endpoints.

Business logic — the create/update transition, payload building, and shared
lookup/validation helpers — lives in ``app.services.editions_service`` and is
shared with ``app.mcp.admin.editions``; see that module's docstring for why
editions use ``HTTPException`` directly rather than the ``ServiceError``
convention other services follow.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import Event, PaymentTransaction, Registration
from app.schemas import EditionAttendanceStats, EditionCreate, EditionOut, EditionType, EditionUpdate
from app.services import editions_service

router = APIRouter(prefix="/api/editions", tags=["editions"])
logger = logging.getLogger(__name__)


@router.get("/active", response_model=EditionOut)
async def get_active_edition(
    db: AsyncSession = Depends(get_db),
    edition_type: EditionType | None = Query(default=None),
) -> dict:
    """Return the current or next upcoming active edition, optionally filtered by type.

    Only the edition's *active* events are considered: an inactive (draft/cancelled)
    event neither keeps an otherwise-finished edition classified as upcoming, nor
    appears in the response.
    """
    active = await editions_service.find_active_edition(db, edition_type=edition_type)
    if active is None:
        raise HTTPException(status_code=404, detail="No active or upcoming editions found.")
    return await editions_service.edition_payload(db, active, active_only=True)


@router.get("/upcoming", response_model=list[EditionOut])
async def list_upcoming_editions(
    db: AsyncSession = Depends(get_db),
    edition_type: EditionType | None = Query(default=None),
) -> list[dict]:
    """List upcoming active editions across all supported edition types.

    Only each edition's active events count toward its upcoming status, and only
    active events are serialized in the response; see `get_active_edition`.
    """
    today = datetime.now(UTC).date()
    editions = await editions_service.load_editions(db, include_inactive=False, edition_type=edition_type)
    upcoming = [
        edition
        for edition in editions
        if (editions_service.edition_end_date(editions_service.active_events(edition)) or date.min) >= today
    ]
    return await editions_service.edition_payloads(
        db, editions_service.sorted_editions(upcoming, active_only=True), active_only=True
    )


@router.get("", response_model=list[EditionOut], dependencies=[Depends(require_admin)])
async def list_editions(
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = Query(False),
) -> list[dict]:
    """Admin listing: exposes every event (active or not) for management purposes."""
    editions = await editions_service.load_editions(db, include_inactive=include_inactive)
    return await editions_service.edition_payloads(
        db, editions_service.sorted_editions(editions, active_only=False), active_only=False
    )


@router.get("/stats", response_model=list[EditionAttendanceStats], dependencies=[Depends(require_admin)])
async def list_edition_attendance_stats(
    db: AsyncSession = Depends(get_db),
    edition_type: EditionType | None = Query(default=None),
) -> list[dict]:
    """Per-edition attendance/check-in totals, oldest first, for a cross-edition trend view.

    Includes inactive (past) editions since the point is historical comparison.
    Registered but cancelled bookings are excluded from every count.
    """
    editions = await editions_service.load_editions(db, include_inactive=True, edition_type=edition_type)
    editions = editions_service.sorted_editions(editions, active_only=False)

    stmt = (
        select(
            Event.edition_id,
            func.count(Registration.id).label("total_registrations"),
            func.coalesce(func.sum(Registration.guest_count), 0).label("total_guests"),
            func.coalesce(func.sum(Registration.guest_count).filter(Registration.checked_in.is_(True)), 0).label(
                "total_checked_in"
            ),
            func.coalesce(func.sum(Registration.amount_paid), 0).label("total_paid"),
            func.coalesce(func.sum(Registration.amount_due), 0).label("total_due"),
            # #1019: outstanding/refund-liability are per-booking max()s (a
            # partly-paid booking's shortfall and an overpaid one's excess
            # can't both cancel out in a single group SUM), so each is
            # clamped with GREATEST(..., 0) before being summed.
            func.coalesce(
                func.sum(func.greatest(func.coalesce(Registration.amount_due, 0) - Registration.amount_paid, 0)),
                0,
            ).label("total_outstanding"),
            func.coalesce(
                func.sum(func.greatest(Registration.amount_paid - func.coalesce(Registration.amount_due, 0), 0)),
                0,
            ).label("total_refund_liability"),
        )
        .join(Event, Event.id == Registration.event_id)
        .where(Registration.status != "cancelled")
        .group_by(Event.edition_id)
    )
    stats_by_edition = {row.edition_id: row for row in (await db.execute(stmt)).all()}

    # Received/refunded come from the ledger itself (not the synced
    # amount_paid column) so a booking's gross payments and gross refunds are
    # reported separately instead of netted together.
    txn_stmt = (
        select(
            Event.edition_id,
            func.coalesce(func.sum(PaymentTransaction.amount).filter(PaymentTransaction.amount > 0), 0).label(
                "total_received"
            ),
            func.coalesce(func.sum(PaymentTransaction.amount).filter(PaymentTransaction.amount < 0) * -1, 0).label(
                "total_refunded"
            ),
        )
        .select_from(PaymentTransaction)
        .join(Registration, Registration.id == PaymentTransaction.registration_id)
        .join(Event, Event.id == Registration.event_id)
        .where(Registration.status != "cancelled")
        .group_by(Event.edition_id)
    )
    txn_stats_by_edition = {row.edition_id: row for row in (await db.execute(txn_stmt)).all()}

    payloads = []
    for edition in editions:
        stats = stats_by_edition.get(edition.id)
        txn_stats = txn_stats_by_edition.get(edition.id)
        payloads.append(
            {
                "edition_id": edition.id,
                "year": edition.year,
                "month": edition.month,
                "edition_type": edition.edition_type,
                "start_date": editions_service.edition_start_date(edition.events),
                "events_count": len(edition.events),
                "total_registrations": stats.total_registrations if stats else 0,
                "total_guests": stats.total_guests if stats else 0,
                "total_checked_in": stats.total_checked_in if stats else 0,
                "total_paid": stats.total_paid if stats else 0,
                "total_due": stats.total_due if stats else 0,
                "total_outstanding": stats.total_outstanding if stats else 0,
                "total_refund_liability": stats.total_refund_liability if stats else 0,
                "total_received": txn_stats.total_received if txn_stats else 0,
                "total_refunded": txn_stats.total_refunded if txn_stats else 0,
            }
        )
    return payloads


@router.get("/{edition_id}", response_model=EditionOut, dependencies=[Depends(require_admin)])
async def get_edition(edition_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    edition = await editions_service.get_edition_or_404(db, edition_id)
    return await editions_service.edition_payload(db, edition, active_only=False)


@router.post(
    "",
    response_model=EditionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_edition(
    body: EditionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await editions_service.create_edition(
        db, body=body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.put("/{edition_id}", response_model=EditionOut, dependencies=[Depends(require_admin)])
async def update_edition(
    edition_id: str,
    body: EditionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    edition = await editions_service.get_edition_or_404(db, edition_id)
    return await editions_service.apply_edition_update(
        db, edition, body, actor=actor, request_id=getattr(request.state, "request_id", None)
    )


@router.delete(
    "/{edition_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_edition(
    edition_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    edition = await editions_service.get_edition_or_404(db, edition_id)
    await editions_service.delete_edition(
        db, edition, actor=actor, request_id=getattr(request.state, "request_id", None)
    )
