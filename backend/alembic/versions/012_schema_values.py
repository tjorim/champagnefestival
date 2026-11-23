"""Use domain types and remove ambiguous defaults.

Revision ID: 012
Revises: 011
"""

import sqlalchemy as sa

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None

_REQUIRED_DUTCH = {
    "event_categories": ("label_nl",),
    "product_categories": ("label_nl",),
    "events": ("title_nl",),
    "products": ("name_nl",),
    "faq_items": ("question_nl", "answer_nl"),
    "announcements": ("text_nl",),
    "composed_messages": ("title_nl", "body_nl"),
    "policies": ("title_nl",),
}
_SETTINGS_CONTACT = ("public_email", "public_phone", "facebook_url")
_TIMESTAMP_TABLES = ("signage_channels", "signage_templates", "signage_slides", "stamp_card_types")
_LENGTHS = (
    ("people", "email", 200, 320),
    ("people", "search_email", 200, 320),
    ("stamp_card_rewards", "handed_out_by", 200, 255),
)
_MONTH_KEYS = (
    "lower(trim(month)) IN ('january', 'february', 'march', 'april', 'may', 'june', 'july', "
    "'august', 'september', 'october', 'november', 'december')"
)
# Frozen here so future changes in the application do not affect replays.
_MONTH_ALIASES = {
    "januari": "january",
    "janvier": "january",
    "februari": "february",
    "février": "february",
    "maart": "march",
    "mars": "march",
    "avril": "april",
    "mei": "may",
    "mai": "may",
    "juni": "june",
    "juin": "june",
    "juli": "july",
    "juillet": "july",
    "augustus": "august",
    "août": "august",
    "oktober": "october",
    "octobre": "october",
    "novembre": "november",
    "décembre": "december",
}


def _resize_text_columns(*, upgrade: bool) -> None:
    # PostgreSQL requires the UPDATE OF email trigger to be detached while the column type changes.
    op.execute("DROP TRIGGER people_operational_search_values ON people")
    for table, column, old, new in _LENGTHS:
        op.alter_column(table, column, type_=sa.String(new if upgrade else old))
    op.execute(
        "CREATE TRIGGER people_operational_search_values "
        "BEFORE INSERT OR UPDATE OF name, email ON people "
        "FOR EACH ROW EXECUTE FUNCTION update_person_operational_search_values()"
    )


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE editions SET month = lower(trim(month))"))
    for old, new in _MONTH_ALIASES.items():
        bind.execute(sa.text("UPDATE editions SET month = :new WHERE month = :old"), {"old": old, "new": new})
    op.create_check_constraint("ck_editions_month", "editions", _MONTH_KEYS)

    for column in ("start_time", "end_time"):
        expression = f"trim({column})" if column == "start_time" else f"nullif(trim({column}), '')"
        op.alter_column("events", column, type_=sa.Time(), postgresql_using=f"({expression})::time")
        op.create_check_constraint(
            f"ck_events_{column}_minute",
            "events",
            f"extract(second from {column}) = 0 AND {column} < TIME '24:00'",
        )

    for column, low, high in (("lat", -90, 90), ("lng", -180, 180)):
        op.alter_column("venues", column, nullable=True, server_default=None)
        op.create_check_constraint(f"ck_venues_{column}", "venues", f"{column} BETWEEN {low} AND {high}")
    op.execute("UPDATE venues SET lat = NULL, lng = NULL WHERE lat = 0 AND lng = 0")

    for column in _SETTINGS_CONTACT:
        op.alter_column("app_settings", column, nullable=True, server_default=None)
        op.execute(f"UPDATE app_settings SET {column} = NULL WHERE trim({column}) = ''")
    _resize_text_columns(upgrade=True)
    for table, columns in _REQUIRED_DUTCH.items():
        for column in columns:
            op.alter_column(table, column, nullable=False)

    for table in _TIMESTAMP_TABLES:
        for column in ("created_at", "updated_at"):
            op.add_column(
                table, sa.Column(column, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
            )
            op.alter_column(table, column, server_default=None)


def downgrade() -> None:
    for table in _TIMESTAMP_TABLES:
        for column in ("updated_at", "created_at"):
            op.drop_column(table, column)

    for table, columns in _REQUIRED_DUTCH.items():
        for column in columns:
            op.alter_column(table, column, nullable=True)
    _resize_text_columns(upgrade=False)
    for column in _SETTINGS_CONTACT:
        op.execute(f"UPDATE app_settings SET {column} = '' WHERE {column} IS NULL")
        op.alter_column("app_settings", column, nullable=False, server_default="")
    for column in ("lat", "lng"):
        op.drop_constraint(f"ck_venues_{column}", "venues", type_="check")
        op.execute(f"UPDATE venues SET {column} = 0 WHERE {column} IS NULL")
        op.alter_column("venues", column, nullable=False, server_default="0.0")
    for column in ("start_time", "end_time"):
        op.drop_constraint(f"ck_events_{column}_minute", "events", type_="check")
        op.alter_column("events", column, type_=sa.String(10), postgresql_using=f"left({column}::text, 5)")
    op.drop_constraint("ck_editions_month", "editions", type_="check")
