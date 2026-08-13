"""Add idempotency_keys table for bulk/import write operations.

Backs the idempotency-key mechanism for the new bulk-create endpoints (rooms,
table types, tables, layouts — see issue #837): a client-supplied key, scoped
per operation, whose successful result is cached so a retried call (after a
partial failure or timeout) replays the original response instead of
creating duplicate records. A key reused with a different request body is
rejected rather than silently applied — enforced by the unique constraint on
(``scope``, ``key``) plus a request-body hash comparison in the application
layer (``app.services.idempotency``).

Revision ID: 013
Revises: 012
Create Date: 2026-08-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("scope", sa.String(100), nullable=False),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_unique_constraint("uq_idempotency_keys_scope_key", "idempotency_keys", ["scope", "key"])
    op.create_index("ix_idempotency_keys_created_at", "idempotency_keys", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_idempotency_keys_created_at", table_name="idempotency_keys")
    op.drop_constraint("uq_idempotency_keys_scope_key", "idempotency_keys", type_="unique")
    op.drop_table("idempotency_keys")
