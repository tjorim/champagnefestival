"""Original language plus fallback for the remaining translated content (#1222).

FAQ items, announcements, composed messages, policies, product and poll option
text all follow the pattern events and organisations use: an original language
that must have text, optional translations, and a fallback to the original.
Existing rows are Dutch (the one language they were written in), so they migrate
as ``nl``.

Revision ID: 007
Revises: 006
"""

import sqlalchemy as sa

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def _original(language_column: str, template: str) -> str:
    """SQL ``(...) IS TRUE`` check that the original language's text(s) are non-blank.

    *template* names the column family with ``{lang}``, joined with AND for pairs.
    """
    clauses = " OR ".join(
        f"({language_column} = '{lang}' AND {template.format(lang=lang)})" for lang in ("nl", "fr", "en")
    )
    return f"({clauses}) IS TRUE"


# --- FAQ items -----------------------------------------------------------------

FAQ_CHECK = _original("text_language", "length(trim(question_{lang})) > 0 AND length(trim(answer_{lang})) > 0")


def _upgrade_faq() -> None:
    op.add_column("faq_items", sa.Column("text_language", sa.String(2), nullable=True))
    op.execute("UPDATE faq_items SET text_language = 'nl'")
    op.alter_column("faq_items", "text_language", nullable=False)
    op.alter_column("faq_items", "question_nl", nullable=True)
    op.alter_column("faq_items", "answer_nl", nullable=True)
    op.create_check_constraint("ck_faq_items_original", "faq_items", FAQ_CHECK)


def _downgrade_faq() -> None:
    op.drop_constraint("ck_faq_items_original", "faq_items", type_="check")
    # Dutch becomes required again: an item whose original is another language gets that text.
    op.execute(
        "UPDATE faq_items SET "
        "question_nl = coalesce(question_nl, CASE text_language WHEN 'fr' THEN question_fr ELSE question_en END), "
        "answer_nl = coalesce(answer_nl, CASE text_language WHEN 'fr' THEN answer_fr ELSE answer_en END)"
    )
    op.alter_column("faq_items", "question_nl", nullable=False)
    op.alter_column("faq_items", "answer_nl", nullable=False)
    op.drop_column("faq_items", "text_language")


def upgrade() -> None:
    _upgrade_faq()


def downgrade() -> None:
    _downgrade_faq()
