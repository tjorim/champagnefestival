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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.live import mapping as live_mapping
from app.live import notify_live_event
from app.models import PaymentTransaction, Registration
from app.services.errors import ConflictError, to_http_exception
from app.services.idempotency import (
    check_idempotency_key,
    commit_with_idempotency_guard,
    hash_request,
    record_idempotency_key,
)
from app.utils import make_id

PAYMENT_TRANSACTION_SCOPE = "payments.record_transaction"

TRANSACTION_KINDS = ("payment", "refund", "correction")


def derive_payment_status(net_paid: Decimal, amount_due: Decimal | None) -> str:
    """Mirror the pre-ledger status rule that lived in ``apply_registration_update``:
    paid once ``net_paid`` reaches ``amount_due`` (a null due counts as zero),
    partial once something has been paid short of that, else unpaid."""
    due = amount_due or Decimal(0)
    if net_paid >= due:
        return "paid"
    if net_paid:
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


def payment_transaction_to_dict(t: PaymentTransaction) -> dict:
    return {
        "id": t.id,
        "registration_id": t.registration_id,
        # Stored as a string (not the raw Decimal) because this dict is also
        # what gets cached as an idempotency replay response, and the
        # IdempotencyKey.response_body JSON column can't serialise a Decimal
        # directly — PaymentTransactionOut parses the string back to Decimal.
        "amount": str(t.amount),
        "kind": t.kind,
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
    kind: str,
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

    Refunds and corrections never rewrite a prior payment — this always
    inserts a new row, optionally linked to the entry it reverses via
    ``reversed_transaction_id``. Idempotent under (scope, ``idempotency_key``)
    like every other bulk/import write — see ``app.services.idempotency``.
    """
    if kind not in TRANSACTION_KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"kind must be one of {', '.join(TRANSACTION_KINDS)}.",
        )
    if kind == "payment" and amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A payment amount must be positive.")
    if kind == "refund" and amount >= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A refund amount must be negative.")
    if kind == "correction" and amount == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A correction amount must not be zero.")

    request_hash = hash_request(
        {
            "registration_id": registration.id,
            "kind": kind,
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
    # two appended entries instead of both.
    await db.execute(select(Registration.id).where(Registration.id == registration.id).with_for_update())

    transaction = PaymentTransaction(
        id=make_id("paytxn"),
        registration_id=registration.id,
        amount=amount,
        kind=kind,
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
            "kind": kind,
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
