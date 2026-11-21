"""Payment transactions and the append-only payment ledger."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal

from pydantic import ConfigDict, Field, field_validator

from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import NonEmptyText200, ResourceId, Text200, Text2000


class PaymentTransactionCreate(RequestModel):
    """One append-only ledger entry against a booking (#1019).

    There's no ``kind``: a positive ``amount`` is a payment, a negative one
    is a refund — that sign is the only distinction the system needs.
    ``amount != 0`` is validated in ``app.services.payments_service`` rather
    than here, so REST and MCP share one rule. Never edits or deletes a
    prior entry — a refund is always a new row, optionally linked to the
    entry it reverses via ``reversed_transaction_id``.
    """

    amount: Decimal = Field(decimal_places=2, max_digits=10)
    effective_date: dt_date
    """When the money actually moved (e.g. a bank-transfer date), which may
    predate when this entry is recorded."""
    reference: Text200 | None = None
    note: Text2000 | None = None
    reversed_transaction_id: ResourceId | None = None
    idempotency_key: NonEmptyText200 | None = None
    """Client-generated key so a retried/ambiguous submission cannot book or
    refund money twice — see docs/retry-safety.md."""

    @field_validator("reference", "note", mode="before")
    @classmethod
    def strip_optional_text(cls, v: str | None) -> str | None:
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        return stripped or None


class PaymentTransactionOut(ResponseModel):
    id: str
    registration_id: str
    amount: Decimal
    effective_date: dt_date
    recorded_at: datetime
    recorded_by: str
    reference: str | None
    note: str | None
    reversed_transaction_id: str | None

    model_config = ConfigDict(from_attributes=True)


class PaymentTransactionLedgerRow(PaymentTransactionOut):
    """One ledger entry with the booking context needed to render an
    edition- or person-level ledger view (#1019), so the admin UI doesn't
    need a round trip per row to resolve which booking/person it belongs to.
    """

    person_name: str
    event_title: str
    edition_label: str


class PaymentTransactionLedgerEnvelope(ResponseModel):
    """Paginated response for the edition/person ledger drill-down (#1032),
    mirroring ``RegistrationListEnvelope``: ``total`` counts every row
    matching the current filters, not just this page.
    """

    items: list[PaymentTransactionLedgerRow]
    total: int
    limit: int
    page: int
