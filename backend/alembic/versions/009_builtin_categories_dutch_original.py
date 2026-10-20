"""Make Dutch the original language of the built-in event and product categories.

Migration 006 seeded the default categories with English as their original language,
because English was then the API default for anything an administrator created. Dutch is
the default now (the vzw and the festival are in Flanders), and the original language is
the one text that cannot be cleared, so an English original let an administrator blank the
Dutch label of a built-in category.

Only a category still carrying exactly the labels 006 seeded is changed. One whose label an
administrator has edited keeps its original language, and so does any category created
since, whatever language it chose. All three labels are filled in, so what visitors see is
unchanged; only the fallback changes.

Revision ID: 009
Revises: 008
"""

import sqlalchemy as sa

from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None

# Key, Dutch, French and English label exactly as migration 006 seeded them.
EVENT_CATEGORIES = (
    ("tasting", "Degustatie", "Dégustation", "Tasting"),
    ("vip", "VIP Evenement", "Événement VIP", "VIP Event"),
    ("party", "Feest", "Soirée", "Party"),
    ("breakfast", "Ontbijt", "Petit-déjeuner", "Breakfast"),
    ("exchange", "Ruilbeurs", "Échange", "Exchange"),
    ("general", "Algemeen", "Général", "General"),
    ("ceremony", "Plechtigheid", "Cérémonie", "Ceremony"),
    ("social", "Ontmoeting", "Rencontre", "Social"),
    ("other", "Overig", "Autre", "Other"),
)
PRODUCT_CATEGORIES = (
    ("champagne", "Champagne", "Champagne", "Champagne"),
    ("food", "Eten", "Nourriture", "Food"),
    ("other", "Anders", "Autre", "Other"),
)


def _switch(table: str, categories: tuple[tuple[str, str, str, str], ...], *, source: str, target: str) -> None:
    statement = sa.text(
        f"UPDATE {table} SET label_language = :target "
        "WHERE key = :key AND label_language = :source "
        "AND label_nl = :nl AND label_fr = :fr AND label_en = :en"
    )
    for key, nl, fr, en in categories:
        op.get_bind().execute(statement, {"key": key, "nl": nl, "fr": fr, "en": en, "source": source, "target": target})


def upgrade() -> None:
    _switch("event_categories", EVENT_CATEGORIES, source="en", target="nl")
    _switch("product_categories", PRODUCT_CATEGORIES, source="en", target="nl")


def downgrade() -> None:
    _switch("product_categories", PRODUCT_CATEGORIES, source="nl", target="en")
    _switch("event_categories", EVENT_CATEGORIES, source="nl", target="en")
