"""Add the append-only payment_transactions ledger and backfill opening balances (#1019).

Revision ID: 002
Revises: 001
"""

from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels = None
depends_on = None

_MIGRATION_ACTOR = "migration:002_payment_transactions"

_payment_transactions_table = sa.table(
    "payment_transactions",
    sa.column("id", sa.String),
    sa.column("registration_id", sa.String),
    sa.column("amount", sa.Numeric),
    sa.column("kind", sa.String),
    sa.column("effective_date", sa.Date),
    sa.column("recorded_at", sa.DateTime(timezone=True)),
    sa.column("recorded_by", sa.String),
    sa.column("reference", sa.String),
    sa.column("note", sa.Text),
)


def _backfill_opening_balances(bind, now: datetime) -> None:
    """Insert one opening-balance `payment` entry per booking that already
    carries a non-zero amount_paid, so existing bookings preserve their
    recorded paid total once balance/payment_status derive from ledger sums
    instead of being read off the mutable amount_paid column directly
    (app.services.payments_service.sync_registration_payment_fields keeps
    writing that same column afterwards, so nothing downstream of it ever
    sees a discontinuity). `amount_paid` cannot go negative under the
    pre-ledger schema (RegistrationUpdate.amount_paid required >= 0), so
    every backfilled row is a `payment`, never a `refund`/`correction`.

    Takes a plain ``bind``/``Connection`` (a real one via ``op.get_bind()``
    in ``upgrade()``, or a test's own connection) and a plain Core insert
    rather than ``op.bulk_insert`` so it's callable outside an Alembic
    migration context too — see ``tests/test_payment_transactions.py``,
    which exercises this exact function against the real migration file.
    """
    rows = bind.execute(sa.text("SELECT id, amount_paid, created_at FROM registrations WHERE amount_paid <> 0")).all()
    if not rows:
        return
    bind.execute(
        _payment_transactions_table.insert(),
        [
            {
                "id": f"paytxn_backfill_{row.id}",
                "registration_id": row.id,
                "amount": row.amount_paid,
                "kind": "payment",
                "effective_date": row.created_at.date(),
                "recorded_at": now,
                "recorded_by": _MIGRATION_ACTOR,
                "reference": None,
                "note": "Opening balance backfilled from amount_paid (#1019).",
            }
            for row in rows
        ],
    )


def upgrade() -> None:
    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "registration_id",
            sa.String(64),
            sa.ForeignKey("registrations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("recorded_by", sa.String(255), nullable=False),
        sa.Column("reference", sa.String(200), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "reversed_transaction_id",
            sa.String(64),
            sa.ForeignKey("payment_transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint("kind IN ('payment', 'refund', 'correction')", name="ck_payment_transactions_kind"),
    )
    op.create_index("ix_payment_transactions_registration_id", "payment_transactions", ["registration_id"])
    _backfill_opening_balances(op.get_bind(), datetime.now(UTC))


def downgrade() -> None:
    op.drop_index("ix_payment_transactions_registration_id", table_name="payment_transactions")
    op.drop_table("payment_transactions")
