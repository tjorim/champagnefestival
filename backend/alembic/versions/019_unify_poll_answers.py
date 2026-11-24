"""Store volunteer poll answers in one discriminated table (#1662).

Volunteer polls kept an answer in one of four tables by the question's kind: ``volunteer_poll_answers`` (yes/no
and people) and ``volunteer_poll_choices``, ``volunteer_poll_texts`` and ``volunteer_poll_ratings`` (one typed
value each). The visitor order questions already use a single ``registration_order_answers`` table with a
``kind`` column and a CHECK that exactly one value column is set. Polls now follow the same design:
``volunteer_poll_answers`` gets ``kind``, ``option_id``, ``text`` and ``rating`` next to ``attending`` and
``people`` (the last two become nullable), ``ck_volunteer_poll_answers_value`` allows exactly the columns of the
row's kind, and the composite foreign keys keep ``kind`` equal to the question's kind (``edition_poll_questions``
gets ``uq_poll_question_kind`` on ``(id, kind)`` for that) and the option inside its question. The three typed
tables are copied in and dropped. ``volunteer_poll_selections`` stays: a meals answer is a quantity per option.

The upgrade is written so that odd legacy values cannot fail it. Only rows the new table can hold are copied:

* a typed row counts only when its question still has the matching kind (a question's kind cannot change, so
  this guards against hand-edited data), its option belongs to that question, its text is non-blank and at most
  500 characters, and its rating is between 1 and 5 (the old tables enforced the same, so a healthy database
  loses nothing);
* a ``yes_no`` row whose question is of another kind is dropped, because the app never showed it;
* a volunteer has one answer per question, so a duplicate (impossible with the old keys) keeps one row.

Downgrade restores the four tables: every typed row goes back to its table and the people/attendance columns
become ``NOT NULL`` again. Nothing is lost beyond what the upgrade already discarded as unusable.
"""

import sqlalchemy as sa

from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None

MAX_POLL_PEOPLE = 10

_VALUE_CHECK = (
    "(kind = 'yes_no' AND attending IS NOT NULL AND people IS NOT NULL"
    f" AND ((attending AND people BETWEEN 1 AND {MAX_POLL_PEOPLE}) OR (NOT attending AND people = 0))"
    " AND option_id IS NULL AND text IS NULL AND rating IS NULL)"
    " OR (kind = 'single_choice' AND option_id IS NOT NULL AND text IS NULL AND rating IS NULL"
    " AND attending IS NULL AND people IS NULL)"
    " OR (kind = 'free_text' AND text IS NOT NULL AND length(trim(text)) BETWEEN 1 AND 500 AND option_id IS NULL"
    " AND rating IS NULL AND attending IS NULL AND people IS NULL)"
    " OR (kind = 'rating' AND rating IS NOT NULL AND rating BETWEEN 1 AND 5 AND option_id IS NULL AND text IS NULL"
    " AND attending IS NULL AND people IS NULL)"
)

_COPY_CHOICES = """
INSERT INTO volunteer_poll_answers (volunteer_id, question_id, kind, option_id)
SELECT choice.volunteer_id, choice.question_id, 'single_choice', choice.option_id
FROM volunteer_poll_choices AS choice
JOIN edition_poll_questions AS question ON question.id = choice.question_id AND question.kind = 'single_choice'
JOIN edition_poll_options AS option ON option.id = choice.option_id AND option.question_id = choice.question_id
ON CONFLICT DO NOTHING
"""

_COPY_TEXTS = """
INSERT INTO volunteer_poll_answers (volunteer_id, question_id, kind, text)
SELECT answer.volunteer_id, answer.question_id, 'free_text', answer.text
FROM volunteer_poll_texts AS answer
JOIN edition_poll_questions AS question ON question.id = answer.question_id AND question.kind = 'free_text'
WHERE answer.text IS NOT NULL AND length(trim(answer.text)) BETWEEN 1 AND 500
ON CONFLICT DO NOTHING
"""

_COPY_RATINGS = """
INSERT INTO volunteer_poll_answers (volunteer_id, question_id, kind, rating)
SELECT answer.volunteer_id, answer.question_id, 'rating', answer.rating
FROM volunteer_poll_ratings AS answer
JOIN edition_poll_questions AS question ON question.id = answer.question_id AND question.kind = 'rating'
WHERE answer.rating BETWEEN 1 AND 5
ON CONFLICT DO NOTHING
"""


def _create_typed_table(name: str, column: sa.Column) -> None:
    op.create_table(
        name,
        sa.Column("volunteer_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "question_id",
            sa.String(64),
            sa.ForeignKey("edition_poll_questions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        column,
    )


def upgrade() -> None:
    # An attendance row on a question that is not yes/no was never reachable; the new foreign key cannot hold it.
    op.execute(
        "DELETE FROM volunteer_poll_answers AS answer USING edition_poll_questions AS question "
        "WHERE question.id = answer.question_id AND question.kind <> 'yes_no'"
    )

    op.create_unique_constraint("uq_poll_question_kind", "edition_poll_questions", ["id", "kind"])
    op.drop_constraint("ck_volunteer_poll_answers_people", "volunteer_poll_answers", type_="check")
    op.drop_constraint("volunteer_poll_answers_question_id_fkey", "volunteer_poll_answers", type_="foreignkey")
    op.add_column("volunteer_poll_answers", sa.Column("kind", sa.String(32), nullable=True))
    op.add_column("volunteer_poll_answers", sa.Column("option_id", sa.String(64), nullable=True))
    op.add_column("volunteer_poll_answers", sa.Column("text", sa.String(500), nullable=True))
    op.add_column("volunteer_poll_answers", sa.Column("rating", sa.Integer(), nullable=True))
    op.alter_column("volunteer_poll_answers", "attending", nullable=True)
    op.alter_column("volunteer_poll_answers", "people", nullable=True)
    op.execute("UPDATE volunteer_poll_answers SET kind = 'yes_no'")
    op.alter_column("volunteer_poll_answers", "kind", nullable=False)

    op.execute(_COPY_CHOICES)
    op.execute(_COPY_TEXTS)
    op.execute(_COPY_RATINGS)
    for table in ("volunteer_poll_choices", "volunteer_poll_texts", "volunteer_poll_ratings"):
        op.drop_table(table)

    op.create_foreign_key(
        "volunteer_poll_answers_question_id_kind_fkey",
        "volunteer_poll_answers",
        "edition_poll_questions",
        ["question_id", "kind"],
        ["id", "kind"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "volunteer_poll_answers_option_id_question_id_fkey",
        "volunteer_poll_answers",
        "edition_poll_options",
        ["option_id", "question_id"],
        ["id", "question_id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint("ck_volunteer_poll_answers_value", "volunteer_poll_answers", _VALUE_CHECK)
    op.create_index("ix_volunteer_poll_answers_option_id", "volunteer_poll_answers", ["option_id"])


def downgrade() -> None:
    _create_typed_table("volunteer_poll_choices", sa.Column("option_id", sa.String(64), nullable=False))
    op.create_foreign_key(
        "volunteer_poll_choices_option_id_question_id_fkey",
        "volunteer_poll_choices",
        "edition_poll_options",
        ["option_id", "question_id"],
        ["id", "question_id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_volunteer_poll_choices_option_id", "volunteer_poll_choices", ["option_id"])
    _create_typed_table("volunteer_poll_texts", sa.Column("text", sa.String(500), nullable=False))
    op.create_check_constraint("ck_poll_texts_value", "volunteer_poll_texts", "length(trim(text)) BETWEEN 1 AND 500")
    _create_typed_table("volunteer_poll_ratings", sa.Column("rating", sa.Integer(), nullable=False))
    op.create_check_constraint("ck_poll_ratings_value", "volunteer_poll_ratings", "rating BETWEEN 1 AND 5")
    op.execute(
        "INSERT INTO volunteer_poll_choices (volunteer_id, question_id, option_id) "
        "SELECT volunteer_id, question_id, option_id FROM volunteer_poll_answers WHERE kind = 'single_choice'"
    )
    op.execute(
        "INSERT INTO volunteer_poll_texts (volunteer_id, question_id, text) "
        "SELECT volunteer_id, question_id, text FROM volunteer_poll_answers WHERE kind = 'free_text'"
    )
    op.execute(
        "INSERT INTO volunteer_poll_ratings (volunteer_id, question_id, rating) "
        "SELECT volunteer_id, question_id, rating FROM volunteer_poll_answers WHERE kind = 'rating'"
    )

    op.execute("DELETE FROM volunteer_poll_answers WHERE kind <> 'yes_no'")
    op.drop_index("ix_volunteer_poll_answers_option_id", table_name="volunteer_poll_answers")
    op.drop_constraint("ck_volunteer_poll_answers_value", "volunteer_poll_answers", type_="check")
    op.drop_constraint(
        "volunteer_poll_answers_option_id_question_id_fkey", "volunteer_poll_answers", type_="foreignkey"
    )
    op.drop_constraint("volunteer_poll_answers_question_id_kind_fkey", "volunteer_poll_answers", type_="foreignkey")
    for column in ("rating", "text", "option_id", "kind"):
        op.drop_column("volunteer_poll_answers", column)
    op.alter_column("volunteer_poll_answers", "attending", nullable=False)
    op.alter_column("volunteer_poll_answers", "people", nullable=False)
    op.create_foreign_key(
        "volunteer_poll_answers_question_id_fkey",
        "volunteer_poll_answers",
        "edition_poll_questions",
        ["question_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_volunteer_poll_answers_people",
        "volunteer_poll_answers",
        f"(attending AND people BETWEEN 1 AND {MAX_POLL_PEOPLE}) OR (NOT attending AND people = 0)",
    )
    op.drop_constraint("uq_poll_question_kind", "edition_poll_questions", type_="unique")
