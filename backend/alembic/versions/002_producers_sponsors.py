"""Replace content_items blob with proper producers and sponsors tables.

Revision ID: 002
Revises: 001
Create Date: 2026-03-18
"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "producers",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("image", sa.String(500), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "sponsors",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("image", sa.String(500), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Migrate existing data from content_items JSON blobs
    conn = op.get_bind()
    for key, table in [("producers", "producers"), ("sponsors", "sponsors")]:
        row = conn.execute(
            sa.text("SELECT value FROM content_items WHERE key = :key"), {"key": key}
        ).fetchone()
        if row:
            items = json.loads(row[0]) if row[0] else []
            for item in items:
                if not item.get("name") or not isinstance(item.get("id"), int):
                    continue
                conn.execute(
                    sa.text(
                        f"INSERT INTO {table} (id, name, image, active) VALUES (:id, :name, :image, :active)"  # noqa: S608
                    ),
                    {
                        "id": item["id"],
                        "name": item["name"],
                        "image": item.get("image", ""),
                        "active": item.get("active", True),
                    },
                )

    op.drop_table("content_items")


def downgrade() -> None:
    op.create_table(
        "content_items",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("value", sa.Text, nullable=False, server_default="[]"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Restore data from producers/sponsors back into content_items blobs
    conn = op.get_bind()
    for key, table in [("producers", "producers"), ("sponsors", "sponsors")]:
        rows = conn.execute(
            sa.text(f"SELECT id, name, image, active FROM {table} ORDER BY id")  # noqa: S608
        ).fetchall()
        items = [
            {"id": r[0], "name": r[1], "image": r[2], "active": bool(r[3])} for r in rows
        ]
        conn.execute(
            sa.text("INSERT INTO content_items (key, value) VALUES (:key, :value)"),
            {"key": key, "value": json.dumps(items)},
        )

    op.drop_table("producers")
    op.drop_table("sponsors")
