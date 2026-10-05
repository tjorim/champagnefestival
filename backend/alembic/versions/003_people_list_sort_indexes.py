"""Add the composite sort indexes behind the paged people and volunteer lists (#1176).

Each sortable column of ``GET /api/people`` and ``GET /api/volunteers`` gets a
btree ending in ``id`` — the deterministic tiebreak every sort uses — so offset
paging in either direction can be served from the index.

Revision ID: 003
Revises: 002
"""

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels = None
depends_on = None

_INDEXES: dict[str, list[str]] = {
    "ix_people_search_name_id": ["search_name", "id"],
    "ix_people_search_email_id": ["search_email", "id"],
    "ix_people_created_at_id": ["created_at", "id"],
    "ix_people_updated_at_id": ["updated_at", "id"],
}


def upgrade() -> None:
    for name, columns in _INDEXES.items():
        op.create_index(name, "people", columns)


def downgrade() -> None:
    for name in reversed(_INDEXES):
        op.drop_index(name, table_name="people")
