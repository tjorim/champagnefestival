"""Translate event titles and descriptions; fix the category list (#1222).

``title``/``description`` become the original-language columns of a per-language
set (``title_nl/fr/en``, ``description_nl/fr/en``) and move to ``nl``, the owner's
default original language for events that predate translations. Categories become
a fixed list; unknown values are mapped to ``other`` and logged for review.

Revision ID: 006
Revises: 005
"""

import logging

import sqlalchemy as sa

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

CATEGORIES = ("tasting", "vip", "party", "breakfast", "exchange", "general", "ceremony", "social", "other")
_CATEGORY_LIST = ", ".join(f"'{value}'" for value in CATEGORIES)

TITLE_CHECK = (
    "((title_language = 'nl' AND length(trim(title_nl)) > 0) OR "
    "(title_language = 'fr' AND length(trim(title_fr)) > 0) OR "
    "(title_language = 'en' AND length(trim(title_en)) > 0)) IS TRUE"
)
DESCRIPTION_CHECK = (
    "(description_language IS NULL AND description_nl IS NULL AND description_fr IS NULL "
    "AND description_en IS NULL) OR "
    "(description_language IS NOT NULL AND ("
    "(description_language = 'nl' AND length(trim(description_nl)) > 0) OR "
    "(description_language = 'fr' AND length(trim(description_fr)) > 0) OR "
    "(description_language = 'en' AND length(trim(description_en)) > 0)) IS TRUE)"
)


def _map_categories(connection) -> None:
    # Tolerate case and surrounding whitespace ("Tasting ") before judging a value unknown.
    connection.execute(
        sa.text("UPDATE events SET category = lower(trim(category)) WHERE category <> lower(trim(category))")
    )
    unknown = connection.execute(
        sa.text(f"SELECT id, category FROM events WHERE category NOT IN ({_CATEGORY_LIST}) ORDER BY id")
    ).all()
    for event_id, category in unknown:
        logger.warning("Event %s: unknown category %r mapped to 'other' - review it.", event_id, category)
    connection.execute(sa.text(f"UPDATE events SET category = 'other' WHERE category NOT IN ({_CATEGORY_LIST})"))


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

    _map_categories(connection)

    op.create_check_constraint("ck_events_title_original", "events", TITLE_CHECK)
    op.create_check_constraint("ck_events_description_original", "events", DESCRIPTION_CHECK)
    op.create_check_constraint("ck_events_category", "events", f"category IN ({_CATEGORY_LIST})")


def downgrade() -> None:
    connection = op.get_bind()

    op.drop_constraint("ck_events_category", "events", type_="check")
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
