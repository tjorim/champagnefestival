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


# --- Announcements and composed messages ----------------------------------------

ANNOUNCEMENT_TEXT_CHECK = _original("text_language", "length(trim(text_{lang})) > 0")
ANNOUNCEMENT_LINK_CHECK = "link_url IS NULL OR " + _original("text_language", "length(trim(link_label_{lang})) > 0")
COMPOSED_CHECK = _original("text_language", "length(trim(title_{lang})) > 0 AND length(trim(body_{lang})) > 0")


def _first_language(*columns: str) -> str:
    """SQL ``CASE`` naming the first language (nl, fr, en) whose column has text."""
    return (
        "CASE "
        + " ".join(
            f"WHEN length(trim({column})) > 0 THEN '{lang}'"
            for column, lang in zip(columns, ("nl", "fr", "en"), strict=True)
        )
        + " ELSE 'nl' END"
    )


def _upgrade_announcements() -> None:
    op.add_column("announcements", sa.Column("text_language", sa.String(2), nullable=True))
    op.execute(f"UPDATE announcements SET text_language = {_first_language('text_nl', 'text_fr', 'text_en')}")
    # An announcement that never had any text (an empty inactive draft) gets a placeholder so the
    # original-language constraint holds; a link without a label in that language borrows another one.
    op.execute(
        "UPDATE announcements SET text_nl = '(no text)' WHERE coalesce(length(trim(text_nl)), 0) = 0 "
        "AND coalesce(length(trim(text_fr)), 0) = 0 AND coalesce(length(trim(text_en)), 0) = 0"
    )
    for lang in ("nl", "fr", "en"):
        others = ", ".join(f"link_label_{other}" for other in ("nl", "fr", "en") if other != lang)
        op.execute(
            f"UPDATE announcements SET link_label_{lang} = coalesce(nullif(trim(link_label_{lang}), ''), {others}) "
            f"WHERE text_language = '{lang}' AND link_url IS NOT NULL"
        )
    op.execute(
        "UPDATE announcements SET link_url = NULL WHERE link_url IS NOT NULL AND NOT ("
        + ANNOUNCEMENT_LINK_CHECK.replace("link_url IS NULL OR ", "")
        + ")"
    )
    op.alter_column("announcements", "text_language", nullable=False)
    op.create_check_constraint("ck_announcements_text_original", "announcements", ANNOUNCEMENT_TEXT_CHECK)
    op.create_check_constraint("ck_announcements_link_label_original", "announcements", ANNOUNCEMENT_LINK_CHECK)


def _downgrade_announcements() -> None:
    op.drop_constraint("ck_announcements_link_label_original", "announcements", type_="check")
    op.drop_constraint("ck_announcements_text_original", "announcements", type_="check")
    op.drop_column("announcements", "text_language")


def _upgrade_composed_messages() -> None:
    op.add_column("composed_messages", sa.Column("text_language", sa.String(2), nullable=True))
    # The first language with a complete title/body pair is the original (messages predate the field).
    op.execute(
        "UPDATE composed_messages SET text_language = CASE "
        + " ".join(
            f"WHEN length(trim(title_{lang})) > 0 AND length(trim(body_{lang})) > 0 THEN '{lang}'"
            for lang in ("nl", "fr", "en")
        )
        + " ELSE 'nl' END"
    )
    # A draft without any complete pair cannot satisfy the constraint; give it a placeholder pair.
    op.execute(
        "UPDATE composed_messages SET title_nl = coalesce(nullif(trim(title_nl), ''), '(no title)'), "
        "body_nl = coalesce(nullif(trim(body_nl), ''), '(no text)') "
        "WHERE text_language = 'nl' AND NOT (" + COMPOSED_CHECK + ")"
    )
    op.alter_column("composed_messages", "text_language", nullable=False)
    op.create_check_constraint("ck_composed_messages_original", "composed_messages", COMPOSED_CHECK)


def _downgrade_composed_messages() -> None:
    op.drop_constraint("ck_composed_messages_original", "composed_messages", type_="check")
    op.drop_column("composed_messages", "text_language")


# --- Policies --------------------------------------------------------------------

POLICY_TITLE_CHECK = _original("title_language", "length(trim(title_{lang})) > 0")
POLICY_VERSION_CHECK = "status = 'draft' OR " + _original("content_language", "length(trim(content_{lang})) > 0")


def _upgrade_policies() -> None:
    # Titles: Dutch was required, so Dutch is the original.
    op.add_column("policies", sa.Column("title_language", sa.String(2), nullable=True))
    op.execute("UPDATE policies SET title_language = 'nl'")
    op.alter_column("policies", "title_language", nullable=False)
    op.alter_column("policies", "title_nl", nullable=True)
    op.create_check_constraint("ck_policies_title_original", "policies", POLICY_TITLE_CHECK)
    # `required_locales` forced every language to be filled before publishing. Publishing now only
    # needs the original language; the other languages fall back to it.
    op.drop_column("policies", "required_locales")

    op.add_column("policy_versions", sa.Column("content_language", sa.String(2), nullable=True))
    op.execute(
        f"UPDATE policy_versions SET content_language = {_first_language('content_nl', 'content_fr', 'content_en')}"
    )
    op.execute(
        "UPDATE policy_versions SET content_nl = '(no content)' "
        "WHERE status <> 'draft' AND coalesce(length(trim(content_nl)), 0) = 0 AND content_language = 'nl'"
    )
    op.alter_column("policy_versions", "content_language", nullable=False)
    op.create_check_constraint("ck_policy_versions_original", "policy_versions", POLICY_VERSION_CHECK)


def _downgrade_policies() -> None:
    op.drop_constraint("ck_policy_versions_original", "policy_versions", type_="check")
    op.drop_column("policy_versions", "content_language")
    op.add_column("policies", sa.Column("required_locales", sa.String(20), nullable=False, server_default="nl,en,fr"))
    op.drop_constraint("ck_policies_title_original", "policies", type_="check")
    op.execute(
        "UPDATE policies SET title_nl = coalesce(title_nl, CASE title_language WHEN 'fr' THEN title_fr ELSE title_en END)"
    )
    op.alter_column("policies", "title_nl", nullable=False)
    op.drop_column("policies", "title_language")


# --- Products and poll options ----------------------------------------------------

PRODUCT_NAME_CHECK = "(" + _original("name_language", "length(trim(name_{lang})) > 0") + ")"
PRODUCT_DESCRIPTION_CHECK = (
    "(description_language IS NULL AND description_nl IS NULL AND description_fr IS NULL AND description_en IS NULL) OR "
    "(description_language IS NOT NULL AND "
    + _original("description_language", "length(trim(description_{lang})) > 0")
    + ")"
)
POLL_LABEL_CHECK = _original("label_language", "length(trim(label_{lang})) > 0")


def _upgrade_products() -> None:
    for field, length in (("name", 200), ("description", 300)):
        for lang in ("nl", "fr", "en"):
            op.add_column("products", sa.Column(f"{field}_{lang}", sa.String(length), nullable=True))
    op.add_column("products", sa.Column("name_language", sa.String(2), nullable=True))
    op.add_column("products", sa.Column("description_language", sa.String(2), nullable=True))
    op.execute(
        "UPDATE products SET name_language = 'nl', "
        "name_nl = CASE WHEN length(trim(name)) > 0 THEN name ELSE id END, "
        "description_language = CASE WHEN length(trim(description)) > 0 THEN 'nl' END, "
        "description_nl = CASE WHEN length(trim(description)) > 0 THEN description END"
    )
    op.alter_column("products", "name_language", nullable=False)
    op.drop_column("products", "name")
    op.drop_column("products", "description")
    op.create_check_constraint("ck_products_name_original", "products", PRODUCT_NAME_CHECK)
    op.create_check_constraint("ck_products_description_original", "products", PRODUCT_DESCRIPTION_CHECK)

    op.add_column("edition_poll_options", sa.Column("label_language", sa.String(2), nullable=True))
    for lang in ("nl", "fr", "en"):
        op.add_column("edition_poll_options", sa.Column(f"label_{lang}", sa.String(200), nullable=True))
    op.execute(
        "UPDATE edition_poll_options SET label_language = 'nl', "
        "label_nl = CASE WHEN length(trim(label)) > 0 THEN label ELSE id END"
    )
    op.alter_column("edition_poll_options", "label_language", nullable=False)
    op.drop_column("edition_poll_options", "label")
    op.create_check_constraint("ck_poll_option_label_original", "edition_poll_options", POLL_LABEL_CHECK)


def _downgrade_products() -> None:
    op.drop_constraint("ck_poll_option_label_original", "edition_poll_options", type_="check")
    op.add_column("edition_poll_options", sa.Column("label", sa.String(200), nullable=True))
    op.execute(
        "UPDATE edition_poll_options SET label = CASE label_language "
        "WHEN 'fr' THEN label_fr WHEN 'en' THEN label_en ELSE label_nl END"
    )
    op.alter_column("edition_poll_options", "label", nullable=False)
    for column in ("label_en", "label_fr", "label_nl", "label_language"):
        op.drop_column("edition_poll_options", column)

    op.drop_constraint("ck_products_description_original", "products", type_="check")
    op.drop_constraint("ck_products_name_original", "products", type_="check")
    op.add_column("products", sa.Column("name", sa.String(200), nullable=True))
    op.add_column("products", sa.Column("description", sa.String(300), nullable=True))
    op.execute(
        "UPDATE products SET "
        "name = CASE name_language WHEN 'fr' THEN name_fr WHEN 'en' THEN name_en ELSE name_nl END, "
        "description = coalesce(CASE description_language "
        "WHEN 'fr' THEN description_fr WHEN 'en' THEN description_en ELSE description_nl END, '')"
    )
    op.alter_column("products", "name", nullable=False)
    op.alter_column("products", "description", nullable=False, server_default="")
    for column in (
        "description_language",
        "description_en",
        "description_fr",
        "description_nl",
        "name_language",
        "name_en",
        "name_fr",
        "name_nl",
    ):
        op.drop_column("products", column)


def upgrade() -> None:
    _upgrade_faq()
    _upgrade_announcements()
    _upgrade_composed_messages()
    _upgrade_policies()
    _upgrade_products()


def downgrade() -> None:
    _downgrade_products()
    _downgrade_policies()
    _downgrade_composed_messages()
    _downgrade_announcements()
    _downgrade_faq()
