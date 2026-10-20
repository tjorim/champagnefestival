"""Dutch is the one required language of translated content, and the volunteer meal poll grows up.

Part 1 - Dutch base language.

Migration 006 gave every translated text an *original language* (``title_language``,
``text_language``, ...): the language that must have text and that readers fall back to.
Dutch is the base language of the vzw and the festival, so that flexibility bought nothing:
Dutch text is now always required (``title_nl``, ``label_nl``, ``question_nl`` and so on) and
is what a missing translation falls back to. The ``*_language`` columns and the
``ck_*_original`` constraints are replaced by ``ck_*_nl`` constraints on the Dutch columns.

Content whose original language was French or English and that has no Dutch text yet gets
that text copied into the Dutch column first, because the Dutch text is now required and
the content must stay visible; each such table is logged for review. A pending organization
change keeps its text the same way, and loses the ``description_language`` key it carried.

Order lines keep the ``name_language`` they were copied with; it is no longer read.

Part 2 - meal poll.

- ``edition_poll_questions`` are the questions put to the volunteers of an edition: ``yes_no`` (will you join
  this, with how many people: ``volunteer_poll_answers``) or ``meals`` (pick dishes: the existing options and
  ``volunteer_poll_selections``). A question has a translated title (Dutch required), an optional description,
  a place in the list and its own optional closing time. Every existing option moves into one "Maaltijden"
  (Dutch; "Repas", "Meals") meals question per edition.
- ``edition_poll_options.label`` becomes ``label_nl`` (Dutch is required, like other translated content)
  next to optional ``label_fr`` and ``label_en``; options get a ``sort_order`` (existing options keep their
  creation order) and ``dietary_tags``.
- ``volunteer_meal_notes`` holds a volunteer's free-text dietary note for one edition.

Part 3 - additional question kinds and visitor order questions.

- Single choice, free text and 1–5 ratings use typed volunteer answer tables.
- Optional event questions use typed answers belonging to visitor orders.

The downgrade drops question definitions and typed answers (the meals options and picks stay).
Registrations and products are preserved.

Revision ID: 009
Revises: 008
"""

import json
import logging
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

# Table, the language column, whether the text is required (otherwise optional, with a nullable column).
COLUMNS = (
    ("event_categories", "label_language", "required"),
    ("product_categories", "label_language", "required"),
    ("events", "title_language", "required"),
    ("events", "description_language", "optional"),
    ("products", "name_language", "required"),
    ("products", "description_language", "optional"),
    ("organizations", "description_language", "optional"),
    ("faq_items", "text_language", "required"),
    ("announcements", "text_language", "required"),
    ("composed_messages", "text_language", "required"),
    ("policies", "title_language", "required"),
    ("policy_versions", "content_language", "required"),
)

# Table, language column, the text columns that gain a Dutch value, and an extra condition.
BACKFILLS = (
    ("event_categories", "label_language", ("label",), ""),
    ("product_categories", "label_language", ("label",), ""),
    ("events", "title_language", ("title",), ""),
    ("events", "description_language", ("description",), ""),
    ("products", "name_language", ("name",), ""),
    ("products", "description_language", ("description",), ""),
    ("organizations", "description_language", ("description",), ""),
    ("faq_items", "text_language", ("question", "answer"), ""),
    ("announcements", "text_language", ("text",), ""),
    ("announcements", "text_language", ("link_label",), "AND link_url IS NOT NULL"),
    ("composed_messages", "text_language", ("title", "body"), ""),
    ("policies", "title_language", ("title",), ""),
    ("policy_versions", "content_language", ("content",), ""),
)


def _original(language_column: str, template: str) -> str:
    clauses = " OR ".join(
        f"({language_column} = '{lang}' AND {template.format(lang=lang)})" for lang in ("nl", "fr", "en")
    )
    return f"({clauses}) IS TRUE"


def _optional_original(prefix: str) -> str:
    language = f"{prefix}_language"
    clauses = " OR ".join(
        f"({language} = '{lang}' AND length(trim({prefix}_{lang})) > 0)" for lang in ("nl", "fr", "en")
    )
    return (
        f"({language} IS NULL AND {prefix}_nl IS NULL AND {prefix}_fr IS NULL AND {prefix}_en IS NULL) OR "
        f"({language} IS NOT NULL AND ({clauses}) IS TRUE)"
    )


def _optional_dutch(prefix: str) -> str:
    return f"(({prefix}_fr IS NULL AND {prefix}_en IS NULL) OR length(trim({prefix}_nl)) > 0) IS TRUE"


# Table, old name, old SQL, new name, new SQL.
CONSTRAINTS = (
    (
        "event_categories",
        "ck_event_categories_label_original",
        _original("label_language", "length(trim(label_{lang})) > 0"),
        "ck_event_categories_label_nl",
        "(length(trim(label_nl)) > 0) IS TRUE",
    ),
    (
        "product_categories",
        "ck_product_categories_label_original",
        _original("label_language", "length(trim(label_{lang})) > 0"),
        "ck_product_categories_label_nl",
        "(length(trim(label_nl)) > 0) IS TRUE",
    ),
    (
        "events",
        "ck_events_title_original",
        _original("title_language", "length(trim(title_{lang})) > 0"),
        "ck_events_title_nl",
        "(length(trim(title_nl)) > 0) IS TRUE",
    ),
    (
        "events",
        "ck_events_description_original",
        _optional_original("description"),
        "ck_events_description_nl",
        _optional_dutch("description"),
    ),
    (
        "products",
        "ck_products_name_original",
        _original("name_language", "length(trim(name_{lang})) > 0"),
        "ck_products_name_nl",
        "(length(trim(name_nl)) > 0) IS TRUE",
    ),
    (
        "products",
        "ck_products_description_original",
        _optional_original("description"),
        "ck_products_description_nl",
        _optional_dutch("description"),
    ),
    (
        "organizations",
        "ck_organizations_description_original",
        _optional_original("description"),
        "ck_organizations_description_nl",
        _optional_dutch("description"),
    ),
    (
        "faq_items",
        "ck_faq_items_original",
        _original("text_language", "length(trim(question_{lang})) > 0 AND length(trim(answer_{lang})) > 0"),
        "ck_faq_items_nl",
        "(length(trim(question_nl)) > 0 AND length(trim(answer_nl)) > 0) IS TRUE",
    ),
    (
        "announcements",
        "ck_announcements_text_original",
        _original("text_language", "length(trim(text_{lang})) > 0"),
        "ck_announcements_text_nl",
        "(length(trim(text_nl)) > 0) IS TRUE",
    ),
    (
        "announcements",
        "ck_announcements_link_label_original",
        "link_url IS NULL OR " + _original("text_language", "length(trim(link_label_{lang})) > 0"),
        "ck_announcements_link_label_nl",
        "(link_url IS NULL OR length(trim(link_label_nl)) > 0) IS TRUE",
    ),
    (
        "composed_messages",
        "ck_composed_messages_original",
        _original("text_language", "length(trim(title_{lang})) > 0 AND length(trim(body_{lang})) > 0"),
        "ck_composed_messages_nl",
        "(length(trim(title_nl)) > 0 AND length(trim(body_nl)) > 0) IS TRUE",
    ),
    (
        "policies",
        "ck_policies_title_original",
        _original("title_language", "length(trim(title_{lang})) > 0"),
        "ck_policies_title_nl",
        "(length(trim(title_nl)) > 0) IS TRUE",
    ),
    (
        "policy_versions",
        "ck_policy_versions_original",
        "status = 'draft' OR " + _original("content_language", "length(trim(content_{lang})) > 0"),
        "ck_policy_versions_nl",
        "(status = 'draft' OR length(trim(content_nl)) > 0) IS TRUE",
    ),
)


def _copy_original_into_dutch() -> None:
    """Where the original language is French or English and Dutch has no text, copy that text."""
    connection = op.get_bind()
    for table, language, bases, extra in BACKFILLS:
        for base in bases:
            result = connection.execute(
                sa.text(
                    f"UPDATE {table} SET {base}_nl = CASE {language} WHEN 'fr' THEN {base}_fr ELSE {base}_en END "
                    f"WHERE {language} IN ('fr', 'en') AND ({base}_nl IS NULL OR length(trim({base}_nl)) = 0) {extra}"
                )
            )
            if result.rowcount:
                logger.warning(
                    "%s: %d row(s) had %s as original language and no Dutch %s; the text was copied into %s_nl - "
                    "review the Dutch wording.",
                    table,
                    result.rowcount,
                    language,
                    base,
                    base,
                )


def _carry_pending_changes() -> None:
    """Drop ``description_language`` from organization change proposals, keeping their text usable."""
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT c.id, c.submitted_values, c.proposed, o.description_nl "
            "FROM organization_changes c JOIN organizations o ON o.id = c.organization_id"
        )
    ).all()
    for change_id, submitted, proposed, live_dutch in rows:
        values = []
        for document in (submitted, proposed):
            document = dict(document or {})
            language = document.pop("description_language", None)
            text = document.get(f"description_{language}") if language in ("fr", "en") else None
            if text and not document.get("description_nl") and not (live_dutch or "").strip():
                document["description_nl"] = text
            values.append(document)
        if values != [submitted or {}, proposed or {}]:
            connection.execute(
                sa.text(
                    "UPDATE organization_changes SET submitted_values = CAST(:submitted AS json), "
                    "proposed = CAST(:proposed AS json) WHERE id = :id"
                ),
                {"id": change_id, "submitted": json.dumps(values[0]), "proposed": json.dumps(values[1])},
            )


POLL_LABEL_CHECK = "(length(trim(label_nl)) > 0) IS TRUE"
POLL_QUESTION_TITLE_CHECK = "(length(trim(title_nl)) > 0) IS TRUE"
POLL_QUESTION_DESCRIPTION_CHECK = (
    "((description_fr IS NULL AND description_en IS NULL) OR length(trim(description_nl)) > 0) IS TRUE"
)
MAX_POLL_PEOPLE = 10


def _upgrade_meal_poll() -> None:
    connection = op.get_bind()
    op.create_table(
        "edition_poll_questions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("title_nl", sa.String(200), nullable=False),
        sa.Column("title_fr", sa.String(200), nullable=True),
        sa.Column("title_en", sa.String(200), nullable=True),
        sa.Column("description_nl", sa.String(500), nullable=True),
        sa.Column("description_fr", sa.String(500), nullable=True),
        sa.Column("description_en", sa.String(500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind IN ('yes_no', 'meals')", name="ck_edition_poll_questions_kind"),
        sa.CheckConstraint(POLL_QUESTION_TITLE_CHECK, name="ck_edition_poll_questions_title_nl"),
        sa.CheckConstraint(POLL_QUESTION_DESCRIPTION_CHECK, name="ck_edition_poll_questions_description_nl"),
    )
    op.create_index("ix_edition_poll_questions_edition_id", "edition_poll_questions", ["edition_id"])

    op.alter_column("edition_poll_options", "label", new_column_name="label_nl")
    op.add_column("edition_poll_options", sa.Column("label_fr", sa.String(200), nullable=True))
    op.add_column("edition_poll_options", sa.Column("label_en", sa.String(200), nullable=True))
    op.add_column(
        "edition_poll_options",
        sa.Column("dietary_tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.alter_column("edition_poll_options", "dietary_tags", server_default=None)
    op.add_column("edition_poll_options", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.alter_column("edition_poll_options", "sort_order", server_default=None)
    op.execute(
        "UPDATE edition_poll_options o SET sort_order = r.position FROM ("
        "SELECT id, row_number() OVER (PARTITION BY edition_id ORDER BY created_at, id) - 1 AS position "
        "FROM edition_poll_options) r WHERE o.id = r.id"
    )
    op.create_check_constraint("ck_edition_poll_options_label_nl", "edition_poll_options", POLL_LABEL_CHECK)

    # Every existing option belongs to one "meals" question per edition.
    op.add_column("edition_poll_options", sa.Column("question_id", sa.String(64), nullable=True))
    for edition_id in connection.execute(sa.text("SELECT DISTINCT edition_id FROM edition_poll_options")).scalars():
        question_id = f"pollq_{uuid4().hex[:24]}"
        connection.execute(
            sa.text(
                "INSERT INTO edition_poll_questions (id, edition_id, kind, title_nl, title_fr, title_en, sort_order) "
                "VALUES (:id, :edition, 'meals', 'Maaltijden', 'Repas', 'Meals', 0)"
            ),
            {"id": question_id, "edition": edition_id},
        )
        connection.execute(
            sa.text("UPDATE edition_poll_options SET question_id = :question WHERE edition_id = :edition"),
            {"question": question_id, "edition": edition_id},
        )
    op.alter_column("edition_poll_options", "question_id", nullable=False)
    op.create_foreign_key(
        "fk_edition_poll_options_question_id",
        "edition_poll_options",
        "edition_poll_questions",
        ["question_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_edition_poll_options_question_id", "edition_poll_options", ["question_id"])

    op.create_table(
        "volunteer_poll_answers",
        sa.Column("volunteer_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "question_id",
            sa.String(64),
            sa.ForeignKey("edition_poll_questions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("attending", sa.Boolean(), nullable=False),
        sa.Column("people", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            f"(attending AND people BETWEEN 1 AND {MAX_POLL_PEOPLE}) OR (NOT attending AND people = 0)",
            name="ck_volunteer_poll_answers_people",
        ),
    )
    op.create_table(
        "volunteer_meal_notes",
        sa.Column("volunteer_id", sa.String(64), sa.ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("edition_id", sa.String(100), sa.ForeignKey("editions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("note", sa.String(500), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def _downgrade_meal_poll() -> None:
    op.drop_table("volunteer_meal_notes")
    op.drop_table("volunteer_poll_answers")
    op.drop_index("ix_edition_poll_options_question_id", table_name="edition_poll_options")
    op.drop_constraint("fk_edition_poll_options_question_id", "edition_poll_options", type_="foreignkey")
    op.drop_column("edition_poll_options", "question_id")
    op.drop_constraint("ck_edition_poll_options_label_nl", "edition_poll_options", type_="check")
    op.drop_column("edition_poll_options", "sort_order")
    op.drop_column("edition_poll_options", "dietary_tags")
    op.drop_column("edition_poll_options", "label_en")
    op.drop_column("edition_poll_options", "label_fr")
    op.alter_column("edition_poll_options", "label_nl", new_column_name="label")
    op.drop_table("edition_poll_questions")


def _upgrade_poll_kinds() -> None:
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


def _downgrade_poll_kinds() -> None:
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


def _upgrade_order_questions() -> None:
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


def _downgrade_order_questions() -> None:
    op.drop_table("registration_order_answers")
    op.drop_table("event_order_options")
    op.drop_table("event_order_questions")


def upgrade() -> None:
    _upgrade_meal_poll()
    _upgrade_poll_kinds()
    _upgrade_order_questions()
    _copy_original_into_dutch()
    _carry_pending_changes()
    for table, old_name, _old_sql, _new_name, _new_sql in CONSTRAINTS:
        op.drop_constraint(old_name, table, type_="check")
    for table, column, _kind in COLUMNS:
        op.drop_column(table, column)
    for table, _old_name, _old_sql, new_name, new_sql in CONSTRAINTS:
        op.create_check_constraint(new_name, table, new_sql)


def downgrade() -> None:
    _downgrade_order_questions()
    _downgrade_poll_kinds()
    for table, _old_name, _old_sql, new_name, _new_sql in CONSTRAINTS:
        op.drop_constraint(new_name, table, type_="check")
    for table, column, kind in COLUMNS:
        if kind == "required":
            op.add_column(table, sa.Column(column, sa.String(2), nullable=False, server_default="nl"))
            op.alter_column(table, column, server_default=None)
        else:
            op.add_column(table, sa.Column(column, sa.String(2), nullable=True))
            prefix = column.removesuffix("_language")
            op.execute(f"UPDATE {table} SET {column} = 'nl' WHERE length(trim({prefix}_nl)) > 0")
    for table, old_name, old_sql, _new_name, _new_sql in CONSTRAINTS:
        op.create_check_constraint(old_name, table, old_sql)
    _downgrade_meal_poll()
