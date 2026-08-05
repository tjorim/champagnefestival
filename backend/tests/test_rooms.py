"""Tests for the rooms API."""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Room
from tests.helpers import ADMIN_HEADERS, ROOM_PAYLOAD, VENUE_PAYLOAD


@pytest.mark.anyio
async def test_room_crud(client):
    # Room requires a venue
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    # Create
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Main Hall"
    assert data["width_m"] == 25.0
    assert data["length_m"] == 18.0
    room_id = data["id"]

    # List
    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1

    # Get
    r = await client.get(f"/api/rooms/{room_id}", headers=ADMIN_HEADERS)
    assert r.json()["name"] == "Main Hall"

    # Update
    r = await client.put(f"/api/rooms/{room_id}", json={"length_m": 20.0}, headers=ADMIN_HEADERS)
    assert r.json()["length_m"] == 20.0

    # Delete
    r = await client.delete(f"/api/rooms/{room_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert r.json() == []


@pytest.mark.anyio
async def test_room_requires_admin(unauth_client):
    r = await unauth_client.post("/api/rooms", json=ROOM_PAYLOAD)
    assert r.status_code == 401


@pytest.mark.anyio
async def test_room_invalid_color(client):
    r = await client.post(
        "/api/rooms",
        json={**ROOM_PAYLOAD, "color": "not-a-color"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422


@pytest.mark.anyio
async def test_deleting_a_room_locks_it_against_concurrent_layout_creation(client, engine):
    """delete_room and create_layout both take a row lock on the room, so one
    request's check-then-write can't be interleaved by the other's — otherwise
    a layout created between the "no layouts" check and the delete would be
    silently cascade-deleted along with any tables already drawn on it."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as holder:
        # Simulate delete_room having already acquired its lock but not yet committed.
        await holder.execute(select(Room.id).where(Room.id == room_id).with_for_update())

        async with factory() as contender:
            # Simulate create_layout's lock attempt on the same room: it must block
            # while the holder's transaction is still open.
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(
                    contender.execute(select(Room.id).where(Room.id == room_id).with_for_update()),
                    timeout=0.5,
                )
            await contender.rollback()

            await holder.commit()

            # Once the holder releases the lock, the contender can proceed.
            await asyncio.wait_for(
                contender.execute(select(Room.id).where(Room.id == room_id).with_for_update()),
                timeout=2,
            )
            await contender.rollback()
