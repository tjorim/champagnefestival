"""Migration 016 turns the legacy single inclusion into `inclusions` without changing included quantities."""

import json
import os
from datetime import date, time
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, insert, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.models import Edition, Event, Product, Venue
from app.schemas import OrderItemRequest
from app.services import product_inventory as inventory
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")

GUESTS_PER_TWO = {"product_id": "bottle", "quantity": 1, "per_quantity": 2, "rounding": "down", "basis": "guests"}


def _included(session, graph, guests, ordered="table", quantity=1):
    """Included quantities the current booking code resolves for a package."""
    event = session.get_one(Event, "event")
    items, _ = inventory.resolve_booking(
        event, [OrderItemRequest(product_id=ordered, quantity=quantity)], guests, previous_snapshot=graph
    )
    return {item["product_id"]: item["included_quantity"] for item in items if item["included_quantity"]}


def _booked_rules(snapshot, *keys):
    """Frozen package rules as a booking carries them: the stored rules plus the booked line fields."""
    booked = {"name": "Booked", "price": "10.00", "category": "champagne", "unit": "item", "required": False}
    return {key: {**booked, **snapshot[key], "product_id": key} for key in keys}


def test_legacy_single_inclusion_becomes_a_guest_based_inclusion(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_single_inclusion_{uuid4().hex}"
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'CREATE TABLE "{schema}".alembic_version (version_num varchar(32) PRIMARY KEY)'))
    migration_url = url.update_query_dict({"options": f"-csearch_path={schema},public"})
    monkeypatch.setenv("DATABASE_URL", migration_url.render_as_string(hide_password=False))
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    database = create_engine(migration_url)
    try:
        command.upgrade(config, "014")
        with database.begin() as connection:
            connection.execute(insert(Venue).values(id="venue", name="Venue"))
            connection.execute(
                text("""
                INSERT INTO people (id, name, retired_roles, role_history, anonymised)
                VALUES ('person', 'Person', '{}', '{}', false)
            """)
            )
            connection.execute(insert(Edition).values(id="edition", year=2026, month="october", venue_id="venue"))
            for event_id in ("event", "other-event"):
                connection.execute(
                    insert(Event).values(
                        id=event_id,
                        edition_id="edition",
                        title_nl="Evenement",
                        date=date(2026, 10, 1),
                        start_time=time(9, 15),
                        category="tasting",
                    )
                )
            for product_id, event_id in (
                ("bottle", "event"),
                ("table", "event"),
                ("json-null", "event"),
                ("half-set", "event"),
                ("foreign-target", "event"),
                ("self-target", "event"),
                ("huge-ratio", "event"),
                ("listed", "event"),
                ("odd-json", "event"),
                ("foreign", "other-event"),
            ):
                connection.execute(
                    insert(Product).values(
                        id=product_id,
                        event_id=event_id,
                        name_nl=product_id,
                        price=10,
                        unit="item",
                        category="champagne",
                    )
                )
            connection.execute(text("UPDATE products SET inclusions = NULL"))
            for product_id, target, per_guests in (
                ("table", "bottle", 2),
                ("json-null", "bottle", 3),
                ("half-set", "bottle", None),
                ("foreign-target", "foreign", 2),
                ("self-target", "self-target", 1),
                ("huge-ratio", "bottle", 2_000_000_000),
                ("listed", "bottle", 2),
            ):
                connection.execute(
                    text(
                        "UPDATE products SET included_product_id = :target, included_per_guests = :per WHERE id = :id"
                    ),
                    {"id": product_id, "target": target, "per": per_guests},
                )
            for product_id, stored in (
                ("json-null", "null"),
                (
                    "listed",
                    json.dumps(
                        [
                            {"product_id": "bottle", "quantity": "2", "per_quantity": 3, "rounding": "up"},
                            {"product_id": "bottle", "quantity": 5},
                            {"product_id": "ghost", "quantity": 1},
                            {"product_id": "foreign", "quantity": 1},
                            {"product_id": "bottle", "quantity": 0},
                            "junk",
                            None,
                        ]
                    ),
                ),
                ("odd-json", json.dumps({"unexpected": True})),
            ):
                connection.execute(
                    text("UPDATE products SET inclusions = CAST(:stored AS json) WHERE id = :id"),
                    {"id": product_id, "stored": stored},
                )
            legacy_node = {
                "purchasable": True,
                "inclusions": None,
                "included_product_id": "bottle",
                "included_per_guests": 2,
            }
            frozen = {
                "table": legacy_node,
                "bottle": {"purchasable": True, "inclusions": None},
                "listed": {**legacy_node, "inclusions": [{**GUESTS_PER_TWO, "product_id": "table"}]},
                "half": {"purchasable": True, "included_product_id": "bottle", "included_per_guests": None},
            }
            for registration_id, graph in (("frozen", frozen), ("empty", {}), ("odd", [])):
                connection.execute(
                    text(
                        "INSERT INTO registrations (id, event_id, guest_count, person_id, check_in_token, "
                        "status, package_snapshot) VALUES (:id, 'event', 6, 'person', :token, 'confirmed', "
                        "CAST(:graph AS json))"
                    ),
                    {"id": registration_id, "token": f"token-{registration_id}", "graph": json.dumps(graph)},
                )

        command.upgrade(config, "016")

        with database.begin() as connection:
            stored = dict(connection.execute(text("SELECT id, inclusions FROM products")).all())
            assert stored["bottle"] == []
            assert stored["table"] == [GUESTS_PER_TWO]
            assert stored["json-null"] == [{**GUESTS_PER_TWO, "per_quantity": 3}]
            assert stored["half-set"] == []
            assert stored["foreign-target"] == []
            assert stored["self-target"] == []
            assert stored["huge-ratio"] == [{**GUESTS_PER_TWO, "per_quantity": 1_000_000}]
            # An explicit list always won over the leftover pair; unusable entries are dropped.
            assert stored["listed"] == [
                {"product_id": "bottle", "quantity": 2, "per_quantity": 3, "rounding": "up", "basis": "quantity"}
            ]
            assert stored["odd-json"] == []

            snapshots = dict(connection.execute(text("SELECT id, package_snapshot FROM registrations")).all())
            assert snapshots["frozen"]["table"] == {"purchasable": True, "inclusions": [GUESTS_PER_TWO]}
            assert snapshots["frozen"]["bottle"] == {"purchasable": True, "inclusions": []}
            assert snapshots["frozen"]["listed"] == {
                "purchasable": True,
                "inclusions": [{**GUESTS_PER_TWO, "product_id": "table"}],
            }
            assert snapshots["frozen"]["half"] == {"purchasable": True, "inclusions": []}
            assert snapshots["empty"] == {}
            assert snapshots["odd"] == []

        columns = {column["name"]: column for column in inspect(database).get_columns("products")}
        assert columns["inclusions"]["nullable"] is False
        assert "included_product_id" not in columns and "included_per_guests" not in columns
        with pytest.raises(IntegrityError), database.begin() as connection:
            connection.execute(text("UPDATE products SET inclusions = NULL WHERE id = 'bottle'"))

        # Regression: the same guests and quantities still include the same bottles, for a
        # new order on the migrated product and for a booking that kept its frozen rules.
        with Session(database) as session:
            assert _included(session, None, guests=6) == {"bottle": 3}
            assert _included(session, None, guests=6, quantity=2) == {"bottle": 3}
            assert _included(session, None, guests=1) == {}
            booked = (
                session.connection()
                .execute(text("SELECT package_snapshot FROM registrations WHERE id = 'frozen'"))
                .scalar_one()
            )
            assert _included(session, _booked_rules(booked, "table", "bottle"), guests=6) == {"bottle": 3}

        command.downgrade(config, "015")
        with database.begin() as connection:
            restored = {
                row.id: (row.inclusions, row.included_product_id, row.included_per_guests)
                for row in connection.execute(
                    text("SELECT id, inclusions, included_product_id, included_per_guests FROM products")
                )
            }
            assert restored["table"] == (None, "bottle", 2)
            assert restored["json-null"] == (None, "bottle", 3)
            assert restored["bottle"] == ([], None, None)
            assert restored["listed"][1:] == (None, None)
            snapshot = connection.execute(
                text("SELECT package_snapshot FROM registrations WHERE id='frozen'")
            ).scalar_one()
            assert snapshot["table"] == {
                "purchasable": True,
                "inclusions": None,
                "included_product_id": "bottle",
                "included_per_guests": 2,
            }
            assert snapshot["bottle"] == {"purchasable": True, "inclusions": []}

        command.upgrade(config, "016")
        with database.begin() as connection:
            assert connection.execute(text("SELECT inclusions FROM products WHERE id = 'table'")).scalar_one() == [
                GUESTS_PER_TWO
            ]
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
