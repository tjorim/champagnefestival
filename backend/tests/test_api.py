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
