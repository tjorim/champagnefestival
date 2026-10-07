"""Independent exhibitor manager credentials (#1192).

Revision ID: 005
Revises: 004
"""

import sqlalchemy as sa

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exhibitor_manager_magic_links",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "exhibitor_manager_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("session_hash", sa.String(64), nullable=False),
        *[
            sa.Column(name, sa.DateTime(timezone=True), nullable=False)
            for name in ("created_at", "last_seen_at", "expires_at", "hard_expires_at")
        ],
    )
    op.create_index(
        "ix_exhibitor_manager_sessions_session_hash", "exhibitor_manager_sessions", ["session_hash"], unique=True
    )
    for name in ("expires_at", "hard_expires_at"):
        op.create_index(f"ix_exhibitor_manager_sessions_{name}", "exhibitor_manager_sessions", [name])


def downgrade() -> None:
    op.drop_table("exhibitor_manager_sessions")
    op.drop_table("exhibitor_manager_magic_links")
