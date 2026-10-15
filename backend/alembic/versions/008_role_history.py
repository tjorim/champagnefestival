"""Retire a person's roles one at a time, and record when each role was held.

People gain ``retired_roles``, a JSON object mapping a role to the ISO date it was retired
(for example ``{"volunteer": "2026-10-13"}``). A retired role stays in ``roles``; the person
simply stops counting as an active member or volunteer, without being archived as a whole
(``people.active``). They also gain ``role_history``, ``{role: [{"started_on", "ended_on"}]}``
with one entry per stretch of holding a role (``retired_roles`` is derived from it). Existing
people start with neither: every role they hold is active with an unknown start.

``people.club_name`` is dropped: every member belongs to the one club the festival cares about,
so a free-text club name carries nothing.

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
    op.add_column("people", sa.Column("role_history", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.alter_column("people", "role_history", server_default=None)
    op.drop_column("people", "club_name")


def downgrade() -> None:
    op.add_column("people", sa.Column("club_name", sa.String(200), nullable=False, server_default=""))
    op.drop_column("people", "role_history")
    op.drop_column("people", "retired_roles")
