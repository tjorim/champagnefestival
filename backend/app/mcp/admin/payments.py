"""Admin MCP tool implementations for the payment ledger (#1019).

Mirrors the transaction endpoints of ``app.routers.registrations``. Business
logic lives in ``app.services.payments_service`` and is shared with REST.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.mcp.utils import as_value_error, validate_with_schema
from app.schemas import PaymentTransactionCreate
from app.services import payments_service, registrations_service


async def create_payment_transaction(
    session_factory: Any,
    actor: str,
    registration_id: str,
    *,
    amount: float,
    effective_date: str,
    reference: str | None = None,
    note: str | None = None,
    reversed_transaction_id: str | None = None,
    idempotency_key: str | None = None,
) -> dict:
    """Append one ledger entry (admin equivalent of ``POST /api/registrations/{id}/transactions``).

    There's no ``kind``: a positive ``amount`` is a payment, a negative one
    is a refund. Never edits or deletes a prior entry — a refund is always a
    new, separate row, optionally linked via ``reversed_transaction_id`` to
    the entry it reverses. Pass the same ``idempotency_key`` on a retry (e.g.
    after a timeout) to safely replay the same result instead of recording
    the money twice — see docs/retry-safety.md.
    """
    body = validate_with_schema(
        PaymentTransactionCreate,
        amount=amount,
        effective_date=effective_date,
        reference=reference,
        note=note,
        reversed_transaction_id=reversed_transaction_id,
        idempotency_key=idempotency_key,
    )
    async with session_factory() as db:
        try:
            registration = await registrations_service.get_registration_or_404(db, registration_id)
            return await payments_service.record_payment_transaction(
                db,
                registration,
                amount=body.amount,
                effective_date=body.effective_date,
                reference=body.reference,
                note=body.note,
                reversed_transaction_id=body.reversed_transaction_id,
                actor=actor,
                idempotency_key=body.idempotency_key,
            )
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def list_payment_transactions(session_factory: Any, registration_id: str) -> dict:
    """List one booking's chronological ledger (admin equivalent of ``GET /api/registrations/{id}/transactions``).

    The accounting source of truth behind that booking's
    ``amount_paid``/``payment_status``/``refund_due`` fields.
    """
    async with session_factory() as db:
        try:
            await registrations_service.get_registration_or_404(db, registration_id)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
        rows = await payments_service.list_transactions(db, registration_id)
        return {
            "transactions": [payments_service.payment_transaction_to_dict(t) for t in rows],
            "count": len(rows),
        }
