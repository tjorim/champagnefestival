"""Rename the organization domain; add descriptions and proposal history (#1190–#1193).

Revision ID: 004
Revises: 003
"""

import sqlalchemy as sa

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def _json_names(value, old: str, new: str):
    """Rename structured keys and managed URLs, preserving user-authored text."""
    if isinstance(value, dict):
        return {key.replace(old, new): _json_names(item, old, new) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_names(item, old, new) for item in value]
    if isinstance(value, str) and value.startswith(f"/uploads/{old}s/"):
        return value.replace(f"/uploads/{old}s/", f"/uploads/{new}s/", 1)
    return value


def _rename(old: str, new: str) -> None:
    connection = op.get_bind()
    quote = connection.dialect.identifier_preparer.quote
    op.rename_table(f"{old}s", f"{new}s")
    for table, column in (
        ("areas", f"{old}_id"),
        ("editions", f"{old}s"),
        ("editions", f"co_organizer_{old}_id"),
    ):
        op.alter_column(table, column, new_column_name=column.replace(old, new))

    # PostgreSQL keeps old constraint/index/sequence names when tables and
    # columns are renamed. Rename constraints first (including their indexes),
    # then remaining indexes and the serial sequence, within the current schema.
    constraints = connection.execute(
        sa.text("""
            SELECT t.relname, c.conname FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = current_schema() AND strpos(c.conname, :old) > 0
        """),
        {"old": old},
    ).all()
    for table, name in constraints:
        op.execute(f"ALTER TABLE {quote(table)} RENAME CONSTRAINT {quote(name)} TO {quote(name.replace(old, new))}")
    relations = connection.execute(
        sa.text("""
            SELECT c.relname, c.relkind FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema() AND c.relkind IN ('i', 'S') AND strpos(c.relname, :old) > 0
        """),
        {"old": old},
    ).all()
    for name, kind in relations:
        relation = "INDEX" if kind == "i" else "SEQUENCE"
        op.execute(f"ALTER {relation} {quote(name)} RENAME TO {quote(name.replace(old, new))}")

    connection.execute(
        sa.text(f"UPDATE {new}s SET image = replace(image, :old_url, :new_url) WHERE image LIKE :prefix"),
        {"old_url": f"/uploads/{old}s/", "new_url": f"/uploads/{new}s/", "prefix": f"/uploads/{old}s/%"},
    )
    connection.execute(
        sa.text("""
            UPDATE audit_entries SET action = replace(action, :old, :new),
                resource_type = replace(resource_type, :old, :new)
            WHERE resource_type IN (:resource, :change)
        """),
        {"old": old, "new": new, "resource": old, "change": f"{old}_change"},
    )
    audit = sa.table("audit_entries", sa.column("id", sa.String), sa.column("details", sa.JSON))
    rows = connection.execute(sa.select(audit).where(sa.cast(audit.c.details, sa.Text).contains(old)))
    for row_id, details in rows:
        renamed = _json_names(details, old, new)
        if renamed != details:
            connection.execute(audit.update().where(audit.c.id == row_id).values(details=renamed))


def upgrade() -> None:
    _rename("exhibitor", "organization")
    op.add_column("organizations", sa.Column("description_language", sa.String(2), nullable=True))
    for language in ("nl", "fr", "en"):
        op.add_column("organizations", sa.Column(f"description_{language}", sa.String(600), nullable=True))
    op.create_check_constraint(
        "ck_organizations_description_original",
        "organizations",
        "(description_language IS NULL AND description_nl IS NULL AND description_fr IS NULL "
        "AND description_en IS NULL) OR "
        "(description_language IS NOT NULL AND ("
        "(description_language = 'nl' AND length(trim(description_nl)) > 0) OR "
        "(description_language = 'fr' AND length(trim(description_fr)) > 0) OR "
        "(description_language = 'en' AND length(trim(description_en)) > 0)) IS TRUE)",
    )

    op.create_table(
        "organization_changes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("submitted_by", sa.String(255), nullable=False),
        sa.Column("submitted_auth_source", sa.String(64)),
        sa.Column("submitted_values", sa.JSON(), nullable=False),
        sa.Column("proposed", sa.JSON(), nullable=False),
        sa.Column("superseded_fields", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(2000)),
        sa.Column("notification_recipient", sa.String(320)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'superseded', 'replaced')",
            name="ck_organization_change_status",
        ),
    )
    op.create_index("ix_organization_changes_organization_id", "organization_changes", ["organization_id"])
    op.create_index(
        "uq_organization_pending_change",
        "organization_changes",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_table("organization_changes")
    op.drop_constraint("ck_organizations_description_original", "organizations", type_="check")
    for field in ("description_en", "description_fr", "description_nl", "description_language"):
        op.drop_column("organizations", field)
    _rename("organization", "exhibitor")
