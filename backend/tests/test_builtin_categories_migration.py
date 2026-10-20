"""Migration 009: the built-in categories 006 seeded English-original become Dutch-original."""

import os
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from alembic import command


def test_only_untouched_built_in_categories_switch_to_a_dutch_original(monkeypatch):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_builtin_categories_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)

    def languages(table: str) -> dict[str, str]:
        with database.begin() as connection:
            return dict(connection.execute(text(f"SELECT key, label_language FROM {table}")).all())

    try:
        command.upgrade(config, "008")
        # 006 seeded every built-in category English-original.
        assert set(languages("event_categories").values()) == {"en"}
        assert set(languages("product_categories").values()) == {"en"}
        with database.begin() as connection:
            # An administrator edited one label and added categories of their own since.
            connection.execute(text("UPDATE event_categories SET label_en = 'Tasting night' WHERE key = 'tasting'"))
            connection.execute(
                text(
                    "INSERT INTO event_categories (key, label_language, label_en, sort_order) "
                    "VALUES ('gala', 'en', 'Gala', 200)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO product_categories (key, label_language, label_fr, sort_order) "
                    "VALUES ('bon', 'fr', 'Bon', 200)"
                )
            )

        command.upgrade(config, "009")
        events = languages("event_categories")
        assert events["tasting"] == "en"  # edited, so left alone
        assert events["gala"] == "en"  # created later
        assert {
            events[key] for key in ("vip", "party", "breakfast", "exchange", "general", "ceremony", "social", "other")
        } == {"nl"}
        products = languages("product_categories")
        assert {products[key] for key in ("champagne", "food", "other")} == {"nl"}
        assert products["bon"] == "fr"

        command.downgrade(config, "008")
        assert languages("event_categories")["vip"] == "en"
        assert {languages("product_categories")[key] for key in ("champagne", "food", "other")} == {"en"}
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
