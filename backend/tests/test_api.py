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
    payload = {"name": "Table 1", "capacity": 6, "x": 25.0, "y": 30.0}

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

ROOM_PAYLOAD = {
    "name": "Main Hall",
    "zone_type": "main-hall",
    "width_m": 25.0,
    "height_m": 18.0,
    "color": "#ffc107",
}


@pytest.mark.anyio
async def test_room_crud(client):
    # Create
    r = await client.post("/api/rooms", json=ROOM_PAYLOAD, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Main Hall"
    assert data["zone_type"] == "main-hall"
    assert data["width_m"] == 25.0
    room_id = data["id"]

    # List
    r = await client.get("/api/rooms", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1

    # Get
    r = await client.get(f"/api/rooms/{room_id}", headers=ADMIN_HEADERS)
    assert r.json()["name"] == "Main Hall"

    # Update
    r = await client.put(
        f"/api/rooms/{room_id}", json={"height_m": 20.0}, headers=ADMIN_HEADERS
    )
    assert r.json()["height_m"] == 20.0

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
async def test_table_with_room_id(client):
    """Tables can be assigned a room_id and it is persisted."""
    # Create a room first
    r = await client.post("/api/rooms", json=ROOM_PAYLOAD, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]

    # Create a table assigned to that room
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "capacity": 4, "x": 10.0, "y": 10.0, "room_id": room_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert r.json()["room_id"] == room_id

    # Update room assignment via PUT
    tbl_id = r.json()["id"]
    r = await client.put(
        f"/api/tables/{tbl_id}", json={"room_id": None}, headers=ADMIN_HEADERS
    )
    # room_id can be cleared — we just verify the request succeeds
    assert r.status_code == 200
