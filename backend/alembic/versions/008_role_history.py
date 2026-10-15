"""Retire a person's roles one at a time, and record when each role was held.

People gain ``retired_roles``, a JSON object mapping a role to the ISO date it was retired
(for example ``{"volunteer": "2026-10-13"}``). A retired role stays in ``roles``; the person
simply stops counting as an active member or volunteer, without the whole person being
flagged (``people.anonymised``). They also gain ``role_history``, ``{role: [{"started_on", "ended_on"}]}``
with one entry per stretch of holding a role (``retired_roles`` is derived from it). Existing
people start with neither: every role they hold is active with an unknown start.

``people.active`` becomes ``people.anonymised`` (inverted): the flag only ever marked anonymised people
once membership and volunteering moved to retired roles, so it is named for what it means.

``people.club_name`` is dropped: every member belongs to the one club the festival cares about,
so a free-text club name carries nothing.

Signage channels, layered templates and scheduled slides are edition-scoped.

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
    op.add_column("people", sa.Column("anonymised", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE people SET anonymised = NOT active")
    op.alter_column("people", "anonymised", server_default=None)
    op.drop_column("people", "active")

    op.create_table(
        "signage_channels",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("epoch", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_table(
        "signage_templates",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("background", sa.JSON(), nullable=False),
        sa.Column("layers", sa.JSON(), nullable=False),
    )
    op.create_table(
        "signage_slides",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "channel_id", sa.String(64), sa.ForeignKey("signage_channels.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "template_id", sa.String(64), sa.ForeignKey("signage_templates.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.CheckConstraint("duration > 0 AND duration <= 3600", name="ck_signage_duration"),
        sa.CheckConstraint("kind IN ('organizations', 'notice', 'image')", name="ck_signage_kind"),
        sa.CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_signage_window"),
    )
    op.create_index("ix_signage_slides_channel_id", "signage_slides", ["channel_id"])


def downgrade() -> None:
    op.drop_table("signage_slides")
    op.drop_table("signage_templates")
    op.drop_table("signage_channels")
    op.add_column("people", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE people SET active = NOT anonymised")
    op.drop_column("people", "anonymised")
    op.add_column("people", sa.Column("club_name", sa.String(200), nullable=False, server_default=""))
    op.drop_column("people", "role_history")
    op.drop_column("people", "retired_roles")
