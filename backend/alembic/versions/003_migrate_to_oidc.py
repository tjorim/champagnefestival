"""Rename people.supertokens_user_id to people.oidc_subject.

Revision ID: 003
Revises: 002
Create Date: 2026-05-03
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_people_supertokens_user_id", table_name="people")
    op.alter_column("people", "supertokens_user_id", new_column_name="oidc_subject")
    op.create_index("ix_people_oidc_subject", "people", ["oidc_subject"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_people_oidc_subject", table_name="people")
    op.alter_column("people", "oidc_subject", new_column_name="supertokens_user_id")
    op.create_index("ix_people_supertokens_user_id", "people", ["supertokens_user_id"], unique=True)
