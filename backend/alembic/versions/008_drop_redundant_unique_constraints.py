"""Drop redundant unique constraints superseded by named unique indexes.

users.oidc_subject and pebble_access_tokens.token_hash have carried a
plain (unnamed) unique constraint since 001_initial/002, which Postgres
auto-named users_oidc_subject_key / pebble_access_tokens_token_hash_key.
The models were also missing the named unique indexes (ix_users_oidc_subject,
ix_pebble_access_tokens_token_hash) those same migrations create — models.py
drifted to not declare either index at all. Restoring the missing index
declarations (rather than re-adding a second, differently-named constraint)
leaves both columns doubly unique-enforced: the old anonymous constraint and
the named index. Drop the now-redundant constraint; the named unique index
alone continues to enforce uniqueness with no behavior change.

Revision ID: 008
Revises: 007
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("users_oidc_subject_key", "users", type_="unique")
    op.drop_constraint("pebble_access_tokens_token_hash_key", "pebble_access_tokens", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("users_oidc_subject_key", "users", ["oidc_subject"])
    op.create_unique_constraint("pebble_access_tokens_token_hash_key", "pebble_access_tokens", ["token_hash"])
