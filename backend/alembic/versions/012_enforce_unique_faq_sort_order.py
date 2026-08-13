"""Enforce unique, deterministic FAQ sort_order.

`faq_items.sort_order` had no uniqueness or secondary tie-break, so two items
could share a position and the resulting display order depended on
database/query tie-breaking rather than an explicit rule (#836). Before adding
the constraint, existing rows are renumbered densely (0..N-1) in their current
effective order — `sort_order` first, `id` second as the same stable tie-break
the application now uses — so any pre-existing duplicates or gaps are repaired
rather than rejected by the new constraint.

The constraint is DEFERRABLE INITIALLY DEFERRED: it's only checked at commit,
so a reorder that touches several rows in one transaction can pass through a
transient duplicate state without failing mid-transaction.

Revision ID: 012
Revises: 011
Create Date: 2026-08-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE faq_items
        SET sort_order = ranked.new_order
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) - 1 AS new_order
            FROM faq_items
        ) AS ranked
        WHERE faq_items.id = ranked.id AND faq_items.sort_order != ranked.new_order
        """
    )
    op.create_unique_constraint(
        "uq_faq_items_sort_order",
        "faq_items",
        ["sort_order"],
        deferrable=True,
        initially="DEFERRED",
    )


def downgrade() -> None:
    op.drop_constraint("uq_faq_items_sort_order", "faq_items", type_="unique")
