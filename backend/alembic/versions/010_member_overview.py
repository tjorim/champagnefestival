"""Member overview settings, unique current-member emails and members-only events.

Revision ID: 010
Revises: 009
"""

import sqlalchemy as sa

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("members_only", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("app_settings", sa.Column("member_limit", sa.Integer(), nullable=True))
    op.add_column("app_settings", sa.Column("member_inactivity_months", sa.Integer(), nullable=True))
    op.add_column("people", sa.Column("inactivity_exempt", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("people", sa.Column("inactivity_exempt_note", sa.Text(), server_default="", nullable=False))
    predicate = "NOT anonymised AND CAST(roles AS text) LIKE '%\"member\"%' AND retired_roles ->> 'member' IS NULL AND trim(email) <> ''"
    op.create_index(
        "uq_people_current_member_email",
        "people",
        [sa.text("lower(trim(email))")],
        unique=True,
        postgresql_where=sa.text(predicate),
    )
    op.create_index("ix_registrations_person_checked_event", "registrations", ["person_id", "checked_in", "event_id"])


def downgrade() -> None:
    op.drop_column("events", "members_only")
    op.drop_index("ix_registrations_person_checked_event", table_name="registrations")
    op.drop_index("uq_people_current_member_email", table_name="people")
    op.drop_column("people", "inactivity_exempt_note")
    op.drop_column("people", "inactivity_exempt")
    op.drop_column("app_settings", "member_inactivity_months")
    op.drop_column("app_settings", "member_limit")
