"""Unit tests for the FastMCP v3 MCP server backend.

Tests are organised as:
- Role resolution
- Server creation / tool registration
- Tool happy paths (with mocked DB session)
- Edge cases: empty active edition, missing table/guest
- PII filtering by role
- Representative order/delivery payloads

The DB is mocked using an in-memory SQLite-backed async engine so no running
PostgreSQL instance is required for these unit tests.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

import app.mcp_server as mcp_module
from app.mcp_server import (
    ROLE_ADMIN,
    ROLE_PUBLIC,
    ROLE_VOLUNTEER,
    ChampagneFestivalMcpBackend,
    create_mcp_server,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_access_token(roles: list[str]) -> Any:
    """Return a minimal fake FastMCP AccessToken with realm_access roles."""
    return SimpleNamespace(claims={"realm_access": {"roles": roles}})


def _make_session_factory(db: Any):
    """Return a minimal async context-manager session factory."""

    class _CM:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *_):
            pass

    class _Factory:
        def __call__(self):
            return _CM()

    return _Factory()


def _make_edition(
    *,
    edition_id: str = "2026-march",
    year: int = 2026,
    month: str = "march",
    active: bool = True,
    events: list | None = None,
    venue_id: str = "venue-1",
) -> Any:
    ed = MagicMock()
    ed.id = edition_id
    ed.year = year
    ed.month = month
    ed.active = active
    ed.venue_id = venue_id
    ed.edition_type = "festival"
    ed.events = events or []
    ed.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    ed.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    return ed


def _make_event(
    *,
    event_id: str = "ev-1",
    edition_id: str = "2026-march",
    event_date: date = date(2026, 3, 21),
    active: bool = True,
) -> Any:
    ev = MagicMock()
    ev.id = event_id
    ev.edition_id = edition_id
    ev.title = "Vrijdagavond"
    ev.description = "Festival evening"
    ev.date = event_date
    ev.start_time = "18:00"
    ev.end_time = "22:00"
    ev.category = "festival"
    ev.registration_required = True
    ev.max_capacity = None
    ev.active = active
    ev.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    ev.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    return ev


def _make_person(
    *,
    person_id: str = "per-1",
    name: str = "Jean Dupont",
    email: str = "jean@example.com",
    phone: str = "+32499000000",
    address: str = "Rue de la Paix 1",
    roles: list | None = None,
    club_name: str = "",
    notes: str = "",
) -> Any:
    p = MagicMock()
    p.id = person_id
    p.name = name
    p.email = email
    p.phone = phone
    p.address = address
    p.roles = roles or []
    p.club_name = club_name
    p.notes = notes
    return p


def _make_registration(
    *,
    reg_id: str = "reg-1",
    person_id: str = "per-1",
    event_id: str = "ev-1",
    table_id: str | None = "tbl-1",
    guest_count: int = 2,
    checked_in: bool = False,
    checked_in_at: datetime | None = None,
    strap_issued: bool = False,
    status: str = "confirmed",
    payment_status: str = "paid",
    pre_orders: list | None = None,
    accessibility_note: str = "",
) -> Any:
    r = MagicMock()
    r.id = reg_id
    r.person_id = person_id
    r.event_id = event_id
    r.table_id = table_id
    r.guest_count = guest_count
    r.checked_in = checked_in
    r.checked_in_at = checked_in_at
    r.strap_issued = strap_issued
    r.status = status
    r.payment_status = payment_status
    r.accessibility_note = accessibility_note
    r.pre_orders = (
        pre_orders
        if pre_orders is not None
        else [
            {
                "product_id": "champ-std",
                "name": "Standard Champagne",
                "quantity": 2,
                "delivered_quantity": 0,
                "price": 65.0,
                "category": "champagne",
                "delivered": False,
            }
        ]
    )
    return r


def _make_table(
    *,
    table_id: str = "tbl-1",
    name: str = "Table A",
    capacity: int = 6,
    layout_id: str = "lay-1",
) -> Any:
    t = MagicMock()
    t.id = table_id
    t.name = name
    t.capacity = capacity
    t.layout_id = layout_id
    return t


def _make_layout(
    *,
    layout_id: str = "lay-1",
    edition_id: str = "2026-march",
    room_id: str = "room-1",
    day_id: int = 1,
) -> Any:
    lay = MagicMock()
    lay.id = layout_id
    lay.edition_id = edition_id
    lay.room_id = room_id
    lay.day_id = day_id
    room = MagicMock()
    room.id = room_id
    room.name = "Main Hall"
    lay.room = room
    return lay


def _make_venue(*, venue_id: str = "venue-1", name: str = "Salle des Fêtes") -> Any:
    v = MagicMock()
    v.id = venue_id
    v.name = name
    return v


def _make_db_execute(rows_by_call: list[Any]):
    """Return a mock db whose execute() returns successive rows."""
    call_count = [0]

    async def _execute(_stmt):
        idx = min(call_count[0], len(rows_by_call) - 1)
        call_count[0] += 1
        result = MagicMock()
        rows = rows_by_call[idx]
        if isinstance(rows, list):
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=rows)
            result.scalars = MagicMock(return_value=scalars)
            result.scalar_one_or_none = MagicMock(return_value=rows[0] if rows else None)
            result.all = MagicMock(return_value=[(r,) for r in rows])
        else:
            # Single value
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=[rows] if rows else [])
            result.scalars = MagicMock(return_value=scalars)
            result.scalar_one_or_none = MagicMock(return_value=rows)
            result.all = MagicMock(return_value=[])
        return result

    db = MagicMock()
    db.execute = _execute
    return db


# ---------------------------------------------------------------------------
# Role resolution
# ---------------------------------------------------------------------------


class TestResolveRole:
    def test_no_token_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_admin_roles_returns_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = _make_access_token(["admin"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_ADMIN

    def test_volunteer_role_returns_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_VOLUNTEER

    def test_admin_takes_precedence_over_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = _make_access_token(["volunteer", "admin"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_ADMIN

    def test_unknown_role_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = _make_access_token(["visitor"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_missing_realm_access_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={})
        with patch.object(mcp_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_non_dict_realm_access_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"realm_access": "not-a-dict"})
        with patch.object(mcp_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_roles_not_a_list_returns_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = SimpleNamespace(claims={"realm_access": {"roles": "admin"}})
        with patch.object(mcp_module, "get_access_token", return_value=token):
            assert backend._resolve_role() == ROLE_PUBLIC

    def test_require_volunteer_raises_for_public(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            backend._require_volunteer()

    def test_require_volunteer_passes_for_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            role = backend._require_volunteer()
        assert role == ROLE_VOLUNTEER

    def test_require_volunteer_passes_for_admin(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = _make_access_token(["admin"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            role = backend._require_volunteer()
        assert role == ROLE_ADMIN


# ---------------------------------------------------------------------------
# Server creation / tool registration
# ---------------------------------------------------------------------------


class TestCreateMcpServer:
    def test_create_mcp_server_returns_fastmcp(self):
        from fastmcp import FastMCP

        factory = MagicMock()
        mcp = create_mcp_server(session_factory=factory)
        assert isinstance(mcp, FastMCP)

    def test_create_mcp_server_without_factory_uses_default(self):
        from fastmcp import FastMCP

        mcp = create_mcp_server()
        assert isinstance(mcp, FastMCP)

    @pytest.mark.anyio
    async def test_create_mcp_server_registers_expected_tools(self):
        factory = MagicMock()
        mcp = create_mcp_server(session_factory=factory)
        # FastMCP list_tools() is async and returns Tool objects
        tools = await mcp.list_tools()
        tool_names = {tool.name for tool in tools}
        expected = {
            "get_active_edition",
            "list_editions",
            "get_event_schedule",
            "get_venue_plan_summary",
            "find_guest",
            "get_guest_registration",
            "get_table_seating",
            "get_table_order_summary",
            "get_guest_order_status",
            "get_champagne_delivery_summary",
            "get_undelivered_champagne_by_table",
            "get_check_in_summary",
        }
        assert expected == tool_names


# ---------------------------------------------------------------------------
# list_editions
# ---------------------------------------------------------------------------


class TestListEditions:
    @pytest.mark.anyio
    async def test_returns_editions_in_chronological_order(self):
        past_event = _make_event(event_id="ev-past", event_date=date(2025, 10, 18))
        upcoming_event = _make_event(event_id="ev-upcoming", event_date=date(2026, 3, 21))
        past = _make_edition(edition_id="2025-october", year=2025, month="october", active=False, events=[past_event])
        upcoming = _make_edition(events=[upcoming_event])

        db = _make_db_execute([[upcoming, past]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.list_editions()

        assert result["count"] == 2
        assert result["editions"] == [
            {
                "id": "2025-october",
                "year": 2025,
                "type": "festival",
                "date_range": {"start": "2025-10-18", "end": "2025-10-18"},
                "is_active": False,
            },
            {
                "id": "2026-march",
                "year": 2026,
                "type": "festival",
                "date_range": {"start": "2026-03-21", "end": "2026-03-21"},
                "is_active": True,
            },
        ]

    @pytest.mark.anyio
    async def test_returns_empty_list_when_no_editions_exist(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.list_editions()
        assert result == {"editions": [], "count": 0}


# ---------------------------------------------------------------------------
# get_active_edition
# ---------------------------------------------------------------------------


class TestGetActiveEdition:
    @pytest.mark.anyio
    async def test_returns_active_edition(self):
        ev = _make_event(event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])

        db = _make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_active_edition()
        ae = result["active_edition"]
        assert ae["id"] == "2026-march"
        assert ae["year"] == 2026
        assert ae["month"] == "march"
        assert ae["event_count"] == 1
        assert "2099-03-21" in ae["dates"]

    @pytest.mark.anyio
    async def test_returns_empty_when_no_active_editions(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_active_edition()
        assert result["active_edition"] is None
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_empty_when_all_editions_past(self):
        ev = _make_event(event_date=date(2000, 1, 1))
        edition = _make_edition(events=[ev])
        db = _make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_active_edition()
        assert result["active_edition"] is None

    @pytest.mark.anyio
    async def test_edition_without_events_treated_as_no_upcoming(self):
        edition = _make_edition(events=[])
        db = _make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_active_edition()
        assert result["active_edition"] is None


# ---------------------------------------------------------------------------
# get_event_schedule
# ---------------------------------------------------------------------------


class TestGetEventSchedule:
    @pytest.mark.anyio
    async def test_returns_events_for_active_edition(self):
        ev1 = _make_event(event_id="ev-1", event_date=date(2099, 3, 21))
        ev2 = _make_event(event_id="ev-2", event_date=date(2099, 3, 22))
        edition = _make_edition(events=[ev1, ev2])

        db = _make_db_execute([[edition], [edition]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_event_schedule()
        assert result["edition_id"] == "2026-march"
        assert len(result["events"]) == 2

    @pytest.mark.anyio
    async def test_returns_events_for_specific_edition(self):
        ev = _make_event(event_id="ev-1", event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])

        db = _make_db_execute([[edition]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_event_schedule(edition_id="2026-march")
        assert result["edition_id"] == "2026-march"
        assert len(result["events"]) == 1
        assert result["events"][0]["id"] == "ev-1"

    @pytest.mark.anyio
    async def test_returns_empty_when_edition_not_found(self):
        db = _make_db_execute([[None]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_event_schedule(edition_id="nonexistent")
        assert result["events"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_empty_when_no_active_edition(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_event_schedule()
        assert result["events"] == []


# ---------------------------------------------------------------------------
# find_guest
# ---------------------------------------------------------------------------


class TestFindGuest:
    @pytest.mark.anyio
    async def test_find_guest_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.find_guest(name="Jean")

    @pytest.mark.anyio
    async def test_find_guest_without_params_returns_empty(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.find_guest()
        assert result["guests"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_find_guest_returns_results_for_volunteer(self):
        person = _make_person(name="Jean Dupont", email="jean@example.com")
        db = _make_db_execute([[person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.find_guest(name="Jean")
        assert len(result["guests"]) == 1
        g = result["guests"][0]
        assert g["name"] == "Jean Dupont"
        assert "email" in g
        assert "phone" in g
        # Volunteer should NOT see address/notes
        assert "address" not in g
        assert "notes" not in g

    @pytest.mark.anyio
    async def test_find_guest_admin_sees_full_pii(self):
        person = _make_person(
            name="Jean Dupont",
            email="jean@example.com",
            address="Rue de la Paix 1",
            notes="VIP",
        )
        db = _make_db_execute([[person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["admin"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.find_guest(email="jean@example.com")
        g = result["guests"][0]
        assert g["address"] == "Rue de la Paix 1"
        assert g["notes"] == "VIP"


# ---------------------------------------------------------------------------
# get_guest_registration
# ---------------------------------------------------------------------------


class TestGetGuestRegistration:
    @pytest.mark.anyio
    async def test_get_guest_registration_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_guest_registration("reg-1")

    @pytest.mark.anyio
    async def test_get_guest_registration_not_found(self):
        db = _make_db_execute([[None], []])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("nonexistent")
        assert result["registration"] is None
        assert "message" in result

    @pytest.mark.anyio
    async def test_get_guest_registration_returns_data(self):
        reg = _make_registration()
        person = _make_person()
        db = _make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("reg-1")
        r = result["registration"]
        assert r["id"] == "reg-1"
        assert r["person"]["name"] == "Jean Dupont"
        assert len(r["pre_orders"]) == 1
        order = r["pre_orders"][0]
        assert order["category"] == "champagne"
        assert order["delivered"] is False

    @pytest.mark.anyio
    async def test_volunteer_does_not_see_admin_only_fields(self):
        reg = _make_registration()
        person = _make_person(address="Rue 1", notes="VIP")
        db = _make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("reg-1")
        p = result["registration"]["person"]
        assert "address" not in p
        assert "notes" not in p

    @pytest.mark.anyio
    async def test_admin_sees_all_fields(self):
        reg = _make_registration()
        person = _make_person(address="Rue 1", notes="VIP", club_name="Club A")
        db = _make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["admin"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("reg-1")
        p = result["registration"]["person"]
        assert p["address"] == "Rue 1"
        assert p["notes"] == "VIP"
        assert p["club_name"] == "Club A"


# ---------------------------------------------------------------------------
# get_table_seating
# ---------------------------------------------------------------------------


class TestGetTableSeating:
    @pytest.mark.anyio
    async def test_get_table_seating_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_table_seating(table_id="tbl-1")

    @pytest.mark.anyio
    async def test_get_specific_table_not_found(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_seating(table_id="nonexistent")
        assert result["tables"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_get_table_seating_returns_guests(self):
        table = _make_table()
        reg = _make_registration(checked_in=True, checked_in_at=datetime(2026, 3, 21, 19, 0, tzinfo=UTC))
        person = _make_person()

        # Sequence of execute() calls:
        # 1. SELECT Table WHERE id == table_id
        # 2. SELECT Registration WHERE table_id.in_
        # 3. SELECT Person WHERE id.in_
        db = _make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_seating(table_id="tbl-1")
        assert len(result["tables"]) == 1
        t = result["tables"][0]
        assert t["table_id"] == "tbl-1"
        assert len(t["guests"]) == 1
        g = t["guests"][0]
        assert g["name"] == "Jean Dupont"
        assert g["checked_in"] is True

    @pytest.mark.anyio
    async def test_no_active_edition_when_no_table_id(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_seating()
        assert result["tables"] == []


# ---------------------------------------------------------------------------
# get_table_order_summary
# ---------------------------------------------------------------------------


class TestGetTableOrderSummary:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_table_order_summary("tbl-1")

    @pytest.mark.anyio
    async def test_table_not_found(self):
        db = _make_db_execute([[None]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("nonexistent")
        assert result["registrations"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_order_summary(self):
        table = _make_table()
        reg = _make_registration(
            pre_orders=[
                {
                    "product_id": "champ-std",
                    "name": "Standard",
                    "quantity": 2,
                    "price": 65.0,
                    "category": "champagne",
                    "delivered": False,
                },
                {
                    "product_id": "food-1",
                    "name": "Cheese Board",
                    "quantity": 1,
                    "price": 15.0,
                    "category": "food",
                    "delivered": True,
                },
            ]
        )
        person = _make_person()
        db = _make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("tbl-1")
        assert result["table_id"] == "tbl-1"
        assert len(result["registrations"]) == 1
        r = result["registrations"][0]
        assert r["order_count"] == 2
        assert r["ordered_quantity_total"] == 3
        assert r["delivered_quantity_total"] == 1
        assert r["remaining_quantity_total"] == 2
        assert r["all_delivered"] is False

    @pytest.mark.anyio
    async def test_all_delivered_true_when_all_orders_delivered(self):
        table = _make_table()
        reg = _make_registration(
            pre_orders=[
                {
                    "product_id": "champ-std",
                    "name": "Standard",
                    "quantity": 2,
                    "price": 65.0,
                    "category": "champagne",
                    "delivered": True,
                },
            ]
        )
        person = _make_person()
        db = _make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("tbl-1")
        assert result["registrations"][0]["all_delivered"] is True

    @pytest.mark.anyio
    async def test_volunteer_does_not_see_person_id(self):
        table = _make_table()
        reg = _make_registration()
        person = _make_person()
        db = _make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("tbl-1")
        assert result["registrations"][0]["person_id"] is None

    @pytest.mark.anyio
    async def test_admin_sees_person_id(self):
        table = _make_table()
        reg = _make_registration()
        person = _make_person()
        db = _make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["admin"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("tbl-1")
        assert result["registrations"][0]["person_id"] == "per-1"


# ---------------------------------------------------------------------------
# get_guest_order_status
# ---------------------------------------------------------------------------


class TestGetGuestOrderStatus:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_guest_order_status("reg-1")

    @pytest.mark.anyio
    async def test_registration_not_found(self):
        db = _make_db_execute([[None], []])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_guest_order_status("nonexistent")
        assert result["orders"] == []

    @pytest.mark.anyio
    async def test_returns_delivery_state(self):
        reg = _make_registration(
            pre_orders=[
                {
                    "product_id": "champ-std",
                    "name": "Standard",
                    "quantity": 2,
                    "price": 65.0,
                    "category": "champagne",
                    "delivered": False,
                },
                {
                    "product_id": "champ-prem",
                    "name": "Premium",
                    "quantity": 1,
                    "price": 90.0,
                    "category": "champagne",
                    "delivered": True,
                },
            ]
        )
        person = _make_person()
        db = _make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_guest_order_status("reg-1")
        assert result["champagne_lines_total"] == 2
        assert result["champagne_lines_delivered"] == 1
        assert result["champagne_lines_pending"] == 1
        assert result["champagne_quantity_ordered"] == 3
        assert result["champagne_quantity_delivered"] == 1
        assert result["champagne_quantity_pending"] == 2

    @pytest.mark.anyio
    async def test_non_champagne_orders_excluded_from_champagne_counts(self):
        reg = _make_registration(
            pre_orders=[
                {
                    "product_id": "food-1",
                    "name": "Cheese Board",
                    "quantity": 1,
                    "price": 15.0,
                    "category": "food",
                    "delivered": False,
                },
            ]
        )
        person = _make_person()
        db = _make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_guest_order_status("reg-1")
        assert result["champagne_lines_total"] == 0
        assert len(result["orders"]) == 1  # food order still shown


# ---------------------------------------------------------------------------
# get_champagne_delivery_summary
# ---------------------------------------------------------------------------


class TestGetChampagneDeliverySummary:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_champagne_delivery_summary()

    @pytest.mark.anyio
    async def test_no_active_edition(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_champagne_delivery_summary()
        assert result["products"] == []

    @pytest.mark.anyio
    async def test_aggregates_delivery_by_product(self):
        ev = _make_event(event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])
        reg1 = _make_registration(
            reg_id="reg-1",
            pre_orders=[
                {
                    "product_id": "champ-std",
                    "name": "Standard",
                    "quantity": 2,
                    "price": 65.0,
                    "category": "champagne",
                    "delivered": True,
                },
            ],
        )
        reg2 = _make_registration(
            reg_id="reg-2",
            pre_orders=[
                {
                    "product_id": "champ-std",
                    "name": "Standard",
                    "quantity": 3,
                    "delivered_quantity": 1,
                    "price": 65.0,
                    "category": "champagne",
                    "delivered": False,
                },
            ],
        )
        db = _make_db_execute([[edition], [reg1, reg2]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_champagne_delivery_summary()
        assert result["edition_id"] == "2026-march"
        products = {p["product_id"]: p for p in result["products"]}
        assert "champ-std" in products
        p = products["champ-std"]
        assert p["ordered_lines"] == 2
        assert p["delivered_lines"] == 1
        assert p["pending_lines"] == 1
        assert p["partially_delivered_lines"] == 1
        assert p["ordered_quantity"] == 5
        assert p["delivered_quantity"] == 3
        assert p["pending_quantity"] == 2

    @pytest.mark.anyio
    async def test_non_champagne_items_excluded(self):
        ev = _make_event(event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])
        reg = _make_registration(
            pre_orders=[
                {
                    "product_id": "food-1",
                    "name": "Cheese",
                    "quantity": 1,
                    "price": 15.0,
                    "category": "food",
                    "delivered": False,
                },
            ]
        )
        db = _make_db_execute([[edition], [reg]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_champagne_delivery_summary()
        assert result["products"] == []


# ---------------------------------------------------------------------------
# get_undelivered_champagne_by_table
# ---------------------------------------------------------------------------


class TestGetUndeliveredChampagneByTable:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_undelivered_champagne_by_table()

    @pytest.mark.anyio
    async def test_no_active_edition(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_undelivered_champagne_by_table()
        assert result["tables"] == []

    @pytest.mark.anyio
    async def test_all_delivered_returns_empty_tables(self):
        ev = _make_event(event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])
        reg = _make_registration(
            pre_orders=[
                {
                    "product_id": "champ-std",
                    "name": "Standard",
                    "quantity": 1,
                    "price": 65.0,
                    "category": "champagne",
                    "delivered": True,
                },
            ]
        )
        db = _make_db_execute([[edition], [reg]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_undelivered_champagne_by_table()
        assert result["tables"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_tables_with_pending_orders(self):
        ev = _make_event(event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])
        reg = _make_registration(
            table_id="tbl-1",
            pre_orders=[
                {
                    "product_id": "champ-std",
                    "name": "Standard",
                    "quantity": 2,
                    "price": 65.0,
                    "category": "champagne",
                    "delivered": False,
                },
            ],
        )
        table = _make_table(table_id="tbl-1", name="Table A")
        db = _make_db_execute([[edition], [reg], [table]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_undelivered_champagne_by_table()
        assert len(result["tables"]) == 1
        t = result["tables"][0]
        assert t["table_id"] == "tbl-1"
        assert t["table_name"] == "Table A"
        assert t["pending_lines"] == 1
        assert t["pending_quantity"] == 2
        assert "reg-1" in t["pending_registration_ids"]


# ---------------------------------------------------------------------------
# get_check_in_summary
# ---------------------------------------------------------------------------


class TestGetCheckInSummary:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_check_in_summary()

    @pytest.mark.anyio
    async def test_no_active_edition(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_check_in_summary()
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_check_in_counts(self):
        ev = _make_event(event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])
        reg1 = _make_registration(reg_id="reg-1", guest_count=2, checked_in=True, strap_issued=True)
        reg2 = _make_registration(reg_id="reg-2", guest_count=3, checked_in=False)
        db = _make_db_execute([[edition], [reg1, reg2]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        token = _make_access_token(["volunteer"])
        with patch.object(mcp_module, "get_access_token", return_value=token):
            result = await backend.get_check_in_summary()
        assert result["total_registrations"] == 2
        assert result["checked_in"] == 1
        assert result["not_checked_in"] == 1
        assert result["total_guests"] == 5
        assert result["straps_issued"] == 1


# ---------------------------------------------------------------------------
# get_venue_plan_summary
# ---------------------------------------------------------------------------


class TestGetVenuePlanSummary:
    @pytest.mark.anyio
    async def test_returns_empty_when_no_active_edition(self):
        db = _make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_venue_plan_summary()
        assert result["rooms"] == []

    @pytest.mark.anyio
    async def test_returns_room_and_table_counts(self):
        ev = _make_event(event_date=date(2099, 3, 21))
        edition = _make_edition(events=[ev])
        layout = _make_layout()
        venue = _make_venue()
        # Mock execute returns: editions, venue, layouts, table counts
        # table counts are returned as tuples (layout_id, count)

        call_count = [0]

        async def _execute(_stmt):
            idx = call_count[0]
            call_count[0] += 1
            result = MagicMock()
            if idx == 0:
                # SELECT editions
                scalars = MagicMock()
                scalars.all = MagicMock(return_value=[edition])
                result.scalars = MagicMock(return_value=scalars)
            elif idx == 1:
                # SELECT venue
                result.scalar_one_or_none = MagicMock(return_value=venue)
            elif idx == 2:
                # SELECT layouts
                scalars = MagicMock()
                scalars.all = MagicMock(return_value=[layout])
                result.scalars = MagicMock(return_value=scalars)
            elif idx == 3:
                # SELECT table count
                result.all = MagicMock(return_value=[("lay-1", 5)])
            return result

        db = MagicMock()
        db.execute = _execute
        backend = ChampagneFestivalMcpBackend(_make_session_factory(db))
        result = await backend.get_venue_plan_summary()
        assert result["edition_id"] == "2026-march"
        assert result["venue_name"] == "Salle des Fêtes"
        assert result["total_tables"] == 5
        assert len(result["rooms"]) == 1
        assert result["rooms"][0]["room_name"] == "Main Hall"
        assert result["rooms"][0]["table_count"] == 5


# ---------------------------------------------------------------------------
# PII filtering integration
# ---------------------------------------------------------------------------


class TestPIIFiltering:
    def test_person_dict_public_has_no_pii(self):
        """Public role should not be able to use _person_dict (only volunteer+)."""
        # _person_dict is called internally with role; public should not reach it
        # but if it does, it would only return id and name
        person = _make_person()
        d = ChampagneFestivalMcpBackend._person_dict(person, role=ROLE_PUBLIC)
        assert "id" in d
        assert "name" in d
        assert "email" not in d
        assert "phone" not in d
        assert "address" not in d

    def test_person_dict_volunteer_shows_contact_not_sensitive(self):
        person = _make_person(address="Rue 1", notes="VIP")
        d = ChampagneFestivalMcpBackend._person_dict(person, role=ROLE_VOLUNTEER)
        assert "email" in d
        assert "phone" in d
        assert "address" not in d
        assert "notes" not in d
        assert "national_register_number" not in d
        assert "eid_document_number" not in d

    def test_person_dict_admin_shows_all_allowed_fields(self):
        person = _make_person(address="Rue 1", notes="VIP", club_name="Club A")
        d = ChampagneFestivalMcpBackend._person_dict(person, role=ROLE_ADMIN)
        assert "email" in d
        assert "phone" in d
        assert "address" in d
        assert "notes" in d
        assert "club_name" in d
        # Sensitive fields that should never appear
        assert "national_register_number" not in d
        assert "eid_document_number" not in d
