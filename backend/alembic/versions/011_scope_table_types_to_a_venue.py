"""Scope table_types to a venue, like rooms.

Adds a required `venue_id` FK to `table_types` (see #858 — table types were a
flat, global catalog with no venue awareness at all). Existing rows are
backfilled to the earliest venue (by `created_at`) — at the time of writing,
production only ever had one venue, so this is a straightforward assignment
rather than a fan-out; each backfilled row gets a
`table_type_backfilled_venue` audit entry recording which venue it landed on,
mirroring migration 010's identification pass for rooms.

Revision ID: 011
Revises: 010
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_EARLIEST_VENUE = "SELECT id FROM venues ORDER BY created_at, id LIMIT 1"


def upgrade() -> None:
    op.add_column("table_types", sa.Column("venue_id", sa.String(64), nullable=True))
    op.execute(
        sa.text(
            f"""
            WITH backfilled AS (
                UPDATE table_types
                SET venue_id = ({_EARLIEST_VENUE})
                WHERE venue_id IS NULL AND EXISTS (SELECT 1 FROM venues)
                RETURNING id, venue_id
            )
            INSERT INTO audit_entries (
                id, "timestamp", actor, auth_source, subject, integration_client_id,
                action, resource_type, resource_id, request_id, details
            )
            SELECT
                -- See migration 010 for why this is capped with left() rather than
                -- concatenated directly: audit_entries.id is String(64), and a
                -- table_type id near that limit would otherwise blow the column.
                left('aud_mig011_' || id, 64),
                now(),
                'system:migration_011',
                'none',
                NULL,
                NULL,
                'table_type_backfilled_venue',
                'table_type',
                id,
                NULL,
                jsonb_build_object('venue_id', venue_id)
            FROM backfilled
            """
        )
    )
    # The backfill above only assigns a venue when at least one exists (see
    # _EARLIEST_VENUE's WHERE clause) — a table_types row predating any venue at
    # all would otherwise hit the NOT NULL constraint below as an opaque Postgres
    # error. Fail loudly and explain the fix instead.
    unassigned = op.get_bind().execute(sa.text("SELECT count(*) FROM table_types WHERE venue_id IS NULL")).scalar()
    if unassigned:
        raise RuntimeError(
            f"Migration 011 cannot proceed: {unassigned} table_types row(s) have no venue "
            "to backfill from (no venues exist). Create at least one venue, or manually "
            "assign table_types.venue_id, then re-run this migration."
        )

    op.alter_column("table_types", "venue_id", nullable=False)
    op.create_foreign_key(
        "table_types_venue_id_fkey",
        "table_types",
        "venues",
        ["venue_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("table_types_venue_id_fkey", "table_types", type_="foreignkey")
    op.drop_column("table_types", "venue_id")
