"""Migration 009: Dutch becomes the one required language and the original-language flag goes."""

import json
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
from tests.helpers import requires_postgres

NOW = "2026-01-01T00:00:00+00"

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def _insert(connection, table: str, **values) -> None:
    columns = ", ".join(values)
    placeholders = ", ".join(f":{name}" for name in values)
    connection.execute(text(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"), values)


def test_content_keeps_its_text_and_dutch_becomes_required(monkeypatch, caplog):
    url = make_url(
        os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_champagne")
    ).set(drivername="postgresql+psycopg")
    admin = create_engine(url)
    schema = f"test_dutch_base_language_migration_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "008")
        with database.begin() as connection:
            _insert(connection, "venues", id="venue", name="Venue")
            _insert(
                connection, "editions", id="edition", year=2026, month="October", venue_id="venue", sponsor_tiers="{}"
            )
            for event_id, language, nl, en, description_language, description_en in (
                ("dutch", "nl", "Proeverij", "Tasting", None, None),
                ("english", "en", None, "Dinner", "en", "A dinner"),
                ("blank-dutch", "en", "  ", "Gala", None, None),
            ):
                _insert(
                    connection, "events", id=event_id, edition_id="edition", title_language=language, title_nl=nl,
                    title_en=en, description_language=description_language, description_en=description_en,
                    date="2026-10-01", start_time="10:00", category="tasting",
                )  # fmt: skip
            _insert(
                connection, "products", id="product", event_id="english", name_language="en", name_en="Bottle",
                price=10, category="champagne", unit="item", purchasable=True, required=False,
                created_at=NOW, updated_at=NOW,
            )  # fmt: skip
            _insert(
                connection, "faq_items", id="faq", text_language="fr", question_fr="Question ?", answer_fr="Réponse.",
                question_nl="Vraag?", sort_order=0, active=True, created_at=NOW, updated_at=NOW,
            )  # fmt: skip
            _insert(
                connection, "announcements", id="announcement", text_language="en", text_en="News", level="info",
                active=False, sort_order=0, link_url="https://example.com", link_label_en="Read more",
                created_at=NOW, updated_at=NOW,
            )  # fmt: skip
            _insert(
                connection, "composed_messages", id="message", text_language="fr", title_fr="Titre", body_fr="Texte",
                level="info", channels="[]", state="draft", created_at=NOW, updated_at=NOW,
            )  # fmt: skip
            _insert(connection, "policies", key="rules", title_language="en", title_en="Rules", created_at=NOW)
            for version_id, number, status, language, nl, en in (
                ("published", 1, "published", "en", None, "Content"),
                ("draft", 2, "draft", "en", None, None),
            ):
                _insert(
                    connection, "policy_versions", id=version_id, policy_key="rules", version_number=number,
                    status=status, content_language=language, content_nl=nl, content_en=en, created_at=NOW,
                    created_by="admin", updated_at=NOW,
                )  # fmt: skip
            connection.execute(
                text("UPDATE event_categories SET label_language = 'en', label_nl = NULL WHERE key = 'other'")
            )
            organization_id = connection.execute(
                text(
                    "INSERT INTO organizations (name, image, website, active, type, description_language, "
                    "description_en, created_at, updated_at) VALUES ('Producer', '', '', true, 'producer', 'en', "
                    "'About us', :now, :now) RETURNING id"
                ),
                {"now": NOW},
            ).scalar_one()
            _insert(
                connection, "organization_changes", id="change", organization_id=organization_id,
                submitted_by="owner", submitted_values=json.dumps({"description_language": "fr", "description_fr": "Nous"}),
                proposed=json.dumps({"description_language": "fr", "description_fr": "Nous", "website": "https://a.example"}),
                superseded_fields="[]", status="pending", created_at=NOW,
            )  # fmt: skip

        with database.begin() as connection:
            bare_id = connection.execute(
                text(
                    "INSERT INTO organizations (name, image, website, active, type, created_at, updated_at) "
                    "VALUES ('Bare', '', '', true, 'producer', :now, :now) RETURNING id"
                ),
                {"now": NOW},
            ).scalar_one()
            _insert(
                connection, "organization_changes", id="bare", organization_id=bare_id, submitted_by="owner",
                submitted_values=json.dumps({"description_language": "fr", "description_fr": "Nous"}),
                proposed=json.dumps({"description_language": "fr", "description_fr": "Nous"}),
                superseded_fields="[]", status="pending", created_at=NOW,
            )  # fmt: skip

        with caplog.at_level(logging.WARNING, logger="alembic.runtime.migration"):
            command.upgrade(config, "009")
        copied = [r.getMessage() for r in caplog.records if "copied into" in r.getMessage()]
        assert any(message.startswith("events: 2 row(s)") for message in copied)

        inspector = inspect(database)
        for table, column in (
            ("events", "title_language"),
            ("events", "description_language"),
            ("products", "name_language"),
            ("faq_items", "text_language"),
            ("policy_versions", "content_language"),
            ("organizations", "description_language"),
        ):
            assert column not in {c["name"] for c in inspector.get_columns(table)}

        with database.begin() as connection:

            def row(sql: str):
                return connection.execute(text(sql)).one()

            events = {
                r.id: r for r in connection.execute(text("SELECT id, title_nl, title_en, description_nl FROM events"))
            }
            assert (events["dutch"].title_nl, events["dutch"].title_en) == ("Proeverij", "Tasting")
            assert (events["english"].title_nl, events["english"].description_nl) == ("Dinner", "A dinner")
            assert events["blank-dutch"].title_nl == "Gala"
            assert tuple(row("SELECT name_nl, name_en FROM products")) == ("Bottle", "Bottle")
            assert tuple(row("SELECT question_nl, answer_nl FROM faq_items")) == ("Vraag?", "Réponse.")
            assert tuple(row("SELECT text_nl, link_label_nl FROM announcements")) == ("News", "Read more")
            assert tuple(row("SELECT title_nl, body_nl FROM composed_messages")) == ("Titre", "Texte")
            assert row("SELECT title_nl FROM policies WHERE key = 'rules'").title_nl == "Rules"
            assert row("SELECT content_nl FROM policy_versions WHERE id = 'published'").content_nl == "Content"
            assert row("SELECT label_nl FROM event_categories WHERE key = 'other'").label_nl == "Other"
            assert row("SELECT description_nl FROM organizations WHERE name = 'Producer'").description_nl == "About us"
            # The live Dutch text wins over a proposal; a proposal for an organization without
            # Dutch text keeps its text as the Dutch description.
            changes = {
                r.id: r
                for r in connection.execute(text("SELECT id, submitted_values, proposed FROM organization_changes"))
            }
            assert changes["change"].submitted_values == {"description_fr": "Nous"}
            assert changes["change"].proposed == {"description_fr": "Nous", "website": "https://a.example"}
            assert changes["bare"].proposed == {"description_fr": "Nous", "description_nl": "Nous"}

        with pytest.raises(IntegrityError, match="ck_events_title_nl"), database.begin() as connection:
            connection.execute(text("UPDATE events SET title_nl = ' ' WHERE id = 'dutch'"))
        with pytest.raises(IntegrityError, match="ck_events_description_nl"), database.begin() as connection:
            connection.execute(text("UPDATE events SET description_nl = NULL WHERE id = 'english'"))
        with pytest.raises(IntegrityError, match="ck_faq_items_nl"), database.begin() as connection:
            connection.execute(text("UPDATE faq_items SET answer_nl = NULL"))
        with pytest.raises(IntegrityError, match="ck_announcements_link_label_nl"), database.begin() as connection:
            connection.execute(text("UPDATE announcements SET link_label_nl = NULL"))
        with pytest.raises(IntegrityError, match="ck_policy_versions_nl"), database.begin() as connection:
            connection.execute(text("UPDATE policy_versions SET content_nl = NULL WHERE id = 'published'"))
        with database.begin() as connection:  # a draft may be incomplete
            connection.execute(text("UPDATE policy_versions SET content_nl = NULL WHERE id = 'draft'"))

        command.downgrade(config, "008")
        inspector = inspect(database)
        assert "title_language" in {c["name"] for c in inspector.get_columns("events")}
        with database.begin() as connection:
            languages = dict(connection.execute(text("SELECT id, title_language FROM events")).all())
            assert languages == {"dutch": "nl", "english": "nl", "blank-dutch": "nl"}
            assert (
                connection.execute(text("SELECT description_language FROM events WHERE id = 'english'")).scalar_one()
                == "nl"
            )
            assert (
                connection.execute(text("SELECT description_language FROM events WHERE id = 'dutch'")).scalar_one()
                is None
            )
        with pytest.raises(IntegrityError, match="ck_events_title_original"), database.begin() as connection:
            connection.execute(text("UPDATE events SET title_language = 'fr' WHERE id = 'dutch'"))
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
