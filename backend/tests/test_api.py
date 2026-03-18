"""Integration tests for the reservation API."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
ADMIN_TOKEN = "test-admin-token"


@pytest.fixture(autouse=True)
def set_admin_token(monkeypatch):
    monkeypatch.setattr("app.config.settings.admin_token", ADMIN_TOKEN)
    monkeypatch.setattr("app.auth.settings.admin_token", ADMIN_TOKEN)


@pytest.fixture()
async def db_session():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture()
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


ADMIN_HEADERS = {"Authorization": f"Bearer {ADMIN_TOKEN}"}

VALID_RESERVATION = {
    "name": "Jean Dupont",
    "email": "jean@example.com",
    "phone": "+32499000000",
    "event_id": "event-fri",
    "event_title": "Vrijdagavond",
    "guest_count": 2,
    "pre_orders": [
        {
            "product_id": "champagne-standard",
            "name": "Champagne Bottle (Standard)",
            "quantity": 1,
            "price": 65.0,
            "category": "champagne",
            "delivered": False,
        }
    ],
    "notes": "",
    "honeypot": "",
    "form_start_time": "",
}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Reservations — create (public)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_reservation(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Jean Dupont"
    assert data["status"] == "pending"
    assert "check_in_token" not in data  # must not be returned here


@pytest.mark.anyio
async def test_honeypot_rejected(client):
    body = {**VALID_RESERVATION, "honeypot": "bot-value"}
    r = await client.post("/api/reservations", json=body)
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Reservations — admin list / detail
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_requires_auth(client):
    r = await client.get("/api/reservations")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_list_and_detail(client):
    await client.post("/api/reservations", json=VALID_RESERVATION)

    r = await client.get("/api/reservations", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert "check_in_token" not in items[0]  # stripped from list

    res_id = items[0]["id"]
    r = await client.get(f"/api/reservations/{res_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    detail = r.json()
    assert "check_in_token" in detail  # present in detail view


# ---------------------------------------------------------------------------
# Check-in flow
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_check_in_flow(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    res_id = r.json()["id"]

    # Get the token from admin detail
    r = await client.get(f"/api/reservations/{res_id}", headers=ADMIN_HEADERS)
    token = r.json()["check_in_token"]

    # Verify token via GET
    r = await client.get(f"/api/check-in/{res_id}", params={"token": token})
    assert r.status_code == 200

    # Check in
    r = await client.post(
        f"/api/check-in/{res_id}", json={"token": token, "issue_strap": True}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["already_checked_in"] is False
    assert body["reservation"]["checked_in"] is True
    assert body["reservation"]["strap_issued"] is True

    # Second scan
    r = await client.post(
        f"/api/check-in/{res_id}", json={"token": token, "issue_strap": True}
    )
    assert r.json()["already_checked_in"] is True


@pytest.mark.anyio
async def test_check_in_wrong_token(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    res_id = r.json()["id"]
    r = await client.post(
        f"/api/check-in/{res_id}", json={"token": "wrong", "issue_strap": True}
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_table_crud(client):
    # Tables require a table_type and a layout (which requires a room, which requires a venue)
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS
    )
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS
    )
    layout_id = r.json()["id"]
    r = await client.post(
        "/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS
    )
    tt_id = r.json()["id"]

    payload = {
        "name": "Table 1",
        "capacity": 6,
        "x": 25.0,
        "y": 30.0,
        "table_type_id": tt_id,
        "layout_id": layout_id,
    }

    r = await client.post("/api/tables", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    tbl_id = r.json()["id"]

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1

    r = await client.put(
        f"/api/tables/{tbl_id}", json={"capacity": 8}, headers=ADMIN_HEADERS
    )
    assert r.json()["capacity"] == 8

    r = await client.delete(f"/api/tables/{tbl_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert r.json() == []


# ---------------------------------------------------------------------------
# Reservations — search / filter (admin)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_search_by_name(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    r = await client.post(
        "/api/reservations",
        json={**VALID_RESERVATION, "name": "Marie Curie", "email": "marie@example.com"},
    )
    assert r.status_code == 201

    r = await client.get("/api/reservations", params={"q": "jean"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["name"] == "Jean Dupont"


@pytest.mark.anyio
async def test_search_by_email(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201

    r = await client.get(
        "/api/reservations", params={"q": "example.com"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_filter_by_status(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    r_list = await client.get("/api/reservations", headers=ADMIN_HEADERS)
    res_id = r_list.json()[0]["id"]

    # Confirm the reservation
    r = await client.put(
        f"/api/reservations/{res_id}", json={"status": "confirmed"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200

    r = await client.get(
        "/api/reservations", params={"status": "confirmed"}, headers=ADMIN_HEADERS
    )
    assert len(r.json()) == 1

    r = await client.get(
        "/api/reservations", params={"status": "pending"}, headers=ADMIN_HEADERS
    )
    assert len(r.json()) == 0


@pytest.mark.anyio
async def test_filter_by_event(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    r = await client.post(
        "/api/reservations",
        json={**VALID_RESERVATION, "event_id": "event-sat", "email": "other@example.com"},
    )
    assert r.status_code == 201

    r = await client.get(
        "/api/reservations", params={"event_id": "event-fri"}, headers=ADMIN_HEADERS
    )
    assert len(r.json()) == 1
    assert r.json()[0]["event_id"] == "event-fri"


# ---------------------------------------------------------------------------
# Visitor self-lookup (public /my endpoint)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_my_reservations(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201

    r = await client.get("/api/reservations/my", params={"email": "jean@example.com"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    # Must not expose sensitive fields
    assert "check_in_token" not in items[0]
    assert "phone" not in items[0]
    assert "notes" not in items[0]
    # Must expose booking status fields
    assert items[0]["status"] == "pending"
    assert items[0]["event_title"] == "Vrijdagavond"


@pytest.mark.anyio
async def test_my_reservations_case_insensitive_email(client):
    """Email stored with mixed case must be retrievable via lowercase lookup."""
    r = await client.post("/api/reservations", json={**VALID_RESERVATION, "email": "Jean@Example.com"})
    assert r.status_code == 201

    r = await client.get("/api/reservations/my", params={"email": "jean@example.com"})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["status"] == "pending"


@pytest.mark.anyio
async def test_my_reservations_no_results(client):
    r = await client.get("/api/reservations/my", params={"email": "nobody@example.com"})
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.anyio
async def test_my_reservations_invalid_email(client):
    r = await client.get("/api/reservations/my", params={"email": "not-an-email"})
    assert r.status_code == 422  # FastAPI/Pydantic validation error


@pytest.mark.anyio
async def test_my_reservations_multiple_editions(client):
    """A guest with two bookings (different events) sees both."""
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    r = await client.post(
        "/api/reservations",
        json={**VALID_RESERVATION, "event_id": "event-sat", "event_title": "Zaterdagavond"},
    )
    assert r.status_code == 201

    r = await client.get("/api/reservations/my", params={"email": "jean@example.com"})
    assert len(r.json()) == 2


# ---------------------------------------------------------------------------
# Content API (producers / sponsors)
# ---------------------------------------------------------------------------

PRODUCER_ITEMS = [
    {"id": 1, "name": "Maison Bollinger", "image": "/images/producers/bollinger.jpg"},
    {"id": 2, "name": "Krug", "image": "/images/producers/krug.jpg"},
]

SPONSOR_ITEMS = [
    {"id": 1, "name": "Acme Corp", "image": "/images/sponsors/acme.jpg"},
]


@pytest.mark.anyio
async def test_content_404_before_save(client):
    """Before any admin save, the endpoint returns 404 (frontend falls back to placeholders)."""
    r = await client.get("/api/content/producers")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_content_upsert_requires_admin(client):
    r = await client.put("/api/content/producers", json={"value": PRODUCER_ITEMS})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_content_invalid_key(client):
    r = await client.put(
        "/api/content/invalid_key",
        json={"value": PRODUCER_ITEMS},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_content_producers_crud(client):
    # Create
    r = await client.put(
        "/api/content/producers",
        json={"value": PRODUCER_ITEMS},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["key"] == "producers"
    assert len(data["value"]) == 2
    assert data["value"][0]["name"] == "Maison Bollinger"

    # Read back (public — no auth)
    r = await client.get("/api/content/producers")
    assert r.status_code == 200
    assert len(r.json()["value"]) == 2

    # Update (replace)
    r = await client.put(
        "/api/content/producers",
        json={"value": [PRODUCER_ITEMS[0]]},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert len(r.json()["value"]) == 1


@pytest.mark.anyio
async def test_content_sponsors_independent(client):
    """Producers and sponsors are stored independently."""
    await client.put(
        "/api/content/producers",
        json={"value": PRODUCER_ITEMS},
        headers=ADMIN_HEADERS,
    )
    r = await client.put(
        "/api/content/sponsors",
        json={"value": SPONSOR_ITEMS},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r_prod = await client.get("/api/content/producers")
    r_spon = await client.get("/api/content/sponsors")
    assert len(r_prod.json()["value"]) == 2
    assert len(r_spon.json()["value"]) == 1


@pytest.mark.anyio
async def test_content_empty_list(client):
    """Saving an empty list is valid (admin cleared the content)."""
    r = await client.put(
        "/api/content/sponsors",
        json={"value": []},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["value"] == []


# ---------------------------------------------------------------------------
# Rooms API
# ---------------------------------------------------------------------------

VENUE_PAYLOAD = {"name": "Test Venue"}

ROOM_PAYLOAD = {
    "name": "Main Hall",
    "width_m": 25.0,
    "length_m": 18.0,
    "color": "#ffc107",
}

TABLE_TYPE_PAYLOAD = {"name": "Standard", "max_capacity": 6}


@pytest.mark.anyio
async def test_room_crud(client):
    # Room requires a venue
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    venue_id = r.json()["id"]

    # Create
    r = await client.post(
        "/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS
    )
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
    r = await client.put(
        f"/api/rooms/{room_id}", json={"length_m": 20.0}, headers=ADMIN_HEADERS
    )
    assert r.json()["length_m"] == 20.0

    # Delete
    r = await client.delete(f"/api/rooms/{room_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert r.json() == []


@pytest.mark.anyio
async def test_room_requires_admin(client):
    r = await client.post("/api/rooms", json=ROOM_PAYLOAD)
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
async def test_table_with_layout_id(client):
    """Tables can be assigned a layout_id and it is persisted."""
    # Build the prerequisite chain: venue → room → layout + table_type
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS
    )
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS
    )
    layout_id = r.json()["id"]
    r = await client.post(
        "/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS
    )
    tt_id = r.json()["id"]

    # Create a table assigned to that layout
    r = await client.post(
        "/api/tables",
        json={
            "name": "T1",
            "capacity": 4,
            "x": 10.0,
            "y": 10.0,
            "table_type_id": tt_id,
            "layout_id": layout_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert r.json()["layout_id"] == layout_id

    # Update layout assignment via PUT
    tbl_id = r.json()["id"]
    r = await client.put(
        f"/api/tables/{tbl_id}", json={"layout_id": layout_id}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Contact endpoint
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_contact_submission(client):
    """Valid contact form submission returns 200 OK."""
    r = await client.post(
        "/api/contact",
        json={"name": "Alice", "email": "alice@example.com", "message": "Hello!"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


@pytest.mark.anyio
async def test_contact_invalid_email(client):
    """Invalid email is rejected with 422."""
    r = await client.post(
        "/api/contact",
        json={"name": "Alice", "email": "not-an-email", "message": "Hello!"},
    )
    assert r.status_code == 422


@pytest.mark.anyio
async def test_spam_invalid_timestamp(client):
    """A non-ISO form_start_time is rejected (bot protection)."""
    r = await client.post(
        "/api/reservations",
        json={**VALID_RESERVATION, "form_start_time": "1234567890"},
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_table_id_can_be_cleared(client):
    """table_id on a reservation can be explicitly cleared to null."""
    # Create a reservation
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    res_id = r.json()["id"]

    # Create table prerequisites: venue → room → layout + table_type
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS
    )
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS
    )
    layout_id = r.json()["id"]
    r = await client.post(
        "/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS
    )
    tt_id = r.json()["id"]

    # Create a table
    r = await client.post(
        "/api/tables",
        json={"name": "T-Clear", "capacity": 4, "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    tbl_id = r.json()["id"]

    # Assign the table
    r = await client.put(
        f"/api/reservations/{res_id}",
        json={"table_id": tbl_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["table_id"] == tbl_id

    # Clear the table (set to null)
    r = await client.put(
        f"/api/reservations/{res_id}",
        json={"table_id": None},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["table_id"] is None



# ---------------------------------------------------------------------------
# Volunteers (admin)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_volunteers_require_auth(client):
    r = await client.get("/api/volunteers")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_volunteer_crud_and_constraints(client):
    payload = {
        "name": "Sofie De Smet",
        "address": "Dorpsstraat 12, 8450 Bredene",
        "first_help_day": "2026-03-20",
        "last_help_day": "2026-03-22",
        "national_register_number": "91010112345",
        "eid_document_number": "BEX123456",
    }

    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    volunteer = r.json()
    assert volunteer["name"] == "Sofie De Smet"

    # duplicate insurance identity fields are rejected
    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 409

    volunteer_id = volunteer["id"]

    r = await client.get(
        "/api/volunteers", params={"q": "bredene"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    # active filter support
    r = await client.get(
        "/api/volunteers", params={"active": "true"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.put(
        f"/api/people/{volunteer_id}",
        json={"active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get(
        "/api/volunteers", params={"active": "false"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.put(
        f"/api/volunteers/{volunteer_id}",
        json={"last_help_day": "2026-03-24"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["last_help_day"] == "2026-03-24"

    # invalid day range should fail
    r = await client.put(
        f"/api/volunteers/{volunteer_id}",
        json={"first_help_day": "2026-03-25", "last_help_day": "2026-03-24"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400

    r = await client.delete(f"/api/volunteers/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204


# ---------------------------------------------------------------------------
# People (admin)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_people_require_auth(client):
    r = await client.get("/api/people")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_people_crud_roles_and_filters(client):
    payload = {
        "name": "Anne Dupuis",
        "email": "anne@example.com",
        "phone": "+32470111222",
        "address": "Kapelstraat 8, Bredene",
        "roles": ["Chairwoman", "Volunteer", "Member"],
        "first_help_day": "2026-03-20",
        "last_help_day": "2026-03-22",
        "national_register_number": "85010199999",
        "eid_document_number": "BEI998877",
        "visits_per_month": 1,
        "club_name": "Champagne Lovers",
        "notes": "Often helps at entrance.",
        "active": True,
    }

    r = await client.post("/api/people", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    person = r.json()
    assert person["roles"] == ["chairwoman", "member", "volunteer"]

    person_id = person["id"]

    r = await client.get(
        "/api/people", params={"role": "volunteer"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.get(
        "/api/people", params={"q": "treasurer"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 0

    r = await client.put(
        f"/api/people/{person_id}",
        json={"roles": ["Treasurer", "Festival-Visitor"], "active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["roles"] == ["festival-visitor", "treasurer"]
    assert r.json()["active"] is False

    r = await client.get(
        "/api/people", params={"role": "treasurer", "active": "false"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.put(
        f"/api/people/{person_id}",
        json={"first_help_day": "2026-03-25", "last_help_day": "2026-03-24"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400

    # Reservation history is grouped under the person
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "anne@example.com",
            "name": "Anne Dupuis",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == person_id

    r = await client.get(f"/api/people/{person_id}/reservations", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["email"] == "anne@example.com"

    r = await client.delete(f"/api/people/{person_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204


# ---------------------------------------------------------------------------
# Members (admin convenience endpoint)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_members_require_auth(client):
    r = await client.get("/api/members")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_members_crud(client):
    payload = {
        "name": "Lieve Janssens",
        "email": "lieve@example.com",
        "phone": "+32475555111",
        "address": "Spuiplein 1, Bredene",
        "roles": ["festival-visitor"],
        "club_name": "Champagne Lovers",
        "notes": "Prefers capsule exchange events.",
        "active": True,
    }

    r = await client.post("/api/members", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    person = r.json()
    assert "member" in person["roles"]

    person_id = person["id"]

    r = await client.get(
        "/api/members", params={"q": "spui"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.put(
        f"/api/members/{person_id}",
        json={"roles": ["treasurer"], "active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert "member" in r.json()["roles"]
    assert r.json()["active"] is False

    r = await client.get(
        "/api/members", params={"active": "false"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.delete(f"/api/members/{person_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204
