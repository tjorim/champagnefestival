"""Migration 014 preserves booked values and normalizes historical order data."""

import json
import os
from datetime import date, time
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, insert, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.models import Edition, Event, Product, Registration, Venue
from tests.helpers import requires_postgres

pytestmark = requires_postgres("the Alembic migrations target PostgreSQL")


def test_relational_order_lines_round_trip(monkeypatch):
    url = make_url(os.environ["TEST_DATABASE_URL"]).set(drivername="postgresql+psycopg")
    schema = f"test_order_lines_{uuid4().hex}"
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
        command.upgrade(config, "013")
        with database.begin() as connection:
            connection.execute(insert(Venue).values(id="venue", name="Venue"))
            connection.execute(
                text("""
                INSERT INTO people (id, name, retired_roles, role_history, anonymised)
                VALUES ('person', 'Person', '{}', '{}', false)
            """)
            )
            connection.execute(insert(Edition).values(id="edition", year=2026, month="october", venue_id="venue"))
            connection.execute(
                insert(Event).values(
                    id="event",
                    edition_id="edition",
                    title_nl="Evenement",
                    date=date(2026, 10, 1),
                    start_time=time(9, 15),
                    category="tasting",
                )
            )
            connection.execute(
                insert(Product).values(
                    id="live", event_id="event", name_nl="Current name", price=99, unit="item", category="champagne"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO registrations (id, event_id, guest_count, person_id, check_in_token, status, "
                    "order_items, product_snapshot) VALUES "
                    "('confirmed', 'event', 4, 'person', 'token1', 'confirmed', CAST(:lines AS json), CAST(:graph AS json)), "
                    "('cancelled', 'event', 4, 'person', 'token2', 'cancelled', CAST(:lines AS json), 'null'), "
                    "('empty', 'event', 1, 'person', 'token3', 'pending', '{}', '[]')"
                ),
                {
                    "lines": json.dumps(
                        [
                            {
                                "product_id": "live",
                                "name": "Booked name",
                                "quantity": 4,
                                "price": "12.50",
                                "category": "booked-category",
                                "delivered": True,
                            },
                            False,
                            {
                                "product_id": "deleted",
                                "name_nl": "Weg",
                                "name_fr": "Retiré",
                                "quantity": "2",
                                "included_quantity": 9,
                                "delivered_quantity": "1",
                                "delivered": True,
                                "price": "NaN",
                                "visible": False,
                            },
                            {"product_id": "broken-quantity", "quantity": {}},
                            {
                                "product_id": "missing-price",
                                "quantity": 1,
                                "delivered_quantity": -1,
                                "name": "Odd\x00 value",
                            },
                        ]
                    ),
                    "graph": json.dumps(
                        {
                            "live": {
                                "unit": "table",
                                "active": False,
                                "name_en": "Booked table",
                                "price": "20.00",
                                "included_product_id": "deleted",
                                "included_per_guests": 2,
                            },
                            "deleted": {"price": "3.45", "unit": "item", "active": False},
                            "unused": [],
                        }
                    ),
                },
            )

        command.upgrade(config, "014")
        with Session(database) as session:
            booking = session.get_one(Registration, "confirmed")
            assert booking.booked_table_quantity == 4
            assert [(line.position, line.live_product_id) for line in booking.order_lines] == [
                (0, "live"),
                (1, None),
                (2, None),
            ]
            first, second, odd = booking.order_lines
            assert (first.name_nl, first.name_en, first.price, first.category) == (
                "Booked name",
                "Booked table",
                Decimal("12.50"),
                "booked-category",
            )
            assert (second.name_fr, second.price, second.included_quantity, second.visible) == (
                "Retiré",
                Decimal("3.45"),
                2,
                False,
            )
            assert (odd.name_nl, odd.price, odd.delivered_quantity) == ("Odd value", Decimal("0"), 0)
            assert [(item["delivered_quantity"], item["delivered"]) for item in booking.order_items] == [
                (4, True),
                (1, False),
                (0, False),
            ]
            assert session.get_one(Registration, "empty").order_items == []
            assert session.scalar(select(Product.reserved_quantity).where(Product.id == "live")) == 4
            assert booking.frozen_product_graph()["live"]["included_product_id"] == "deleted"
            assert booking.frozen_product_graph()["live"]["purchasable"] is False
            assert "price" not in booking.package_snapshot["live"]
            assert {column["name"] for column in inspect(session.connection()).get_columns("registrations")}.isdisjoint(
                {"order_items", "product_snapshot"}
            )

        with pytest.raises(IntegrityError), database.begin() as connection:
            connection.execute(text("UPDATE registration_order_lines SET delivered_quantity = quantity + 1"))
        with database.begin() as connection:
            connection.execute(text("DELETE FROM products WHERE id = 'live'"))
            assert connection.execute(
                text(
                    "SELECT live_product_id, product_id FROM registration_order_lines "
                    "WHERE registration_id = 'confirmed' AND position = 0"
                )
            ).one() == (None, "live")

        command.downgrade(config, "013")
        with database.begin() as connection:
            items, snapshot = connection.execute(
                text("SELECT order_items, product_snapshot FROM registrations WHERE id = 'confirmed'")
            ).one()
            assert [(item["product_id"], item["delivered_quantity"]) for item in items] == [
                ("live", 4),
                ("deleted", 1),
                ("missing-price", 0),
            ]
            assert snapshot["live"]["unit"] == "table"
            assert snapshot["live"]["price"] == "12.50"
            assert snapshot["live"]["included_product_id"] == "deleted"
    finally:
        database.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
