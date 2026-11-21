"""Payment transactions (the append-only ledger)."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import _utcnow

if TYPE_CHECKING:
    from app.models.registrations import Registration


class PaymentTransaction(Base):
    """Append-only ledger entry for money that moved on one booking (#1019).

    There is no ``kind`` column — a positive ``amount`` is a payment, a
    negative one is a refund, and that sign is the only distinction the
    system needs, so it's derived wherever a label is shown rather than
    stored redundantly. A refund never rewrites a prior payment — it's a
    new, separate row, optionally linked via ``reversed_transaction_id`` to
    the entry it reverses. ``Registration.amount_paid``/``payment_status``
    stay real, synced columns rather than becoming computed properties:
    every append recomputes and stores them (see
    ``app.services.payments_service.sync_registration_payment_fields``) so
    every existing reader — SQL filters/sorts on ``payment_status``,
    ``registration_to_out``, CSV exports, edition stats — keeps working
    unchanged; only the write path moves off direct mutation.
    """

    __tablename__ = "payment_transactions"
    __table_args__ = (CheckConstraint("amount <> 0", name="ck_payment_transactions_amount_nonzero"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    registration_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("registrations.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    """Signed EUR amount: positive for a payment, negative for a refund."""
    effective_date: Mapped[dt_date] = mapped_column(Date, nullable=False)
    """When the money actually moved (e.g. a bank-transfer date), which may
    predate when this entry is recorded."""
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    recorded_by: Mapped[str] = mapped_column(String(255), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reversed_transaction_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("payment_transactions.id", ondelete="SET NULL"), nullable=True
    )

    registration: Mapped[Registration] = relationship()
