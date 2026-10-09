"""Migration 006: events keep their text in the original language and categories join the fixed list."""

import logging
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from alembic import command


def test_event_text_and_categories_survive_the_upgrade_and_downgrade(monkeypatch, caplog):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_event_translation_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "005")
        with database.begin() as connection:
            connection.execute(text("INSERT INTO venues (id, name) VALUES ('venue', 'Venue')"))
            connection.execute(
                text("INSERT INTO editions (id, year, month, venue_id) VALUES ('edition', 2026, 'October', 'venue')")
            )
            for event_id, title, description, category in (
                ("tasting", "Proeverij", "Een avond met champagne", "tasting"),
                ("no-description", "Brunch", "", " Breakfast "),
                ("blank-title", "   ", "   ", "festival"),
                ("unknown", "Bourse", "Ruil", "community"),
            ):
                connection.execute(
                    text("""INSERT INTO events (id, edition_id, title, description, date, start_time, category)
                        VALUES (:id, 'edition', :title, :description, '2026-10-01', '10:00', :category)"""),
                    {"id": event_id, "title": title, "description": description, "category": category},
                )

        with caplog.at_level(logging.WARNING, logger="alembic.runtime.migration"):
            command.upgrade(config, "006")

        # A value that is not a default category becomes a category of its own, logged
        # for review; case and whitespace variants of a default are normalised silently.
        warnings = [
            record.getMessage() for record in caplog.records if "kept as its own category" in record.getMessage()
        ]
        assert len(warnings) == 2
        assert any("'festival'" in message for message in warnings)
        assert any("'community'" in message for message in warnings)

        with database.begin() as connection:
            rows = {
                row.id: row
                for row in connection.execute(
                    text("""SELECT id, title_language, title_nl, title_fr, title_en, description_language,
                        description_nl, description_fr, description_en, category FROM events""")
                )
            }
        tasting = rows["tasting"]
        assert (tasting.title_language, tasting.title_nl, tasting.title_fr, tasting.title_en) == (
            "nl",
            "Proeverij",
            None,
            None,
        )
        assert (tasting.description_language, tasting.description_nl) == ("nl", "Een avond met champagne")
        assert tasting.category == "tasting"
        assert (rows["no-description"].description_language, rows["no-description"].description_nl) == (None, None)
        assert rows["no-description"].category == "breakfast"
        # A blank legacy title falls back to the event id instead of breaking the constraint.
        assert rows["blank-title"].title_nl == "blank-title"
        assert rows["blank-title"].description_language is None
        assert (rows["blank-title"].category, rows["unknown"].category) == ("festival", "community")
        with database.begin() as connection:
            categories = {
                row.key: row
                for row in connection.execute(
                    text("SELECT key, label_language, label_nl, label_fr, label_en, sort_order FROM event_categories")
                )
            }
        assert set(categories) == {
            "tasting", "vip", "party", "breakfast", "exchange", "general", "ceremony", "social", "other",
            "festival", "community",
        }  # fmt: skip
        assert (categories["tasting"].label_nl, categories["tasting"].label_fr, categories["tasting"].label_en) == (
            "Degustatie",
            "Dégustation",
            "Tasting",
        )
        assert (categories["community"].label_language, categories["community"].label_nl) == ("nl", "community")
        assert categories["community"].label_fr is None

        with pytest.raises(IntegrityError, match="fk_events_category"), database.begin() as connection:
            connection.execute(text("UPDATE events SET category = 'gala' WHERE id = 'tasting'"))
        with pytest.raises(IntegrityError, match="ck_events_title_original"), database.begin() as connection:
            connection.execute(text("UPDATE events SET title_language = 'fr' WHERE id = 'tasting'"))
        with pytest.raises(IntegrityError, match="ck_events_description_original"), database.begin() as connection:
            connection.execute(text("UPDATE events SET description_language = 'en' WHERE id = 'tasting'"))

        with database.begin() as connection:
            connection.execute(
                text("""UPDATE events SET title_language = 'fr', title_fr = 'Dégustation', title_en = 'Tasting'
                    WHERE id = 'tasting'""")
            )

        command.downgrade(config, "005")
        with database.begin() as connection:
            restored = {
                row.id: (row.title, row.description)
                for row in connection.execute(text("SELECT id, title, description FROM events"))
            }
        # Only the original language survives a downgrade.
        assert restored["tasting"] == ("Dégustation", "Een avond met champagne")
        assert restored["no-description"] == ("Brunch", "")
        with database.begin() as connection:
            assert "event_categories" not in inspect(connection).get_table_names(schema=schema)
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
