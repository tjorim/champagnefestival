"""Flag rooms still sitting at the legacy default dimensions as placeholders.

Adds `dimensions_placeholder` to `rooms`, backfilled `true` for any room at
exactly the old silent default of 20.0m x 15.0m applied before dimensions
became a required field (see #835 for the schema-level fix, #833 for this
identification pass). Also drops the now-misleading `server_default`s on
`width_m`/`length_m` so a write that bypasses the Pydantic layer can no
longer resurrect the fake default.

Revision ID: 009
Revises: 008
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LEGACY_DEFAULT_ROOMS = "SELECT id, width_m, length_m FROM rooms WHERE width_m = 20.0 AND length_m = 15.0"


def upgrade() -> None:
    op.add_column(
        "rooms",
        sa.Column("dimensions_placeholder", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        sa.text(
            f"""
            WITH legacy AS ({_LEGACY_DEFAULT_ROOMS})
            INSERT INTO audit_entries (
                id, "timestamp", actor, auth_source, subject, integration_client_id,
                action, resource_type, resource_id, request_id, details
            )
            SELECT
                'aud_mig009_' || id,
                now(),
                'system:migration_009',
                'none',
                NULL,
                NULL,
                'room_flagged_placeholder_dimensions',
                'room',
                id,
                NULL,
                jsonb_build_object('reason', 'legacy_default_dimensions', 'width_m', width_m, 'length_m', length_m)
            FROM legacy
            """
        )
    )
    op.execute(sa.text("UPDATE rooms SET dimensions_placeholder = true WHERE width_m = 20.0 AND length_m = 15.0"))
    op.alter_column("rooms", "width_m", server_default=None)
    op.alter_column("rooms", "length_m", server_default=None)


def downgrade() -> None:
    op.alter_column("rooms", "length_m", server_default="15.0")
    op.alter_column("rooms", "width_m", server_default="20.0")
    op.drop_column("rooms", "dimensions_placeholder")
