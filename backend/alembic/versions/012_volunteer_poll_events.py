"""Volunteer-only events with attendance-poll registrations.

Revision ID: 012
Revises: 011
"""

import sqlalchemy as sa

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("events", sa.Column("volunteers_only", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column(
        "edition_poll_questions",
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", name="fk_poll_event", ondelete="RESTRICT")),
    )
    op.create_unique_constraint("uq_poll_event", "edition_poll_questions", ["event_id"])
    op.create_check_constraint(
        "ck_poll_event_attendance", "edition_poll_questions", "event_id IS NULL OR kind = 'yes_no'"
    )
    op.add_column(
        "registrations",
        sa.Column(
            "poll_question_id",
            sa.String(64),
            sa.ForeignKey("edition_poll_questions.id", name="fk_registration_poll", ondelete="SET NULL"),
        ),
    )
    op.create_index("ix_registrations_poll_question_id", "registrations", ["poll_question_id"])
    op.create_unique_constraint("uq_registration_poll_person", "registrations", ["poll_question_id", "person_id"])


def downgrade():
    op.drop_constraint("uq_registration_poll_person", "registrations", type_="unique")
    op.drop_constraint("fk_registration_poll", "registrations", type_="foreignkey")
    op.drop_index("ix_registrations_poll_question_id", table_name="registrations")
    op.drop_column("registrations", "poll_question_id")
    op.drop_constraint("ck_poll_event_attendance", "edition_poll_questions", type_="check")
    op.drop_constraint("uq_poll_event", "edition_poll_questions", type_="unique")
    op.drop_constraint("fk_poll_event", "edition_poll_questions", type_="foreignkey")
    op.drop_column("edition_poll_questions", "event_id")
    op.drop_column("events", "volunteers_only")
