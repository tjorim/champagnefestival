"""app.sqlite_compat: what makes SQLite behave like the PostgreSQL schema for local development and tests."""

import asyncio
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app import sqlite_compat
from app.database import Base
from app.live.bus import live_bus
from app.live.events import LiveEvent, LiveScope
from app.live.notify import notify_live_event
from app.models import Person
from tests.helpers import IS_SQLITE

pytestmark = pytest.mark.skipif(not IS_SQLITE, reason="SQLite compatibility layer")


async def test_aware_datetimes_round_trip_as_utc(engine):
    plus_two = timezone(timedelta(hours=2))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add(
            Person(id="p-tz", name="Tz", email="tz@example.com", created_at=datetime(2026, 6, 1, 9, 0, tzinfo=plus_two))
        )
        await session.commit()
    async with factory() as session:
        person = (await session.execute(select(Person).where(Person.id == "p-tz"))).scalar_one()
        await session.delete(person)
        await session.commit()

    assert person.created_at == datetime(2026, 6, 1, 7, 0, tzinfo=UTC)
    assert person.created_at.utcoffset() == timedelta(0)


async def test_search_columns_are_maintained_by_the_trigger(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add(Person(id="p-search", name="Élodie Müller", email="Elodie@Example.COM"))
        await session.commit()
        row = (await session.execute(text("SELECT search_name, search_name_alt, search_email FROM people"))).one()
        assert tuple(row) == ("elodie muller", "elodie mueller", "elodie@example.com")

        await session.execute(text("UPDATE people SET name = 'Zoë Ño' WHERE id = 'p-search'"))
        await session.commit()
        assert (await session.execute(text("SELECT search_name FROM people"))).scalar_one() == "zoe no"
        await session.execute(text("DELETE FROM people"))
        await session.commit()


async def test_foreign_keys_are_switched_on(engine):
    async with engine.connect() as connection:
        assert (await connection.execute(text("PRAGMA foreign_keys"))).scalar_one() == 1


async def test_a_notification_is_delivered_on_commit_and_dropped_on_rollback(engine):
    event = LiveEvent(
        topic="order", action="updated", scope=LiveScope(registration_id="r1"), keys=(("registrations",),)
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with live_bus.subscribe() as queue:
        async with factory() as session:
            await notify_live_event(session, event)
            await session.rollback()
        await asyncio.sleep(0.05)
        assert queue.empty()

        async with factory() as session:
            await notify_live_event(session, event)
            assert queue.empty()  # still inside the transaction
            await session.commit()
        delivered = await asyncio.wait_for(queue.get(), timeout=2)

    assert delivered.topic == "order"
    assert delivered.scope.registration_id == "r1"


def test_unique_violations_are_named_from_the_model_metadata():
    name = sqlite_compat.unique_constraint_name
    assert name("UNIQUE constraint failed: app_settings.id", Base.metadata) == "app_settings_pkey"
    assert name("UNIQUE constraint failed: idempotency_keys.scope, idempotency_keys.key", Base.metadata) == (
        "uq_idempotency_keys_scope_key"
    )
    assert name("UNIQUE constraint failed: no_such_table.x", Base.metadata) is None
    assert name("NOT NULL constraint failed: people.name", Base.metadata) is None
