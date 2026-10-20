"""Add single choice, free text and 1–5 rating poll questions.

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
    op.drop_constraint("ck_edition_poll_questions_kind", "edition_poll_questions")
    op.alter_column("edition_poll_questions", "kind", type_=sa.String(32), existing_type=sa.String(10))
    op.create_check_constraint(
        "ck_edition_poll_questions_kind",
        "edition_poll_questions",
        "kind IN ('yes_no', 'meals', 'single_choice', 'free_text', 'rating')",
    )
    op.create_unique_constraint("uq_poll_option_question", "edition_poll_options", ["id", "question_id"])
    for suffix, column, constraints in (
        (
            "choices",
            sa.Column("option_id", sa.String(64), nullable=False),
            [
                sa.ForeignKeyConstraint(
                    ["option_id", "question_id"],
                    ["edition_poll_options.id", "edition_poll_options.question_id"],
                    ondelete="CASCADE",
                )
            ],
        ),
        (
            "texts",
            sa.Column("text", sa.String(500), nullable=False),
            [sa.CheckConstraint("length(trim(text)) BETWEEN 1 AND 500", name="ck_poll_texts_value")],
        ),
        (
            "ratings",
            sa.Column("rating", sa.Integer(), nullable=False),
            [sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_poll_ratings_value")],
        ),
    ):
        op.create_table(
            f"volunteer_poll_{suffix}",
            sa.Column("volunteer_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
            sa.Column(
                "question_id",
                sa.String(64),
                sa.ForeignKey("edition_poll_questions.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            column,
            *constraints,
        )

    op.create_index("ix_volunteer_poll_choices_option_id", "volunteer_poll_choices", ["option_id"])


def downgrade() -> None:
    # The old app cannot represent the new questions. Remove them (and their options)
    # explicitly; existing yes/no and meals questions and answers remain untouched.
    for suffix in ("choices", "texts", "ratings"):
        op.drop_table(f"volunteer_poll_{suffix}")
    op.execute("DELETE FROM edition_poll_questions WHERE kind IN ('single_choice', 'free_text', 'rating')")
    op.drop_constraint("uq_poll_option_question", "edition_poll_options")
    op.drop_constraint("ck_edition_poll_questions_kind", "edition_poll_questions")
    op.alter_column("edition_poll_questions", "kind", type_=sa.String(10), existing_type=sa.String(32))
    op.create_check_constraint(
        "ck_edition_poll_questions_kind", "edition_poll_questions", "kind IN ('yes_no', 'meals')"
    )
