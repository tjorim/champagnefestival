"""Enforce at most one active edition per edition_type.

Repairs any pre-existing conflict deterministically — for each `edition_type`
with more than one active edition, the most recently created one stays active
and the rest are deactivated, each recorded as an `edition_deactivated` audit
entry — then backs the invariant with a partial unique index so the database
rejects it going forward. See #832.

Revision ID: 008
Revises: 007
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RANKED_ACTIVE_EDITIONS = """
    SELECT id, edition_type,
           row_number() OVER (
               PARTITION BY edition_type ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM editions
    WHERE active = true
"""


def upgrade() -> None:
    op.execute(
        sa.text(
            f"""
            WITH ranked AS ({_RANKED_ACTIVE_EDITIONS}),
            to_deactivate AS (SELECT id, edition_type FROM ranked WHERE rn > 1)
            INSERT INTO audit_entries (
                id, "timestamp", actor, auth_source, subject, integration_client_id,
                action, resource_type, resource_id, request_id, details
            )
            SELECT
                'aud_mig008_' || id,
                now(),
                'system:migration_008',
                'none',
                NULL,
                NULL,
                'edition_deactivated',
                'edition',
                id,
                NULL,
                jsonb_build_object('reason', 'duplicate_active_repair', 'edition_type', edition_type)
            FROM to_deactivate
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            WITH ranked AS ({_RANKED_ACTIVE_EDITIONS})
            UPDATE editions
            SET active = false, updated_at = now()
            WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )
    op.create_index(
        "uq_editions_active_type",
        "editions",
        ["edition_type"],
        unique=True,
        postgresql_where=sa.text("active = true"),
    )


def downgrade() -> None:
    op.drop_index("uq_editions_active_type", table_name="editions")
