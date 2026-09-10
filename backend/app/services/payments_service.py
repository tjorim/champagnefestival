"""Shared application-service operations for the payment ledger (#1019).

Used by both ``app.routers.registrations`` (REST) and
``app.mcp.admin.payments`` (MCP), matching the pattern in
``app.services.registrations_service`` (which this module works alongside,
sharing its ``Registration`` rows): raises ``HTTPException`` directly rather
than the ``ServiceError`` hierarchy other services use, since every caller
here is already reached through registration lookups that follow the same
convention.

The ledger (``PaymentTransaction``) is append-only and is the accounting
source of truth for what has actually been paid or refunded on a booking.
``Registration.amount_paid``/``payment_status`` remain real, synced columns
rather than becoming computed properties — ``sync_registration_payment_fields``
recomputes and stores them after every ledger append (and whenever
``amount_due`` changes, see ``registrations_service.apply_registration_update``)
so every existing reader (SQL filters/sorts on ``payment_status``,
``registration_to_dict``, CSV exports, edition stats, the ``RegistrationOut``
schema) keeps working unchanged; only the write path moves off direct
mutation and onto ledger entries.
"""

from __future__ import annotations

from datetime import date as dt_date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.live import mapping as live_mapping
from app.live import notify_live_event
from app.models import Event, PaymentTransaction, Person, Registration
from app.services.errors import ConflictError, to_http_exception
from app.services.idempotency import (
    check_idempotency_key,
    commit_with_idempotency_guard,
    hash_request,
    record_idempotency_key,
)
from app.utils import make_id

PAYMENT_TRANSACTION_SCOPE = "payments.record_transaction"


def derive_payment_status(net_paid: Decimal, amount_due: Decimal | None) -> str:
    """Mirror the pre-ledger status rule that lived in ``apply_registration_update``:
    paid once ``net_paid`` reaches ``amount_due`` (a null due counts as zero),
    partial once something has been paid short of that, else unpaid. A
    refund can drive ``net_paid`` negative; that's still "unpaid", not
    "partial" — a negative Decimal is truthy, so this must check the sign
    rather than truthiness.
    """
    due = amount_due or Decimal(0)
    if net_paid >= due:
        return "paid"
    if net_paid > 0:
        return "partial"
    return "unpaid"


async def net_paid_for_registration(db: AsyncSession, registration_id: str) -> Decimal:
    total = (
        await db.execute(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
                PaymentTransaction.registration_id == registration_id
            )
        )
    ).scalar_one()
    return Decimal(total)


async def sync_registration_payment_fields(db: AsyncSession, registration: Registration) -> None:
    """Recompute and store ``amount_paid``/``payment_status`` from ledger sums.

    Called after every ledger append, and whenever ``amount_due`` changes
    (the due amount moving can flip ``payment_status`` even though nothing
    new was paid).
    """
    net_paid = await net_paid_for_registration(db, registration.id)
    registration.amount_paid = net_paid
    registration.payment_status = derive_payment_status(net_paid, registration.amount_due)


async def list_transactions(db: AsyncSession, registration_id: str) -> list[PaymentTransaction]:
    """Return one booking's ledger, oldest first."""
    result = await db.execute(
        select(PaymentTransaction)
        .where(PaymentTransaction.registration_id == registration_id)
        .order_by(PaymentTransaction.effective_date, PaymentTransaction.recorded_at, PaymentTransaction.id)
    )
    return list(result.scalars().all())


def build_ledger_query(
    *,
    edition_id: str | None = None,
    person_id: str | None = None,
    effective_date_from: dt_date | None = None,
    effective_date_to: dt_date | None = None,
) -> Select:
    """Shared filtered ledger query behind both the CSV export and the
    edition/person-level drill-down view (#1019): joins each transaction to
    the booking/person/event it belongs to, oldest first."""
    stmt = (
        select(PaymentTransaction, Registration, Person, Event)
        .join(Registration, Registration.id == PaymentTransaction.registration_id)
        .join(Person, Person.id == Registration.person_id)
        .join(Event, Event.id == Registration.event_id)
        .options(selectinload(Event.edition))
        .order_by(PaymentTransaction.effective_date, PaymentTransaction.recorded_at)
    )
    if edition_id:
        stmt = stmt.where(Event.edition_id == edition_id)
    if person_id:
        stmt = stmt.where(Registration.person_id == person_id)
    if effective_date_from:
        stmt = stmt.where(PaymentTransaction.effective_date >= effective_date_from)
    if effective_date_to:
        stmt = stmt.where(PaymentTransaction.effective_date <= effective_date_to)
    return stmt


def ledger_row_to_dict(txn: PaymentTransaction, registration: Registration, person: Person, event: Event) -> dict:
    """One joined ledger row as returned by ``build_ledger_query``, shaped for
    ``PaymentTransactionLedgerRow`` (#1019)."""
    edition = event.edition
    return {
        **payment_transaction_to_dict(txn),
        "person_name": person.name,
        "event_title": event.title,
        "edition_label": f"{edition.year} {edition.month}" if edition else "",
    }


async def person_payment_summary(db: AsyncSession, person_id: str) -> dict:
    """Received/refunded/net paid/due/outstanding/refund-liability across one
    person's non-cancelled bookings — the person-level counterpart to the
    edition stats endpoint's aggregation (#1019). Every figure is traceable
    to ledger entries: received/refunded come from summing
    ``PaymentTransaction`` rows by sign (positive = payment, negative =
    refund — there's no stored ``kind``), and due/outstanding/refund-liability
    from the ``amount_due``/``amount_paid`` columns that
    ``sync_registration_payment_fields`` keeps derived from the same ledger.
    """
    totals_stmt = select(
        func.coalesce(func.sum(Registration.amount_paid), 0).label("net_paid"),
        func.coalesce(func.sum(Registration.amount_due), 0).label("due"),
        # Per-booking max()s: a partly-paid booking's shortfall and an
        # overpaid one's excess can't both cancel out in a single group SUM,
        # so each is clamped with GREATEST(..., 0) before being summed —
        # mirrors the edition stats query in app.routers.editions.
        func.coalesce(
            func.sum(func.greatest(func.coalesce(Registration.amount_due, 0) - Registration.amount_paid, 0)),
            0,
        ).label("outstanding"),
        func.coalesce(
            func.sum(func.greatest(Registration.amount_paid - func.coalesce(Registration.amount_due, 0), 0)),
            0,
        ).label("refund_liability"),
    ).where(Registration.person_id == person_id, Registration.status != "cancelled")
    totals = (await db.execute(totals_stmt)).one()

    txn_stmt = (
        select(
            func.coalesce(func.sum(PaymentTransaction.amount).filter(PaymentTransaction.amount > 0), 0).label(
                "received"
            ),
            func.coalesce(func.sum(PaymentTransaction.amount).filter(PaymentTransaction.amount < 0) * -1, 0).label(
                "refunded"
            ),
        )
        .select_from(PaymentTransaction)
        .join(Registration, Registration.id == PaymentTransaction.registration_id)
        .where(Registration.person_id == person_id, Registration.status != "cancelled")
    )
    txn_totals = (await db.execute(txn_stmt)).one()

    return {
        "received": txn_totals.received,
        "refunded": txn_totals.refunded,
        "net_paid": totals.net_paid,
        "due": totals.due,
        "outstanding": totals.outstanding,
        "refund_liability": totals.refund_liability,
    }


def payment_transaction_to_dict(t: PaymentTransaction) -> dict:
    return {
        "id": t.id,
        "registration_id": t.registration_id,
        # Stored as a string (not the raw Decimal) because this dict is also
        # what gets cached as an idempotency replay response, and the
        # IdempotencyKey.response_body JSON column can't serialise a Decimal
        # directly — PaymentTransactionOut parses the string back to Decimal.
        "amount": str(t.amount),
        "effective_date": t.effective_date,
        "recorded_at": t.recorded_at,
        "recorded_by": t.recorded_by,
        "reference": t.reference,
        "note": t.note,
        "reversed_transaction_id": t.reversed_transaction_id,
    }


async def record_payment_transaction(
    db: AsyncSession,
    registration: Registration,
    *,
    amount: Decimal,
    effective_date: dt_date,
    reference: str | None = None,
    note: str | None = None,
    reversed_transaction_id: str | None = None,
    actor: str,
    idempotency_key: str | None = None,
    request_id: str | None = None,
) -> dict:
    """Append one immutable ledger entry and resync the booking's derived totals.

    There is no ``kind``: a positive ``amount`` is a payment, a negative one
    is a refund — the sign is the only distinction, so nothing else is
    validated or stored. A refund never rewrites a prior payment — this
    always inserts a new row, optionally linked to the entry it reverses via
    ``reversed_transaction_id``. Idempotent under (scope, ``idempotency_key``)
    like every other bulk/import write — see ``app.services.idempotency``.
    """
    if amount == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount must not be zero.")

    request_hash = hash_request(
        {
            "registration_id": registration.id,
            "amount": str(amount),
            "effective_date": effective_date.isoformat(),
            "reference": reference,
            "note": note,
            "reversed_transaction_id": reversed_transaction_id,
        }
    )
    if idempotency_key:
        try:
            cached = await check_idempotency_key(
                db, scope=PAYMENT_TRANSACTION_SCOPE, key=idempotency_key, actor=actor, request_hash=request_hash
            )
        except ConflictError as exc:
            raise to_http_exception(exc) from exc
        if cached is not None:
            return cached

    if reversed_transaction_id is not None:
        reversed_row = await db.get(PaymentTransaction, reversed_transaction_id)
        if reversed_row is None or reversed_row.registration_id != registration.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="reversed_transaction_id must reference an existing transaction on the same booking.",
            )

    # Serialise concurrent appends to the same booking: without this lock, two
    # transactions committing around the same time could each compute
    # net_paid from a sum that doesn't yet see the other's (uncommitted)
    # insert, leaving amount_paid/payment_status reflecting only one of the
    # two appended entries instead of both. Refreshing afterwards guards a
    # second race: if amount_due changed (and committed) on this booking
    # between when the caller loaded `registration` and this lock being
    # granted, sync_registration_payment_fields below must derive
    # payment_status from that current value, not the caller's stale copy.
    await db.execute(select(Registration.id).where(Registration.id == registration.id).with_for_update())
    await db.refresh(registration, attribute_names=["amount_due"])

    transaction = PaymentTransaction(
        id=make_id("paytxn"),
        registration_id=registration.id,
        amount=amount,
        effective_date=effective_date,
        recorded_by=actor,
        reference=reference,
        note=note,
        reversed_transaction_id=reversed_transaction_id,
    )
    db.add(transaction)
    await db.flush()

    await sync_registration_payment_fields(db, registration)

    await write_audit_entry(
        db,
        actor=actor,
        action="payment_transaction_recorded",
        resource_type="registration",
        resource_id=registration.id,
        request_id=request_id,
        details={
            "transaction_id": transaction.id,
            "amount": str(amount),
            "effective_date": effective_date.isoformat(),
            "reference": reference,
            "reversed_transaction_id": reversed_transaction_id,
            "net_paid": str(registration.amount_paid),
            "payment_status": registration.payment_status,
        },
    )
    await notify_live_event(
        db,
        live_mapping.registration_changed(
            action="updated",
            registration_id=registration.id,
            event_id=registration.event_id,
            edition_id=registration.event.edition_id,
        ),
    )

    response = payment_transaction_to_dict(transaction)
    if idempotency_key:
        record_idempotency_key(
            db,
            scope=PAYMENT_TRANSACTION_SCOPE,
            key=idempotency_key,
            actor=actor,
            request_hash=request_hash,
            response_body=response,
        )
    try:
        await commit_with_idempotency_guard(db, idempotency_key=idempotency_key)
    except ConflictError as exc:
        raise to_http_exception(exc) from exc
    return response
