"""Rename the exhibitor domain to organization, including persisted identifiers.

Revision ID: 005
Revises: 004
"""

import sqlalchemy as sa

from alembic import op

revision = "005"
down_revision = "004"
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
    op.rename_table(f"{old}_changes", f"{new}_changes")
    for table, column in (
        (f"{new}_changes", f"{old}_id"),
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
    # Pending job identities must match the renamed worker dispatcher. Keep the
    # job IDs, attempts, lease state and submission IDs so no job is re-enqueued.
    connection.execute(
        sa.text("""
            UPDATE outbox_jobs SET job_type = replace(job_type, :old, :new),
                resource_type = replace(resource_type, :old, :new),
                deduplication_key = replace(deduplication_key, :old_key, :new_key)
            WHERE job_type = :notification OR resource_type IN (:resource, :change)
        """),
        {
            "old": old,
            "new": new,
            "old_key": f"{old}-change:",
            "new_key": f"{new}-change:",
            "notification": f"{old}_change_notification",
            "resource": old,
            "change": f"{old}_change",
        },
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


def downgrade() -> None:
    _rename("organization", "exhibitor")
