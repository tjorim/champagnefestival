"""Event-owned plans and partial physical allocations across rooms."""

import pytest

from tests.helpers import ROOM_PAYLOAD, TABLE_TYPE_PAYLOAD, VALID_RESERVATION, _create_event
from tests.test_product_inventory import book
from tests.test_products import _create_product


async def room_and_plan(client, event, name="Main room"):
    edition = (await client.get(f"/api/editions/{event['edition_id']}")).json()
    room = (
        await client.post("/api/rooms", json={**ROOM_PAYLOAD, "name": name, "venue_id": edition["venue"]["id"]})
    ).json()
    response = await client.post("/api/layouts", json={"room_id": room["id"], "event_id": event["id"]})
    assert response.status_code == 201, response.text
    return room, response.json()


async def table(client, plan, name="Table", capacity=4):
    room = (await client.get(f"/api/rooms/{plan['room_id']}")).json()
    response = await client.post(
        "/api/table-types", json={**TABLE_TYPE_PAYLOAD, "capacity": capacity, "venue_id": room["venue_id"]}
    )
    assert response.status_code == 201, response.text
    template = response.json()
    response = await client.post(
        "/api/tables", json={"name": name, "layout_id": plan["id"], "table_type_id": template["id"]}
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.anyio
async def test_event_can_use_multiple_rooms_and_same_room_can_have_same_day_events(client):
    morning = await _create_event(client)
    room, plan = await room_and_plan(client, morning)
    _, side = await room_and_plan(client, morning, "Side room")
    assert plan["event_id"] == side["event_id"] == morning["id"]
    response = await client.post(
        "/api/events",
        json={
            "edition_id": morning["edition_id"],
            "title": "Evening",
            "date": morning["date"],
            "start_time": "20:00",
            "category": "other",
        },
    )
    assert response.status_code == 201, response.text
    evening = response.json()
    response = await client.post(
        f"/api/layouts/{plan['id']}/copy", json={"event_id": evening["id"], "room_id": room["id"]}
    )
    assert response.status_code == 201, response.text
    assert response.json()["event_id"] == evening["id"]
    assert response.json()["edition_id"] == evening["edition_id"]
    assert "day_id" not in response.json()
    assert (
        await client.post("/api/layouts", json={"event_id": morning["id"], "room_id": room["id"]})
    ).status_code == 409
    assert (
        await client.post(
            "/api/layouts", json={"edition_id": morning["edition_id"], "day_id": 1, "room_id": room["id"]}
        )
    ).status_code == 422


@pytest.mark.anyio
async def test_split_guest_allocations_share_tables_and_use_actual_occupancy(client):
    event = await _create_event(client)
    _, main = await room_and_plan(client, event)
    _, side = await room_and_plan(client, event, "Side")
    first = await table(client, main, "Main", 4)
    second = await table(client, side, "Side", 4)
    registration = (
        await client.post("/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"], "guest_count": 6})
    ).json()
    entries = [{"table_id": first["id"], "guest_count": 4}, {"table_id": second["id"], "guest_count": 2}]
    response = await client.put(f"/api/registrations/{registration['id']}", json={"allocations": entries})
    assert response.status_code == 200, response.text
    assert len(response.json()["allocations"]) == 2
    partner = (
        await client.post(
            "/api/registrations",
            json={**VALID_RESERVATION, "event_id": event["id"], "email": "partner@example.com", "guest_count": 2},
        )
    ).json()
    response = await client.put(
        f"/api/registrations/{partner['id']}", json={"allocations": [{"table_id": second["id"], "guest_count": 2}]}
    )
    assert response.status_code == 200, response.text
    view = (await client.get(f"/api/venue-plan/{event['edition_id']}")).json()
    assert sorted(t["occupied_seats"] for p in view["layouts"] for t in p["tables"]) == [4, 4]
    assert (await client.put(f"/api/registrations/{registration['id']}", json={"guest_count": 5})).status_code == 409
    assert (
        await client.put(f"/api/registrations/{registration['id']}", json={"allocations": entries[:1]})
    ).status_code == 200
    assert (await client.get(f"/api/tables/{second['id']}")).json()["registration_ids"] == [partner["id"]]


@pytest.mark.anyio
async def test_whole_tables_are_exclusive_and_partial_allocation_keeps_stock(client):
    event = await _create_event(client)
    _, plan = await room_and_plan(client, event)
    physical = await table(client, plan)
    product = await _create_product(client, event["id"], unit="table", stock=3)
    booking = (await book(client, event, product, 3)).json()
    response = await client.put(
        f"/api/registrations/{booking['id']}",
        json={"allocations": [{"table_id": physical["id"], "guest_count": 0, "exclusive": True}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["booked_table_quantity"] == 3
    assert (await client.get(f"/api/products/{product['id']}")).json()["reserved_quantity"] == 3
    other = (
        await client.post(
            "/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"], "email": "other@example.com"}
        )
    ).json()
    assert (
        await client.put(
            f"/api/registrations/{other['id']}",
            json={"allocations": [{"table_id": physical["id"], "guest_count": 2}], "confirm_over_capacity": True},
        )
    ).status_code == 409
    assert (await client.delete(f"/api/tables/{physical['id']}")).status_code == 409


@pytest.mark.anyio
async def test_wrong_event_rejected_and_copy_does_not_copy_allocations(client):
    event = await _create_event(client)
    room, plan = await room_and_plan(client, event)
    physical = await table(client, plan)
    booking = (await client.post("/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"]})).json()
    assert (
        await client.put(
            f"/api/registrations/{booking['id']}",
            json={"allocations": [{"table_id": physical["id"], "guest_count": 2}]},
        )
    ).status_code == 200
    other = (
        await client.post(
            "/api/events",
            json={
                "edition_id": event["edition_id"],
                "title": "Evening",
                "date": event["date"],
                "start_time": "20:00",
                "category": "other",
            },
        )
    ).json()
    copied = await client.post(f"/api/layouts/{plan['id']}/copy", json={"event_id": other["id"], "room_id": room["id"]})
    assert copied.status_code == 201, copied.text
    tables = (await client.get("/api/tables", params={"layout_id": copied.json()["id"]})).json()
    assert len(tables) == 1 and tables[0]["id"] != physical["id"]
    assert tables[0]["registration_ids"] == []
    response = await client.put(
        f"/api/registrations/{booking['id']}", json={"allocations": [{"table_id": tables[0]["id"], "guest_count": 2}]}
    )
    assert response.status_code == 400
    # Changing an event's date cannot retarget its plan to another event.
    assert (await client.put(f"/api/events/{event['id']}", json={"date": "2099-03-22"})).status_code == 200
    result = (await client.get(f"/api/layouts/{plan['id']}")).json()
    assert result["event_id"] == event["id"] and result["date"] == "2099-03-22"
    response = await client.put(f"/api/registrations/{booking['id']}", json={"status": "cancelled"})
    assert response.status_code == 200 and response.json()["allocations"] == []


@pytest.mark.anyio
async def test_concurrent_allocations_cannot_overfill_a_table(client, engine):
    import asyncio

    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.schemas import RegistrationUpdate
    from app.services.registrations_service import apply_registration_update, get_registration_or_404

    event = await _create_event(client)
    _, plan = await room_and_plan(client, event)
    physical = await table(client, plan, capacity=2)
    bookings = [
        (
            await client.post("/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"], "email": email})
        ).json()
        for email in ("one@example.com", "two@example.com")
    ]
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def allocate(booking):
        async with factory() as db:
            try:
                registration = await get_registration_or_404(db, booking["id"])
                await apply_registration_update(
                    db,
                    registration,
                    body=RegistrationUpdate(allocations=[{"table_id": physical["id"], "guest_count": 2}]),
                    actor="test",
                )
                return 200
            except HTTPException as exc:
                await db.rollback()
                return exc.status_code

    assert sorted(await asyncio.gather(*(allocate(b) for b in bookings))) == [200, 409]


@pytest.mark.anyio
async def test_package_change_requires_releasing_included_tables_first(client):
    from tests.test_product_inventory import edge

    event = await _create_event(client)
    _, plan = await room_and_plan(client, event)
    physical = await table(client, plan)
    included = await _create_product(client, event["id"], unit="table")
    package = await _create_product(client, event["id"], inclusions=[edge(included)])
    booking = (await book(client, event, package)).json()
    url = f"/api/registrations/{booking['id']}"
    assert (
        await client.put(url, json={"allocations": [{"table_id": physical["id"], "guest_count": 0, "exclusive": True}]})
    ).status_code == 200
    product_url = f"/api/products/{package['id']}"
    change = {"inclusions": [], "update_existing_contents": True}
    assert (await client.post(product_url + "/preview", json=change)).status_code == 409
    assert (await client.get(url)).json()["booked_table_quantity"] == 1
    assert (await client.put(url, json={"allocations": []})).status_code == 200
    preview = (await client.post(product_url + "/preview", json=change)).json()
    assert (
        await client.put(product_url, json={**change, "preview_token": preview["preview_token"]})
    ).status_code == 200
    assert (await client.get(url)).json()["booked_table_quantity"] == 0


@pytest.mark.anyio
async def test_plans_block_incompatible_venue_moves_and_event_deletion(client):
    from tests.helpers import _create_venue

    event = await _create_event(client)
    room, _ = await room_and_plan(client, event)
    venue_id = await _create_venue(client)
    assert (await client.put(f"/api/rooms/{room['id']}", json={"venue_id": venue_id})).status_code == 409
    assert (await client.delete(f"/api/events/{event['id']}")).status_code == 409


@pytest.mark.anyio
async def test_quantity_reduction_and_chosen_table_release_commit_together(client, db_session):
    event = await _create_event(client)
    _, plan = await room_and_plan(client, event)
    first = await table(client, plan, "Keep")
    second = await table(client, plan, "Release")
    product = await _create_product(client, event["id"], unit="table", price="50", stock=2)
    booking = (await book(client, event, product, 2)).json()
    url = f"/api/registrations/{booking['id']}"
    allocations = [{"table_id": t["id"], "guest_count": 0, "exclusive": True} for t in (first, second)]
    assert (await client.put(url, json={"allocations": allocations})).status_code == 200
    assert (
        await client.post(
            f"{url}/transactions",
            json={"kind": "payment", "amount": "100.00", "effective_date": "2026-01-01"},
        )
    ).status_code == 201
    change = {"order_items": [{"product_id": product["id"], "quantity": 1}]}
    assert (await client.put(url, json=change)).status_code == 409
    # The fixture shares one session; mirror request teardown after rejection.
    await db_session.rollback()
    unchanged = (await client.get(url)).json()
    assert len(unchanged["allocations"]) == 2 and unchanged["booked_table_quantity"] == 2
    response = await client.put(url, json={**change, "allocations": allocations[:1]})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["allocations"] == allocations[:1]
    assert result["amount_due"] == "50.00" and result["amount_paid"] == "100.00" and result["refund_due"] == "50.00"
    assert (await client.get(f"/api/tables/{second['id']}")).json()["registration_ids"] == []
    assert (await client.get(f"/api/products/{product['id']}")).json()["reserved_quantity"] == 1
