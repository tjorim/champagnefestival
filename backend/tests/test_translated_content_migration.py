"""Migration 007: the remaining content keeps its text in the original language; product categories become data."""

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

NOW = "2026-01-01T00:00:00+00"


def _insert(connection, table: str, **values) -> None:
    columns = ", ".join(values)
    placeholders = ", ".join(f":{name}" for name in values)
    connection.execute(text(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"), values)


def test_content_and_product_categories_survive_the_upgrade_and_downgrade(monkeypatch, caplog):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_translated_content_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "006")
        with database.begin() as connection:
            _insert(connection, "venues", id="venue", name="Venue")
            _insert(connection, "editions", id="edition", year=2026, month="October", venue_id="venue")
            _insert(
                connection,
                "events",
                id="event",
                edition_id="edition",
                title_language="nl",
                title_nl="Proeverij",
                date="2026-10-01",
                start_time="10:00",
                category="tasting",
            )
            _insert(
                connection, "faq_items", id="faq", question_nl="Vraag?", answer_nl="Antwoord.", sort_order=0,
                active=True, created_at=NOW, updated_at=NOW,
            )  # fmt: skip
            for order, (announcement_id, nl, en, link) in enumerate(
                (
                    ("announcement", "Nieuws", "News", None),
                    ("english-only", None, "Only English", None),
                    ("empty", None, None, None),
                    ("linked", "Lees meer", None, "https://example.com"),
                ),
                start=100,
            ):
                _insert(
                    connection, "announcements", id=announcement_id, text_nl=nl, text_en=en, level="info",
                    active=False, sort_order=order, link_url=link, link_label_nl=nl if link else None,
                    created_at=NOW, updated_at=NOW,
                )  # fmt: skip
            _insert(
                connection, "composed_messages", id="message", title_nl="Titel", body_nl="Tekst", level="info",
                channels="[]", state="draft", created_at=NOW, updated_at=NOW,
            )  # fmt: skip
            _insert(
                connection,
                "policies",
                key="house-rules",
                title_nl="Huisregels",
                required_locales="nl,en,fr",
                created_at=NOW,
            )
            _insert(
                connection, "policy_versions", id="version", policy_key="house-rules", version_number=1,
                status="published", content_nl="Inhoud", created_at=NOW, created_by="admin", updated_at=NOW,
            )  # fmt: skip
            for product_id, name, description, category in (
                ("champagne", "Fles", "Gekoeld", "champagne"),
                ("blank", "   ", "", "food"),
                ("custom", "Bon", "", "voucher"),
            ):
                _insert(
                    connection, "products", id=product_id, event_id="event", name=name, description=description,
                    price=10, category=category, unit="item", purchasable=True, required=False,
                    created_at=NOW, updated_at=NOW,
                )  # fmt: skip
            _insert(
                connection, "edition_poll_options", id="option", edition_id="edition", kind="dish", label="Stoofvlees",
                created_at=NOW, updated_at=NOW,
            )  # fmt: skip

        with caplog.at_level(logging.WARNING, logger="alembic.runtime.migration"):
            command.upgrade(config, "007")
        warnings = [r.getMessage() for r in caplog.records if "Product category" in r.getMessage()]
        assert len(warnings) == 1
        assert "'voucher'" in warnings[0]

        with database.begin() as connection:

            def one(sql: str):
                return connection.execute(text(sql)).one()

            faq = one("SELECT text_language, question_nl, answer_nl, question_en FROM faq_items")
            assert tuple(faq) == ("nl", "Vraag?", "Antwoord.", None)

            announcements = {
                row.id: row
                for row in connection.execute(
                    text("SELECT id, text_language, text_nl, text_en, link_url FROM announcements")
                )
            }
            assert (announcements["announcement"].text_language, announcements["announcement"].text_nl) == (
                "nl",
                "Nieuws",
            )
            # The first language with text is the original; an announcement without any gets a placeholder.
            assert (announcements["english-only"].text_language, announcements["english-only"].text_en) == (
                "en",
                "Only English",
            )
            assert (announcements["empty"].text_language, announcements["empty"].text_nl) == ("nl", "(no text)")
            # A link keeps working because its label in the original language exists.
            assert announcements["linked"].link_url == "https://example.com"

            assert tuple(one("SELECT text_language, title_nl, body_nl FROM composed_messages")) == (
                "nl",
                "Titel",
                "Tekst",
            )
            assert tuple(one("SELECT title_language, title_nl FROM policies WHERE key = 'house-rules'")) == (
                "nl",
                "Huisregels",
            )
            assert "required_locales" not in {c["name"] for c in inspect(connection).get_columns("policies")}
            assert tuple(one("SELECT content_language, content_nl FROM policy_versions WHERE id = 'version'")) == (
                "nl",
                "Inhoud",
            )

            products = {
                row.id: row
                for row in connection.execute(
                    text("""SELECT id, name_language, name_nl, description_language, description_nl, category
                        FROM products""")
                )
            }
            assert tuple(products["champagne"])[1:] == ("nl", "Fles", "nl", "Gekoeld", "champagne")
            # A blank legacy name falls back to the id; a blank description stays absent.
            assert tuple(products["blank"])[1:] == ("nl", "blank", None, None, "food")
            assert products["custom"].category == "voucher"
            assert tuple(one("SELECT label_language, label_nl FROM edition_poll_options")) == ("nl", "Stoofvlees")

            categories = {
                row.key: row
                for row in connection.execute(
                    text("SELECT key, label_language, label_nl, label_fr, label_en, sort_order FROM product_categories")
                )
            }
        assert set(categories) == {"champagne", "food", "other", "voucher"}
        assert (categories["food"].label_nl, categories["food"].label_fr, categories["food"].label_en) == (
            "Eten",
            "Nourriture",
            "Food",
        )
        assert (categories["voucher"].label_language, categories["voucher"].label_nl) == ("nl", "voucher")

        with pytest.raises(IntegrityError, match="fk_products_category"), database.begin() as connection:
            connection.execute(text("UPDATE products SET category = 'nope' WHERE id = 'champagne'"))
        with pytest.raises(IntegrityError, match="ck_products_name_original"), database.begin() as connection:
            connection.execute(text("UPDATE products SET name_language = 'fr' WHERE id = 'champagne'"))
        with pytest.raises(IntegrityError, match="ck_poll_option_label_original"), database.begin() as connection:
            connection.execute(text("UPDATE edition_poll_options SET label_language = 'en'"))
        with pytest.raises(IntegrityError, match="ck_faq_items_original"), database.begin() as connection:
            connection.execute(text("UPDATE faq_items SET text_language = 'fr'"))
        with (
            pytest.raises(IntegrityError, match="ck_product_categories_label_original"),
            database.begin() as connection,
        ):
            connection.execute(
                text("UPDATE product_categories SET label_language = 'fr', label_fr = ' ' WHERE key = 'food'")
            )

        # The original language can change, and a downgrade keeps exactly that language.
        with database.begin() as connection:
            connection.execute(
                text("UPDATE products SET name_language = 'en', name_en = 'Bottle' WHERE id = 'champagne'")
            )
            connection.execute(text("UPDATE faq_items SET question_en = 'Question?', answer_en = 'Answer.'"))

        command.downgrade(config, "006")
        with database.begin() as connection:
            names = dict(connection.execute(text("SELECT id, name FROM products")).all())
            categories = dict(connection.execute(text("SELECT id, category FROM products")).all())
            tables = inspect(connection).get_table_names(schema=schema)
        assert names["champagne"] == "Bottle"
        assert names["blank"] == "blank"
        # A category added since folds into "other" because the old column was narrower and a fixed list.
        assert (categories["champagne"], categories["custom"]) == ("champagne", "other")
        assert "product_categories" not in tables
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
