"""Translate event titles and descriptions; fix the category list (#1222).

``title``/``description`` become the original-language columns of a per-language
set (``title_nl/fr/en``, ``description_nl/fr/en``) and move to ``nl``, the owner's
default original language for events that predate translations. Categories become
an entity (``event_categories``) with labels per language; ``events.category``
references its key. Values events already use that are not default categories become
categories of their own and are logged for review.

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


def upgrade() -> None:
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


def downgrade() -> None:
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
