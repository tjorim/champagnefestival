"""Translate content into nl/fr/en with an original language; categories become data (#1222).

Everything an administrator writes for visitors follows the organisation description
pattern: an original language that must have text, optional translations and a
fallback to the original. Existing rows are Dutch (the one language they were written
in), so they migrate as ``nl``.

* Events: ``title``/``description`` become ``title_*``/``description_*``.
* Event and product categories become entities (``event_categories``,
  ``product_categories``) with a label per language; ``events.category`` and
  ``products.category`` reference their keys. Values already in use that are not
  default categories become categories of their own and are logged for review.
* FAQ items, announcements, composed messages, policies and products get the same
  original-language columns (``policies.required_locales`` is dropped).
* The volunteer meal poll drops its kinds and records a quantity per pick.

Revision ID: 006
Revises: 005
"""

import logging
import re

import sqlalchemy as sa

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

# --- Events and event categories ------------------------------------------------------

# Key, sort order and label per language (nl, fr, en) of the categories every
# installation starts with: the ones the schedule always knew plus a few more.
# English is their original language, like anything created through the API.
DEFAULT_CATEGORIES = (
    ("tasting", 10, "Degustatie", "Dégustation", "Tasting"),
    ("vip", 20, "VIP Evenement", "Événement VIP", "VIP Event"),
    ("party", 30, "Feest", "Soirée", "Party"),
    ("breakfast", 40, "Ontbijt", "Petit-déjeuner", "Breakfast"),
    ("exchange", 50, "Ruilbeurs", "Échange", "Exchange"),
    ("general", 60, "Algemeen", "Général", "General"),
    ("ceremony", 70, "Plechtigheid", "Cérémonie", "Ceremony"),
    ("social", 80, "Ontmoeting", "Rencontre", "Social"),
    ("other", 90, "Overig", "Autre", "Other"),
)

TITLE_CHECK = (
    "((title_language = 'nl' AND length(trim(title_nl)) > 0) OR "
    "(title_language = 'fr' AND length(trim(title_fr)) > 0) OR "
    "(title_language = 'en' AND length(trim(title_en)) > 0)) IS TRUE"
)
LABEL_CHECK = (
    "((label_language = 'nl' AND length(trim(label_nl)) > 0) OR "
    "(label_language = 'fr' AND length(trim(label_fr)) > 0) OR "
    "(label_language = 'en' AND length(trim(label_en)) > 0)) IS TRUE"
)
DESCRIPTION_CHECK = (
    "(description_language IS NULL AND description_nl IS NULL AND description_fr IS NULL "
    "AND description_en IS NULL) OR "
    "(description_language IS NOT NULL AND ("
    "(description_language = 'nl' AND length(trim(description_nl)) > 0) OR "
    "(description_language = 'fr' AND length(trim(description_fr)) > 0) OR "
    "(description_language = 'en' AND length(trim(description_en)) > 0)) IS TRUE)"
)


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]+", "-", value.strip().lower()).strip("-_")[:50]
    return slug if re.match(r"[a-z]", slug) else "other"


def _create_categories(connection) -> None:
    """Create the category table and one category per value events already use.

    A value that is not a default category is kept as a category of its own
    (key derived from the text, the text itself as Dutch label) instead of
    being folded into "other", so no event loses its category. Those are logged
    so an admin can tidy them up.
    """
    op.create_table(
        "event_categories",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("label_language", sa.String(2), nullable=False),
        sa.Column("label_nl", sa.String(100), nullable=True),
        sa.Column("label_fr", sa.String(100), nullable=True),
        sa.Column("label_en", sa.String(100), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(LABEL_CHECK, name="ck_event_categories_label_original"),
    )
    categories = sa.table(
        "event_categories",
        sa.column("key", sa.String),
        sa.column("label_language", sa.String),
        sa.column("label_nl", sa.String),
        sa.column("label_fr", sa.String),
        sa.column("label_en", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    known = {key for key, *_ in DEFAULT_CATEGORIES}
    op.bulk_insert(
        categories,
        [
            {"key": key, "label_language": "en", "label_nl": nl, "label_fr": fr, "label_en": en, "sort_order": order}
            for key, order, nl, fr, en in DEFAULT_CATEGORIES
        ],
    )

    created: dict[str, str] = {}
    sort_order = 100
    for (value,) in connection.execute(sa.text("SELECT DISTINCT category FROM events ORDER BY category")).all():
        key = _slug(value)
        if key not in known and key not in created:
            created[key] = value.strip()[:100] or key
            op.bulk_insert(
                categories,
                [{"key": key, "label_language": "nl", "label_nl": created[key], "sort_order": sort_order}],
            )
            sort_order += 10
            logger.warning("Event category %r kept as its own category %r - review its labels.", value, key)
        connection.execute(
            sa.text("UPDATE events SET category = :key WHERE category = :value AND category <> :key"),
            {"key": key, "value": value},
        )


def _upgrade_events() -> None:
    connection = op.get_bind()

    op.add_column("events", sa.Column("title_language", sa.String(2), nullable=True))
    for field, kind in (("title", sa.String(200)), ("description", sa.Text())):
        for language in ("nl", "fr", "en"):
            op.add_column("events", sa.Column(f"{field}_{language}", kind, nullable=True))
    op.add_column("events", sa.Column("description_language", sa.String(2), nullable=True))

    # A title is required, so a blank legacy one falls back to the event id
    # instead of failing the constraint.
    connection.execute(
        sa.text(
            "UPDATE events SET title_language = 'nl', "
            "title_nl = CASE WHEN length(trim(title)) > 0 THEN title ELSE id END, "
            "description_language = CASE WHEN length(trim(description)) > 0 THEN 'nl' END, "
            "description_nl = CASE WHEN length(trim(description)) > 0 THEN description END"
        )
    )
    op.alter_column("events", "title_language", nullable=False)
    op.drop_column("events", "title")
    op.drop_column("events", "description")

    _create_categories(connection)

    op.create_check_constraint("ck_events_title_original", "events", TITLE_CHECK)
    op.create_check_constraint("ck_events_description_original", "events", DESCRIPTION_CHECK)
    op.create_foreign_key(
        "fk_events_category", "events", "event_categories", ["category"], ["key"], ondelete="RESTRICT"
    )
    op.create_index("ix_events_category", "events", ["category"])


def _downgrade_events() -> None:
    connection = op.get_bind()

    op.drop_index("ix_events_category", table_name="events")
    op.drop_constraint("fk_events_category", "events", type_="foreignkey")
    op.drop_constraint("ck_events_description_original", "events", type_="check")
    op.drop_constraint("ck_events_title_original", "events", type_="check")

    op.add_column("events", sa.Column("title", sa.String(200), nullable=True))
    op.add_column("events", sa.Column("description", sa.Text(), nullable=True))
    # Only the original language survives a downgrade; translations are dropped.
    connection.execute(
        sa.text(
            "UPDATE events SET "
            "title = CASE title_language WHEN 'fr' THEN title_fr WHEN 'en' THEN title_en ELSE title_nl END, "
            "description = coalesce(CASE description_language "
            "WHEN 'fr' THEN description_fr WHEN 'en' THEN description_en ELSE description_nl END, '')"
        )
    )
    op.alter_column("events", "title", nullable=False)
    op.alter_column("events", "description", nullable=False, server_default="")

    for column in (
        "description_language",
        "description_en",
        "description_fr",
        "description_nl",
        "title_en",
        "title_fr",
        "title_nl",
        "title_language",
    ):
        op.drop_column("events", column)
    op.drop_table("event_categories")


# --- The remaining content ------------------------------------------------------------


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


# --- Products ---------------------------------------------------------------------

PRODUCT_NAME_CHECK = "(" + _original("name_language", "length(trim(name_{lang})) > 0") + ")"
PRODUCT_DESCRIPTION_CHECK = (
    "(description_language IS NULL AND description_nl IS NULL AND description_fr IS NULL AND description_en IS NULL) OR "
    "(description_language IS NOT NULL AND "
    + _original("description_language", "length(trim(description_{lang})) > 0")
    + ")"
)


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


def _downgrade_products() -> None:
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


# --- Meal poll --------------------------------------------------------------------

MAX_POLL_QUANTITY = 20


def _upgrade_poll() -> None:
    """Volunteers pick a quantity of each option instead of one dish, one soup and any
    number of dinners. Everything is delivered on the same day, so options lose their kind
    (existing picks become a quantity of one)."""
    op.add_column("volunteer_poll_selections", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    op.alter_column("volunteer_poll_selections", "quantity", server_default=None)
    op.create_check_constraint(
        "ck_volunteer_poll_selections_quantity",
        "volunteer_poll_selections",
        f"quantity BETWEEN 1 AND {MAX_POLL_QUANTITY}",
    )
    op.drop_constraint("ck_poll_option_kind", "edition_poll_options", type_="check")
    op.drop_column("edition_poll_options", "kind")


def _downgrade_poll() -> None:
    # The kind is lost; "dinner" is the one that allows any number of picks, so every
    # restored selection stays valid. Quantities collapse to a single pick.
    op.add_column("edition_poll_options", sa.Column("kind", sa.String(10), nullable=False, server_default="dinner"))
    op.alter_column("edition_poll_options", "kind", server_default=None)
    op.create_check_constraint("ck_poll_option_kind", "edition_poll_options", "kind IN ('dish', 'soup', 'dinner')")
    op.drop_constraint("ck_volunteer_poll_selections_quantity", "volunteer_poll_selections", type_="check")
    op.drop_column("volunteer_poll_selections", "quantity")


# --- Product categories -----------------------------------------------------------

# Key, sort order and label per language (nl, fr, en). English is the original
# language, like anything created through the API.
DEFAULT_PRODUCT_CATEGORIES = (
    ("champagne", 10, "Champagne", "Champagne", "Champagne"),
    ("food", 20, "Eten", "Nourriture", "Food"),
    ("other", 30, "Anders", "Autre", "Other"),
)
PRODUCT_CATEGORY_CHECK = _original("label_language", "length(trim(label_{lang})) > 0")


def _upgrade_product_categories() -> None:
    """Make the product category an entity, like event categories in 006.

    A value products already use that is not a default category is kept as a
    category of its own (the text as its Dutch label) rather than folded into
    "other", and logged so an admin can tidy it up.
    """
    connection = op.get_bind()
    op.create_table(
        "product_categories",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("label_language", sa.String(2), nullable=False),
        sa.Column("label_nl", sa.String(100), nullable=True),
        sa.Column("label_fr", sa.String(100), nullable=True),
        sa.Column("label_en", sa.String(100), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(PRODUCT_CATEGORY_CHECK, name="ck_product_categories_label_original"),
    )
    categories = sa.table(
        "product_categories",
        sa.column("key", sa.String),
        sa.column("label_language", sa.String),
        sa.column("label_nl", sa.String),
        sa.column("label_fr", sa.String),
        sa.column("label_en", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    known = {key for key, *_ in DEFAULT_PRODUCT_CATEGORIES}
    op.bulk_insert(
        categories,
        [
            {"key": key, "label_language": "en", "label_nl": nl, "label_fr": fr, "label_en": en, "sort_order": order}
            for key, order, nl, fr, en in DEFAULT_PRODUCT_CATEGORIES
        ],
    )
    created: set[str] = set()
    sort_order = 100
    for (value,) in connection.execute(sa.text("SELECT DISTINCT category FROM products ORDER BY category")).all():
        key = _slug(value)
        if key not in known and key not in created:
            created.add(key)
            op.bulk_insert(
                categories,
                [
                    {
                        "key": key,
                        "label_language": "nl",
                        "label_nl": value.strip()[:100] or key,
                        "sort_order": sort_order,
                    }
                ],
            )
            sort_order += 10
            logger.warning("Product category %r kept as its own category %r - review its labels.", value, key)
        connection.execute(
            sa.text("UPDATE products SET category = :key WHERE category = :value AND category <> :key"),
            {"key": key, "value": value},
        )
    op.alter_column("products", "category", existing_type=sa.String(20), type_=sa.String(50))
    op.create_foreign_key(
        "fk_products_category", "products", "product_categories", ["category"], ["key"], ondelete="RESTRICT"
    )
    op.create_index("ix_products_category", "products", ["category"])


def _downgrade_product_categories() -> None:
    op.drop_index("ix_products_category", table_name="products")
    op.drop_constraint("fk_products_category", "products", type_="foreignkey")
    # Categories added since are folded into "other" so the old 20-character column fits them.
    op.execute("UPDATE products SET category = 'other' WHERE category NOT IN ('champagne', 'food', 'other')")
    op.alter_column("products", "category", existing_type=sa.String(50), type_=sa.String(20))
    op.drop_table("product_categories")


def upgrade() -> None:
    _upgrade_events()
    _upgrade_product_categories()
    _upgrade_faq()
    _upgrade_announcements()
    _upgrade_composed_messages()
    _upgrade_policies()
    _upgrade_products()
    _upgrade_poll()


def downgrade() -> None:
    _downgrade_poll()
    _downgrade_products()
    _downgrade_policies()
    _downgrade_composed_messages()
    _downgrade_announcements()
    _downgrade_faq()
    _downgrade_product_categories()
    _downgrade_events()
