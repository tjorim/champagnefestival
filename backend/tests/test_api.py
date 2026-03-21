"""Integration tests for the reservation API."""

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES, Settings
from app.database import Base, get_db
from app.main import app
from app.models import ReservationAccessToken
import app.routers.registrations as reservations_module

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
ADMIN_TOKEN = "test-admin-token"


@pytest.fixture(autouse=True)
def set_admin_token(monkeypatch):
    monkeypatch.setattr("app.config.settings.admin_token", ADMIN_TOKEN)
    monkeypatch.setattr("app.auth.settings.admin_token", ADMIN_TOKEN)


@pytest.fixture(autouse=True)
def reset_rate_limiter(monkeypatch):
    """Reset the in-memory rate limiter before every test for isolation."""
    monkeypatch.setattr(reservations_module, "_rate_limit_buckets", {})


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


async def _create_event(
    client,
    *,
    edition_id: str = "edition-public",
    edition_active: bool = True,
    event_active: bool = True,
    registration_required: bool = True,
    registrations_open_from: str | None = None,
    max_capacity: int | None = None,
):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    assert venue_response.status_code == 201
    venue_id = venue_response.json()["id"]

    edition_response = await client.post(
        "/api/editions",
        json={
            "id": edition_id,
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": edition_active,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    event_payload = {
        "edition_id": edition_id,
        "title": "Public Registration Event",
        "description": "",
        "date": "2099-03-21",
        "start_time": "18:00",
        "end_time": "22:00",
        "category": "festival",
        "registration_required": registration_required,
        "active": event_active,
    }
    if registrations_open_from is not None:
        event_payload["registrations_open_from"] = registrations_open_from
    if max_capacity is not None:
        event_payload["max_capacity"] = max_capacity

    event_response = await client.post("/api/events", json=event_payload, headers=ADMIN_HEADERS)
    assert event_response.status_code == 201
    return event_response.json()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_settings_reject_nonpositive_guest_access_token_ttl():
    with pytest.raises(ValidationError, match="GUEST_ACCESS_TOKEN_TTL_MINUTES must be greater than 0."):
        Settings(guest_access_token_ttl_minutes=0)


def test_settings_reject_excessive_guest_access_token_ttl():
    with pytest.raises(
        ValidationError,
        match=(
            "GUEST_ACCESS_TOKEN_TTL_MINUTES must be less than or equal to "
            f"{GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES}\\."
        ),
    ):
        Settings(guest_access_token_ttl_minutes=GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES + 1)


# ---------------------------------------------------------------------------
# Reservations — create (public)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_reservation(client):
    r = await client.post("/api/registrations", json=VALID_RESERVATION)
    assert r.status_code == 201
    data = r.json()
    assert data["person"]["name"] == "Jean Dupont"
    assert data["status"] == "pending"
    assert "check_in_token" not in data  # must not be returned here


@pytest.mark.anyio
async def test_create_reservation_rejects_event_without_public_registrations(client):
    event = await _create_event(client, registration_required=False)

    r = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"]},
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "This event does not accept registrations."


@pytest.mark.anyio
async def test_create_reservation_rejects_registrations_before_opening(client):
    event = await _create_event(client, registrations_open_from="2099-03-22T00:00:00+00:00")

    r = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"]},
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "Registrations for this event are not open yet."


@pytest.mark.anyio
async def test_create_reservation_rejects_fully_booked_event(client):
    event = await _create_event(client, max_capacity=2)

    first = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"], "guest_count": 2},
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/registrations",
        json={
            **VALID_RESERVATION,
            "event_id": event["id"],
            "email": "other@example.com",
            "phone": "+32499000001",
        },
    )

    assert second.status_code == 400
    assert second.json()["detail"] == "This event is fully booked."


@pytest.mark.anyio
async def test_create_reservation_rejects_inactive_event(client):
    event = await _create_event(client, event_active=False)

    r = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"]},
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "Registrations are not available for this event."


@pytest.mark.anyio
async def test_event_rejects_registration_window_without_registration_required(client):
    venue_response = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = venue_response.json()["id"]
    edition_response = await client.post(
        "/api/editions",
        json={
            "id": "edition-event-validation",
            "year": 2099,
            "month": "march",
            "venue_id": venue_id,
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert edition_response.status_code == 201

    r = await client.post(
        "/api/events",
        json={
            "edition_id": "edition-event-validation",
            "title": "Walk-in Only Event",
            "description": "",
            "date": "2099-03-21",
            "start_time": "18:00",
            "end_time": "22:00",
            "category": "festival",
            "registration_required": False,
            "registrations_open_from": "2099-03-20T00:00:00+00:00",
        },
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 400
    assert (
        r.json()["detail"]
        == "registrations_open_from and max_capacity may only be set when registration_required is true."
    )


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
    r = await client.post("/api/registrations", json=VALID_RESERVATION)
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
# Layouts
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_layout_rejects_duplicate_room_day(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS
    )
    room_id = r.json()["id"]

    r = await client.post(
        "/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 201

    r = await client.post(
        "/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "A layout already exists for this room and day."


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

    r = await client.get(
        "/api/reservations", params={"q": "jean"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["person"]["name"] == "Jean Dupont"


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
        f"/api/reservations/{res_id}",
        json={"status": "confirmed"},
        headers=ADMIN_HEADERS,
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
async def test_admin_uncheckin_clears_checked_in_at(client):
    event = await _create_event(client, edition_id="edition-checkin-reset")
    r = await client.post(
        "/api/registrations",
        json={**VALID_RESERVATION, "event_id": event["id"]},
    )
    assert r.status_code == 201

    reservation_id = r.json()["id"]
    checked_in = await client.put(
        f"/api/registrations/{reservation_id}",
        json={"checked_in": True},
        headers=ADMIN_HEADERS,
    )
    assert checked_in.status_code == 200
    assert checked_in.json()["checked_in_at"] is not None

    unchecked = await client.put(
        f"/api/registrations/{reservation_id}",
        json={"checked_in": False},
        headers=ADMIN_HEADERS,
    )
    assert unchecked.status_code == 200
    assert unchecked.json()["checked_in"] is False
    assert unchecked.json()["checked_in_at"] is None


@pytest.mark.anyio
async def test_filter_by_event(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "event_id": "event-sat",
            "email": "other@example.com",
        },
    )
    assert r.status_code == 201

    r = await client.get(
        "/api/reservations", params={"event_id": "event-fri"}, headers=ADMIN_HEADERS
    )
    assert len(r.json()) == 1
    assert r.json()[0]["event_id"] == "event-fri"


# ---------------------------------------------------------------------------
# Visitor self-lookup (public token-based flow)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_request_my_reservations_access_is_generic(client):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201

    found = await client.post("/api/reservations/my/request", json={"email": "jean@example.com"})
    missing = await client.post("/api/reservations/my/request", json={"email": "nobody@example.com"})

    assert found.status_code == 202
    assert missing.status_code == 202
    assert found.json()["delivery_mode"] == "email"
    assert missing.json()["delivery_mode"] == "email"
    assert found.json()["expires_in_minutes"] == missing.json()["expires_in_minutes"]
    assert "access_token" not in found.json()
    assert "access_token" not in missing.json()
    assert "access_url" not in found.json()
    assert "access_url" not in missing.json()


@pytest.mark.anyio
async def test_my_reservations_case_insensitive_email(client):
    """Email stored with mixed case must be retrievable via lowercase lookup."""
    r = await client.post(
        "/api/reservations", json={**VALID_RESERVATION, "email": "Jean@Example.com"}
    )
    assert r.status_code == 201

    r = await client.post("/api/reservations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202


@pytest.mark.anyio
async def test_my_reservations_access_token_flow(client, db_session, monkeypatch):
    """Guest reservations are only returned after presenting a valid token."""
    token = "guest-access-token-12345"
    monkeypatch.setattr("app.routers.reservations.secrets.token_urlsafe", lambda _: token)

    r = await client.post("/api/reservations", json={**VALID_RESERVATION, "email": "Jean@Example.com"})
    assert r.status_code == 201

    r = await client.post("/api/reservations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202

    token_rows = (
        await db_session.execute(select(ReservationAccessToken))
    ).scalars().all()
    assert len(token_rows) == 1
    assert token_rows[0].email == "jean@example.com"
    assert token_rows[0].token_hash != token
    assert token_rows[0].token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()

    r = await client.post(
        "/api/reservations/my/access", json={"token": token}
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert "check_in_token" not in items[0]
    assert "phone" not in items[0]
    assert "notes" not in items[0]
    assert items[0]["status"] == "pending"
    assert items[0]["event_title"] == "Vrijdagavond"
    await db_session.refresh(token_rows[0])
    assert token_rows[0].last_used_at is not None


@pytest.mark.anyio
async def test_my_reservations_access_requires_valid_token(client):
    r = await client.post(
        "/api/reservations/my/access",
        json={"token": "invalid-token-value-12345"},
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_my_reservations_request_invalid_email(client):
    r = await client.post("/api/reservations/my/request", json={"email": "not-an-email"})
    assert r.status_code == 422


@pytest.mark.anyio
async def test_my_reservations_access_expired_token(client, db_session):
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201

    db_session.add(
        ReservationAccessToken(
            id="rat_expired",
            email="jean@example.com",
            token_hash=hashlib.sha256(b"expired-token-value-12345").hexdigest(),
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
    )
    await db_session.commit()

    r = await client.post(
        "/api/reservations/my/access",
        json={"token": "expired-token-value-12345"},
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_my_reservations_access_multiple_editions(client, monkeypatch):
    token = "guest-access-token-12345"
    monkeypatch.setattr("app.routers.reservations.secrets.token_urlsafe", lambda _: token)

    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "event_id": "event-sat",
            "event_title": "Zaterdagavond",
        },
    )
    assert r.status_code == 201

    r = await client.post("/api/reservations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202

    r = await client.post(
        "/api/reservations/my/access", json={"token": token}
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.anyio
async def test_my_reservations_request_reuses_existing_token_row(client, db_session, monkeypatch):
    tokens = iter(["guest-access-token-12345", "guest-access-token-67890"])
    monkeypatch.setattr(
        "app.routers.registrations.secrets.token_urlsafe",
        lambda _: next(tokens),
    )

    first = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})
    second = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})

    assert first.status_code == 202
    assert second.status_code == 202

    token_rows = (
        await db_session.execute(select(ReservationAccessToken))
    ).scalars().all()
    assert len(token_rows) == 1
    assert token_rows[0].email == "jean@example.com"
    assert token_rows[0].token_hash == hashlib.sha256(
        b"guest-access-token-67890"
    ).hexdigest()


@pytest.mark.anyio
async def test_my_reservations_request_recovers_from_insert_race(client, db_session, monkeypatch):
    tokens = iter(["guest-access-token-first", "guest-access-token-second"])
    monkeypatch.setattr(
        "app.routers.registrations.secrets.token_urlsafe",
        lambda _: next(tokens),
    )

    original_commit = db_session.commit
    factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    race_inserted = False

    async def flaky_commit():
        nonlocal race_inserted
        if race_inserted:
            await original_commit()
            return

        async with factory() as other_session:
            other_session.add(
                ReservationAccessToken(
                    id="rat-race",
                    email="jean@example.com",
                    token_hash=hashlib.sha256(b"guest-access-token-first").hexdigest(),
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
                )
            )
            await other_session.commit()

        race_inserted = True
        raise IntegrityError("INSERT", {}, Exception("duplicate key value violates unique constraint"))

    monkeypatch.setattr(db_session, "commit", flaky_commit)

    response = await client.post("/api/registrations/my/request", json={"email": "jean@example.com"})

    assert response.status_code == 202
    token_rows = (
        await db_session.execute(select(ReservationAccessToken))
    ).scalars().all()
    assert len(token_rows) == 1
    assert token_rows[0].email == "jean@example.com"
    assert token_rows[0].token_hash == hashlib.sha256(
        b"guest-access-token-first"
    ).hexdigest()


@pytest.mark.anyio
async def test_my_reservations_access_token_reuse(client, monkeypatch):
    """A valid token can be used more than once within its TTL window."""
    token = "guest-access-token-12345"
    monkeypatch.setattr("app.routers.reservations.secrets.token_urlsafe", lambda _: token)

    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201

    r = await client.post("/api/reservations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 202

    first = await client.post("/api/reservations/my/access", json={"token": token})
    second = await client.post("/api/reservations/my/access", json={"token": token})

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(first.json()) == 1
    assert len(second.json()) == 1


@pytest.mark.anyio
async def test_my_reservations_request_rate_limited(client, monkeypatch):
    """After exceeding the per-IP request limit the endpoint returns 429."""
    # Reset the in-process rate limiter state so prior tests don't affect this one.
    monkeypatch.setattr(reservations_module, "_rate_limit_buckets", {})

    limit = reservations_module._RATE_LIMIT_MAX_REQUESTS
    for _ in range(limit):
        r = await client.post("/api/reservations/my/request", json={"email": "jean@example.com"})
        assert r.status_code == 202

    r = await client.post("/api/reservations/my/request", json={"email": "jean@example.com"})
    assert r.status_code == 429


# ---------------------------------------------------------------------------
# Exhibitors API
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_exhibitors_require_admin(client):
    r = await client.get("/api/exhibitors")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_exhibitor_crud(client):
    # Create producer
    r = await client.post(
        "/api/exhibitors",
        json={
            "name": "Maison Bollinger",
            "image": "/img/bollinger.jpg",
            "website": "https://bollinger.com",
            "type": "producer",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    producer = r.json()
    assert producer["name"] == "Maison Bollinger"
    assert producer["type"] == "producer"
    assert producer["contact_person"] is None
    producer_id = producer["id"]

    # Create sponsor
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Acme Corp", "type": "sponsor"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    assert r.json()["type"] == "sponsor"

    # List all
    r = await client.get("/api/exhibitors", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()) == 2

    # Filter by type
    r = await client.get(
        "/api/exhibitors", params={"type": "producer"}, headers=ADMIN_HEADERS
    )
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Maison Bollinger"

    # Update
    r = await client.put(
        f"/api/exhibitors/{producer_id}",
        json={"website": "https://bollinger.fr"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["website"] == "https://bollinger.fr"

    # Delete
    r = await client.delete(f"/api/exhibitors/{producer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get("/api/exhibitors", headers=ADMIN_HEADERS)
    assert len(r.json()) == 1


@pytest.mark.anyio
async def test_exhibitor_with_contact_person(client):
    """An exhibitor can reference a Person as contact; summary is embedded."""
    r = await client.post(
        "/api/people",
        json={"name": "Alice Contact", "email": "alice@example.com"},
        headers=ADMIN_HEADERS,
    )
    person_id = r.json()["id"]

    r = await client.post(
        "/api/exhibitors",
        json={
            "name": "Fine Wines Ltd",
            "type": "vendor",
            "contact_person_id": person_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["contact_person"]["name"] == "Alice Contact"
    assert data["contact_person_id"] == person_id

    # Remove contact via update (set to null)
    exhibitor_id = data["id"]
    r = await client.put(
        f"/api/exhibitors/{exhibitor_id}",
        json={"contact_person_id": None},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["contact_person"] is None


@pytest.mark.anyio
async def test_exhibitor_invalid_contact_person(client):
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bad Corp", "contact_person_id": "nonexistent-id"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Areas API
# ---------------------------------------------------------------------------


async def _create_layout_prerequisites(client):
    """Helper: create venue → room → layout; return layout_id."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS
    )
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts", json={"room_id": room_id, "day_id": 1}, headers=ADMIN_HEADERS
    )
    return r.json()["id"]


@pytest.mark.anyio
async def test_areas_require_admin(client):
    r = await client.get("/api/areas")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_area_crud(client):
    layout_id = await _create_layout_prerequisites(client)

    payload = {
        "layout_id": layout_id,
        "label": "DJ Stage",
        "icon": "bi-music-note-beamed",
        "width_m": 3.0,
        "length_m": 2.0,
        "x": 25.0,
        "y": 50.0,
    }

    r = await client.post("/api/areas", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    area = r.json()
    assert area["label"] == "DJ Stage"
    assert area["icon"] == "bi-music-note-beamed"
    assert area["exhibitor_id"] is None
    area_id = area["id"]

    # List (filter by layout)
    r = await client.get(
        "/api/areas", params={"layout_id": layout_id}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    # Get single
    r = await client.get(f"/api/areas/{area_id}", headers=ADMIN_HEADERS)
    assert r.json()["label"] == "DJ Stage"

    # Update position
    r = await client.put(
        f"/api/areas/{area_id}",
        json={"x": 40.0, "label": "Main Stage"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["x"] == 40.0
    assert r.json()["label"] == "Main Stage"

    # Delete
    r = await client.delete(f"/api/areas/{area_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    r = await client.get(
        "/api/areas", params={"layout_id": layout_id}, headers=ADMIN_HEADERS
    )
    assert r.json() == []


@pytest.mark.anyio
async def test_area_linked_to_exhibitor(client):
    """An area can be assigned to an exhibitor; clearing works too."""
    layout_id = await _create_layout_prerequisites(client)
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Oyster Bar", "type": "vendor"},
        headers=ADMIN_HEADERS,
    )
    exhibitor_id = r.json()["id"]

    r = await client.post(
        "/api/areas",
        json={
            "layout_id": layout_id,
            "label": "Oyster Stand",
            "exhibitor_id": exhibitor_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    area_id = r.json()["id"]
    assert r.json()["exhibitor_id"] == exhibitor_id

    # Clear exhibitor assignment
    r = await client.put(
        f"/api/areas/{area_id}", json={"exhibitor_id": None}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert r.json()["exhibitor_id"] is None


@pytest.mark.anyio
async def test_area_invalid_layout(client):
    r = await client.post(
        "/api/areas",
        json={"layout_id": "nonexistent", "label": "Ghost Area"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Editions API — public active endpoint
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_active_edition_not_found(client):
    r = await client.get("/api/editions/active")
    assert r.status_code == 404


@pytest.mark.anyio
async def test_active_edition_returns_embedded_venue_and_exhibitors(client):
    # Create venue
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]

    # Create a producer and a sponsor
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Bollinger", "type": "producer"},
        headers=ADMIN_HEADERS,
    )
    producer_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Acme", "type": "sponsor"},
        headers=ADMIN_HEADERS,
    )
    sponsor_id = r.json()["id"]

    # Create active edition
    r = await client.post(
        "/api/editions",
        json={
            "id": "2026",
            "year": 2026,
            "month": "march",
            "friday": "2026-03-20",
            "saturday": "2026-03-21",
            "sunday": "2099-03-22",  # far future so it's "upcoming"
            "venue_id": venue_id,
            "exhibitors": [producer_id, sponsor_id],
            "active": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    # Public endpoint — no auth required
    r = await client.get("/api/editions/active")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "2026"
    assert data["venue"]["name"] == "Test Venue"
    assert len(data["producers"]) == 1
    assert data["producers"][0]["name"] == "Bollinger"
    assert len(data["sponsors"]) == 1
    assert data["sponsors"][0]["name"] == "Acme"


@pytest.mark.anyio
async def test_edition_rejects_vendor_exhibitors(client):
    """Vendor-type exhibitors must not be linked to editions."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post(
        "/api/exhibitors",
        json={"name": "Food Vendor", "type": "vendor"},
        headers=ADMIN_HEADERS,
    )
    vendor_id = r.json()["id"]

    r = await client.post(
        "/api/editions",
        json={
            "id": "2026v",
            "year": 2026,
            "month": "march",
            "friday": "2026-03-20",
            "saturday": "2026-03-21",
            "sunday": "2026-03-22",
            "venue_id": venue_id,
            "exhibitors": [vendor_id],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400
    assert "vendor" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Admin reservation creation
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_admin_create_reservation(client):
    """Admin endpoint creates reservation directly for a known person."""
    r = await client.post(
        "/api/people",
        json={
            "name": "Pierre Admin",
            "email": "pierre@example.com",
            "phone": "+32499111222",
        },
        headers=ADMIN_HEADERS,
    )
    person_id = r.json()["id"]

    r = await client.post(
        "/api/reservations/admin",
        json={
            "person_id": person_id,
            "event_id": "event-fri",
            "event_title": "Vrijdagavond",
            "guest_count": 3,
            "status": "confirmed",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["person_id"] == person_id
    assert data["person"]["name"] == "Pierre Admin"
    assert data["status"] == "confirmed"
    assert "check_in_token" not in data


@pytest.mark.anyio
async def test_admin_create_reservation_requires_auth(client):
    r = await client.post(
        "/api/reservations/admin",
        json={"person_id": "x", "event_id": "e", "event_title": "t", "guest_count": 1},
    )
    assert r.status_code == 401


@pytest.mark.anyio
async def test_admin_create_reservation_person_not_found(client):
    r = await client.post(
        "/api/reservations/admin",
        json={
            "person_id": "nonexistent",
            "event_id": "event-fri",
            "event_title": "Vrijdagavond",
            "guest_count": 1,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


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
        json={
            "name": "T-Clear",
            "capacity": 4,
            "table_type_id": tt_id,
            "layout_id": layout_id,
        },
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


@pytest.mark.anyio
async def test_table_reservation_ids_computed_from_reservation_table_id(client):
    """reservation_ids on a table must reflect Reservation.table_id after reload.

    Regression test: previously Table.reservation_ids was a denormalized JSON
    array that was never updated when a reservation was assigned via
    PUT /api/reservations/{id}.  On a fresh GET /api/tables the array appeared
    empty, making the layout editor lose all assignments after a page reload.
    """
    # Create a reservation
    r = await client.post("/api/reservations", json=VALID_RESERVATION)
    assert r.status_code == 201
    res_id = r.json()["id"]

    # Build prerequisites: venue → room → layout + table_type
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
        json={
            "name": "T-Persist",
            "capacity": 4,
            "table_type_id": tt_id,
            "layout_id": layout_id,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    tbl_id = r.json()["id"]
    # A new table has no reservations yet
    assert r.json()["reservation_ids"] == []

    # Assign the reservation to the table via the reservation endpoint
    r = await client.put(
        f"/api/reservations/{res_id}",
        json={"table_id": tbl_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["table_id"] == tbl_id

    # GET /api/tables must now reflect the assignment without any extra call
    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    tables = r.json()
    tbl = next(t for t in tables if t["id"] == tbl_id)
    assert res_id in tbl["reservation_ids"], (
        "reservation_ids should be computed from Reservation.table_id on every GET"
    )

    # GET /api/tables/{id} must also reflect the assignment
    r = await client.get(f"/api/tables/{tbl_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert res_id in r.json()["reservation_ids"]

    # After clearing the table assignment the list must also update
    r = await client.put(
        f"/api/reservations/{res_id}",
        json={"table_id": None},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    tbl = next(t for t in r.json() if t["id"] == tbl_id)
    assert tbl["reservation_ids"] == []


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
        "national_register_number": "91010112345",
        "eid_document_number": "BEX123456",
        "active": True,
        "help_periods": [
            {
                "first_help_day": "2024-03-15",
                "last_help_day": "2024-03-17",
            },
            {
                "first_help_day": "2025-10-10",
                "last_help_day": None,
            },
        ],
    }

    r = await client.post("/api/volunteers", json=payload, headers=ADMIN_HEADERS)
    assert r.status_code == 201
    volunteer = r.json()
    assert volunteer["name"] == "Sofie De Smet"
    assert len(volunteer["help_periods"]) == 2

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
        json={
            "address": "Nieuwe Steenweg 8, 8400 Oostende",
            "active": True,
            "help_periods": [
                {
                    "first_help_day": "2024-03-15",
                    "last_help_day": "2024-03-17",
                },
                {
                    "first_help_day": "2025-03-21",
                    "last_help_day": "2025-03-23",
                },
                {
                    "first_help_day": "2025-10-10",
                    "last_help_day": None,
                },
            ],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["address"] == "Nieuwe Steenweg 8, 8400 Oostende"
    assert r.json()["active"] is True
    assert len(r.json()["help_periods"]) == 3

    r = await client.put(
        f"/api/volunteers/{volunteer_id}",
        json={
            "help_periods": [
                {
                    "first_help_day": "2025-10-11",
                    "last_help_day": "2025-10-10",
                }
            ]
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 422

    r = await client.delete(f"/api/volunteers/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    # Volunteer role is removed — endpoint returns 404.
    r = await client.get(f"/api/volunteers/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404

    # But the underlying person record still exists (soft archive).
    r = await client.get(f"/api/people/{volunteer_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert "volunteer" not in r.json()["roles"]


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
        "/api/people",
        params={"role": "treasurer", "active": "false"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    # Uncertain match (same email, different name) → new person created; admin sees duplicate.
    r = await client.post(
        "/api/reservations",
        json={**VALID_RESERVATION, "email": "anne@example.com", "name": "A. Dupuis"},
    )
    assert r.status_code == 201
    assert r.json()["person_id"] != person_id

    r = await client.get(f"/api/people/{person_id}/reservations", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert (
        len(r.json()) == 0
    )  # uncertain reservation belongs to the newly-created person

    r = await client.delete(f"/api/people/{person_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204


@pytest.mark.anyio
async def test_reservation_auto_links_certain_person(client):
    """Same email + same name (case/whitespace insensitive) → reservation links to existing person."""
    bob_phone = "+32470123456"
    r = await client.post(
        "/api/people",
        json={"name": "Bob Martin", "email": "bob@example.com", "phone": bob_phone},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    bob_id = r.json()["id"]

    # Exact match on email + phone + name → auto-link
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "bob@example.com",
            "phone": bob_phone,
            "name": "Bob Martin",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == bob_id

    # Case/whitespace variation still matches
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "BOB@EXAMPLE.COM",
            "phone": bob_phone,
            "name": "  bob  martin  ",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == bob_id

    # Different name → new person
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "bob@example.com",
            "phone": bob_phone,
            "name": "Robert Martin",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] != bob_id

    # Exact match again after a different-name reservation was created → still links to bob_id
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "bob@example.com",
            "phone": bob_phone,
            "name": "Bob Martin",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == bob_id

    # Different phone → new person (even if email + name match)
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "bob@example.com",
            "name": "Bob Martin",
            "phone": "+32499111111",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] != bob_id


@pytest.mark.anyio
async def test_person_reservations_include_event_payload(client):
    person = await client.post(
        "/api/people",
        json={"name": "Alice Event", "email": "alice.event@example.com"},
        headers=ADMIN_HEADERS,
    )
    assert person.status_code == 201
    person_id = person.json()["id"]

    event = await _create_event(client, edition_id="edition-person-reservations")
    reservation = await client.post(
        "/api/registrations/admin",
        json={
            "person_id": person_id,
            "event_id": event["id"],
            "guest_count": 1,
            "pre_orders": [],
            "notes": "",
            "accessibility_note": "",
            "status": "confirmed",
        },
        headers=ADMIN_HEADERS,
    )
    assert reservation.status_code == 201

    r = await client.get(f"/api/people/{person_id}/reservations", headers=ADMIN_HEADERS)

    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["event"]["id"] == event["id"]


@pytest.mark.anyio
async def test_normalize_phone_equivalent_inputs(client):
    """E.164-like normalization: +32 470..., 0032 470..., and 0470... all store as +32470123456."""
    base_phone_variants = [
        "+32 470 12 34 56",  # international with spaces
        "0032 470 12 34 56",  # IDD prefix 00
        "0470 12 34 56",  # local trunk 0
    ]
    canonical_phone = "+32470123456"

    # Create a person with the first variant
    r = await client.post(
        "/api/people",
        json={
            "name": "Phone Test",
            "email": "phonetest@example.com",
            "phone": base_phone_variants[0],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    person_id = r.json()["id"]
    assert r.json()["phone"] == canonical_phone

    # POST a reservation using the IDD variant → should link to the same person
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "phonetest@example.com",
            "phone": base_phone_variants[1],
            "name": "Phone Test",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == person_id

    # POST a reservation using the local trunk variant → should also link to the same person
    r = await client.post(
        "/api/reservations",
        json={
            **VALID_RESERVATION,
            "email": "phonetest@example.com",
            "phone": base_phone_variants[2],
            "name": "Phone Test",
        },
    )
    assert r.status_code == 201
    assert r.json()["person_id"] == person_id

    # Update a person using a local variant → stored in canonical form
    r = await client.put(
        f"/api/people/{person_id}",
        json={
            "name": "Phone Test",
            "email": "phonetest@example.com",
            "phone": base_phone_variants[2],
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["phone"] == canonical_phone


# ---------------------------------------------------------------------------
# People merge endpoint
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_merge_people_requires_auth(client):
    r = await client.post("/api/people/per_x/merge/per_y")
    assert r.status_code == 401


@pytest.mark.anyio
async def test_merge_people_not_found(client):
    r = await client.post(
        "/api/people/nonexistent/merge/also_nonexistent", headers=ADMIN_HEADERS
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_merge_people_canonical_not_found(client):
    """404 when canonical person ID does not exist."""
    r = await client.post(
        "/api/people",
        json={"name": "Real Person", "email": "real@example.com"},
        headers=ADMIN_HEADERS,
    )
    duplicate_id = r.json()["id"]
    r = await client.post(
        f"/api/people/nonexistent/merge/{duplicate_id}", headers=ADMIN_HEADERS
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_merge_people_duplicate_not_found(client):
    """404 when duplicate person ID does not exist."""
    r = await client.post(
        "/api/people",
        json={"name": "Canon Only", "email": "canon.only@example.com"},
        headers=ADMIN_HEADERS,
    )
    canonical_id = r.json()["id"]
    r = await client.post(
        f"/api/people/{canonical_id}/merge/nonexistent", headers=ADMIN_HEADERS
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_merge_people_self(client):
    r = await client.post(
        "/api/people",
        json={"name": "Alice", "email": "alice@example.com"},
        headers=ADMIN_HEADERS,
    )
    pid = r.json()["id"]
    r = await client.post(f"/api/people/{pid}/merge/{pid}", headers=ADMIN_HEADERS)
    assert r.status_code == 400


@pytest.mark.anyio
async def test_merge_people_repoints_reservations(client):
    """Reservations linked to duplicate are re-pointed to canonical after merge."""
    r = await client.post(
        "/api/people",
        json={
            "name": "Canon Person",
            "email": "canon@example.com",
            "phone": "+32470000001",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    canonical_id = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={
            "name": "Dup Person",
            "email": "dup@example.com",
            "phone": "+32470000002",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    dup_id = r.json()["id"]

    # Create a reservation linked to the duplicate
    r = await client.post(
        "/api/reservations/admin",
        json={
            "person_id": dup_id,
            "event_id": "event-fri",
            "event_title": "Test",
            "guest_count": 1,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    res_id = r.json()["id"]

    # Merge dup into canonical
    r = await client.post(
        f"/api/people/{canonical_id}/merge/{dup_id}", headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    assert r.json()["id"] == canonical_id

    # Duplicate should be gone
    r = await client.get(f"/api/people/{dup_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404

    # Reservation should now belong to canonical
    r = await client.get(f"/api/reservations/{res_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["person_id"] == canonical_id


@pytest.mark.anyio
async def test_merge_people_repoints_exhibitor_contact(client):
    """Exhibitor contact_person_id is updated when its person is merged as duplicate."""
    r = await client.post(
        "/api/people",
        json={"name": "Main Person", "email": "main@example.com"},
        headers=ADMIN_HEADERS,
    )
    canonical_id = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={"name": "Old Contact", "email": "old@example.com"},
        headers=ADMIN_HEADERS,
    )
    dup_id = r.json()["id"]

    r = await client.post(
        "/api/exhibitors",
        json={"name": "Wine Co", "type": "producer", "contact_person_id": dup_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    exhibitor_id = r.json()["id"]

    # Merge dup into canonical
    r = await client.post(
        f"/api/people/{canonical_id}/merge/{dup_id}", headers=ADMIN_HEADERS
    )
    assert r.status_code == 200

    # Exhibitor should now point to canonical
    r = await client.get("/api/exhibitors", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    exhibitor = next((e for e in r.json() if e["id"] == exhibitor_id), None)
    assert exhibitor is not None
    assert exhibitor["contact_person_id"] == canonical_id


@pytest.mark.anyio
async def test_merge_people_identity_conflict(client):
    """409 is raised when both persons have conflicting unique identity fields."""
    r = await client.post(
        "/api/people",
        json={
            "name": "Person A",
            "email": "a@example.com",
            "national_register_number": "12345",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    id_a = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={
            "name": "Person B",
            "email": "b@example.com",
            "national_register_number": "99999",
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    id_b = r.json()["id"]

    r = await client.post(f"/api/people/{id_a}/merge/{id_b}", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert "national register number" in r.json()["detail"]


@pytest.mark.anyio
async def test_merge_people_fills_blank_fields(client):
    """Blank string fields on canonical are filled from duplicate."""
    r = await client.post(
        "/api/people",
        json={"name": "Canon", "email": "canon2@example.com", "phone": ""},
        headers=ADMIN_HEADERS,
    )
    canonical_id = r.json()["id"]

    r = await client.post(
        "/api/people",
        json={"name": "Dup", "email": "dup2@example.com", "phone": "+32470111222"},
        headers=ADMIN_HEADERS,
    )
    dup_id = r.json()["id"]

    r = await client.post(
        f"/api/people/{canonical_id}/merge/{dup_id}", headers=ADMIN_HEADERS
    )
    assert r.status_code == 200
    # Phone from duplicate should be adopted on canonical
    assert r.json()["phone"] == "+32470111222"


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

    r = await client.get("/api/members", params={"q": "spui"}, headers=ADMIN_HEADERS)
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
