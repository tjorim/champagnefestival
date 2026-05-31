"""Add indexed normalized fields for authenticated operational search.

Revision ID: 005
Revises: 004
Create Date: 2026-05-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

from app.operational_search_schema import OPERATIONAL_SEARCH_SCHEMA_STATEMENTS

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("people", sa.Column("search_name", sa.String(200), nullable=False, server_default=""))
    op.add_column("people", sa.Column("search_name_alt", sa.String(200), nullable=False, server_default=""))
    op.add_column("people", sa.Column("search_email", sa.String(200), nullable=False, server_default=""))
    for statement in OPERATIONAL_SEARCH_SCHEMA_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_people_search_email_trgm")
    op.execute("DROP INDEX IF EXISTS ix_people_search_email")
    op.execute("DROP INDEX IF EXISTS ix_people_search_name_alt_trgm")
    op.execute("DROP INDEX IF EXISTS ix_people_search_name_trgm")
    op.execute("DROP TRIGGER IF EXISTS people_operational_search_values ON people")
    op.execute("DROP FUNCTION IF EXISTS update_person_operational_search_values()")
    op.drop_column("people", "search_email")
    op.drop_column("people", "search_name_alt")
    op.drop_column("people", "search_name")
