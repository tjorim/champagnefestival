"""Add indexed normalized fields for authenticated operational search.

Revision ID: 005
Revises: 004
Create Date: 2026-05-31
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copy of the schema statements — intentionally not imported from
# app.operational_search_schema so this migration remains self-contained.
_SCHEMA_STATEMENTS = (
    "CREATE EXTENSION IF NOT EXISTS unaccent",
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    "CREATE EXTENSION IF NOT EXISTS fuzzystrmatch",
    """
    CREATE OR REPLACE FUNCTION update_person_operational_search_values() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
        NEW.search_name := trim(regexp_replace(lower(unaccent(NEW.name)), '[^[:alnum:]]+', ' ', 'g'));
        NEW.search_name_alt := trim(regexp_replace(lower(unaccent(
            replace(replace(replace(replace(lower(NEW.name), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')
        )), '[^[:alnum:]]+', ' ', 'g'));
        NEW.search_email := lower(NEW.email);
        RETURN NEW;
    END;
    $$;
    """,
    "DROP TRIGGER IF EXISTS people_operational_search_values ON people",
    """
    CREATE TRIGGER people_operational_search_values
    BEFORE INSERT OR UPDATE OF name, email ON people
    FOR EACH ROW EXECUTE FUNCTION update_person_operational_search_values()
    """,
    # Fire the BEFORE UPDATE trigger for every existing row to populate the new columns.
    "UPDATE people SET name = name, email = email",
    "CREATE INDEX IF NOT EXISTS ix_people_search_name_trgm ON people USING gin (search_name gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_name_alt_trgm ON people USING gin (search_name_alt gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_email ON people (search_email)",
    "CREATE INDEX IF NOT EXISTS ix_people_search_email_trgm ON people USING gin (search_email gin_trgm_ops)",
)


def upgrade() -> None:
    op.add_column("people", sa.Column("search_name", sa.String(200), nullable=False, server_default=""))
    op.add_column("people", sa.Column("search_name_alt", sa.String(200), nullable=False, server_default=""))
    op.add_column("people", sa.Column("search_email", sa.String(200), nullable=False, server_default=""))
    for statement in _SCHEMA_STATEMENTS:
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
