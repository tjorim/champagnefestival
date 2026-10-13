"""Retire a person's roles one at a time.

People gain ``retired_roles``, a JSON object mapping a role to the ISO date it was retired
(for example ``{"volunteer": "2026-10-13"}``). A retired role stays in ``roles``; the person
simply stops counting as an active member or volunteer, without being archived as a whole
(``people.active``). Existing people start with no retired roles.

Revision ID: 008
Revises: 007
"""

import sqlalchemy as sa

from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("people", sa.Column("retired_roles", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    # Like the other JSON columns, the application always supplies a value.
    op.alter_column("people", "retired_roles", server_default=None)


def downgrade() -> None:
    op.drop_column("people", "retired_roles")
