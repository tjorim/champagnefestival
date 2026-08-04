"""Add events.allow_preorders, decoupled from the free-text category label.

The pre-order UI used to key off `category == "vip"` — a magic string on a
free-text field an admin can type anything into. "VIP" is a display label
(the public schedule already colors/badges it independently); whether an
event sells champagne/food is a different, unrelated question, and one that
applies just as well to an "exchange" or "tasting" event as to a "vip" one.

Existing events categorised "vip" are backfilled to True so behaviour is
preserved for anything already relying on it; the column defaults to False
for every new event, making pre-orders an explicit admin decision rather
than an accident of what they typed as the category.

Revision ID: 006
Revises: 005
Create Date: 2026-08-04
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("allow_preorders", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE events SET allow_preorders = true WHERE category = 'vip'")
    op.alter_column("events", "allow_preorders", server_default=None)


def downgrade() -> None:
    op.drop_column("events", "allow_preorders")
