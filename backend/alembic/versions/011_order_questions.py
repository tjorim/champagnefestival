"""Optional event questions with typed answers belonging to visitor orders.

Revision ID: 011
Revises: 010
"""

import sqlalchemy as sa

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_order_questions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(64), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("title_nl", sa.String(200), nullable=False),
        sa.Column("title_fr", sa.String(200)),
        sa.Column("title_en", sa.String(200)),
        sa.Column("description_nl", sa.String(500)),
        sa.Column("description_fr", sa.String(500)),
        sa.Column("description_en", sa.String(500)),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.CheckConstraint("kind IN ('single_choice', 'free_text', 'rating')", name="ck_order_question_kind"),
        sa.CheckConstraint("length(trim(title_nl)) > 0", name="ck_order_question_title"),
        sa.CheckConstraint(
            "((description_fr IS NULL AND description_en IS NULL) OR length(trim(description_nl)) > 0) IS TRUE",
            name="ck_order_question_description",
        ),
        sa.UniqueConstraint("id", "kind", name="uq_order_question_kind"),
    )
    op.create_index("ix_event_order_questions_event_id", "event_order_questions", ["event_id"])
    op.create_table(
        "event_order_options",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "question_id", sa.String(64), sa.ForeignKey("event_order_questions.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("label_nl", sa.String(200), nullable=False),
        sa.Column("label_fr", sa.String(200)),
        sa.Column("label_en", sa.String(200)),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.UniqueConstraint("id", "question_id", name="uq_order_option_question"),
        sa.CheckConstraint("length(trim(label_nl)) > 0", name="ck_order_option_label"),
    )
    op.create_index("ix_event_order_options_question_id", "event_order_options", ["question_id"])
    op.create_table(
        "registration_order_answers",
        sa.Column(
            "registration_id", sa.String(64), sa.ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("question_id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("option_id", sa.String(64)),
        sa.Column("text", sa.String(500)),
        sa.Column("rating", sa.Integer()),
        sa.ForeignKeyConstraint(
            ["question_id", "kind"], ["event_order_questions.id", "event_order_questions.kind"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["option_id", "question_id"],
            ["event_order_options.id", "event_order_options.question_id"],
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "(kind = 'single_choice' AND option_id IS NOT NULL AND text IS NULL AND rating IS NULL) OR (kind = 'free_text' AND option_id IS NULL AND text IS NOT NULL AND length(trim(text)) BETWEEN 1 AND 500 AND rating IS NULL) OR (kind = 'rating' AND option_id IS NULL AND text IS NULL AND rating IS NOT NULL AND rating BETWEEN 1 AND 5)",
            name="ck_order_answer_value",
        ),
    )
    op.create_index("ix_registration_order_answers_option_id", "registration_order_answers", ["option_id"])


def downgrade() -> None:
    op.drop_table("registration_order_answers")
    op.drop_table("event_order_options")
    op.drop_table("event_order_questions")
