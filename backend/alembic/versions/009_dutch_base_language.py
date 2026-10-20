"""Dutch is the one required language of translated content; the original-language flag goes.

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

Revision ID: 009
Revises: 008
"""

import json
import logging

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


def upgrade() -> None:
    _copy_original_into_dutch()
    _carry_pending_changes()
    for table, old_name, _old_sql, _new_name, _new_sql in CONSTRAINTS:
        op.drop_constraint(old_name, table, type_="check")
    for table, column, _kind in COLUMNS:
        op.drop_column(table, column)
    for table, _old_name, _old_sql, new_name, new_sql in CONSTRAINTS:
        op.create_check_constraint(new_name, table, new_sql)


def downgrade() -> None:
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
