"""The volunteer/admin MCP tools for event day: guests, seating, orders, champagne delivery and check-in status."""

from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import MagicMock, patch

import pytest

from app.mcp.capabilities import ROLE_ADMIN, ROLE_PUBLIC, ROLE_VOLUNTEER
from app.mcp.server import (
    ChampagneFestivalMcpBackend,
)
from app.mcp.tools import base as mcp_base_module
from app.mcp.utils import person_dict
from tests.mcp_fakes import (
    make_access_token,
    make_db_execute,
    make_edition,
    make_event,
    make_person,
    make_registration,
    make_session_factory,
    make_table,
)

# ---------------------------------------------------------------------------
# find_guest
# ---------------------------------------------------------------------------


class TestFindGuest:
    @pytest.mark.anyio
    async def test_find_guest_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.find_guest(name="Jean")

    @pytest.mark.anyio
    async def test_find_guest_without_params_raises_validation_error(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with (
            patch.object(backend, "_require_volunteer", return_value="volunteer"),
            pytest.raises(ValueError, match="Provide at least one of 'name' or 'email' to search"),
        ):
            await backend.find_guest()

    @pytest.mark.anyio
    async def test_find_guest_with_whitespace_only_params_raises_validation_error(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with (
            patch.object(backend, "_require_volunteer", return_value="volunteer"),
            pytest.raises(ValueError, match="Provide at least one of 'name' or 'email' to search"),
        ):
            await backend.find_guest(name="  ", email="  ")

    @pytest.mark.anyio
    async def test_find_guest_returns_results_for_volunteer(self):
        person = make_person(name="Jean Dupont", email="jean@example.com")
        registration = make_registration()
        db = make_db_execute([[person], [registration]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.find_guest(name="Jean")
        assert len(result["guests"]) == 1
        g = result["guests"][0]
        assert g["name"] == "Jean Dupont"
        assert "email" in g
        assert "phone" in g
        assert g["registrations"][0]["registration_id"] == "reg-1"
        # Volunteer should NOT see address/notes
        assert "address" not in g
        assert "notes" not in g

    @pytest.mark.anyio
    async def test_find_guest_admin_sees_full_pii(self):
        person = make_person(
            name="Jean Dupont",
            email="jean@example.com",
            address="Rue de la Paix 1",
            notes="VIP",
        )
        db = make_db_execute([[person], []])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["admin"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
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
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_guest_registration("reg-1")

    @pytest.mark.anyio
    async def test_get_guest_registration_not_found(self):
        db = make_db_execute([[None], []])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("nonexistent")
        assert result["registration"] is None
        assert "message" in result

    @pytest.mark.anyio
    async def test_get_guest_registration_returns_data(self):
        reg = make_registration()
        person = make_person()
        db = make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("reg-1")
        r = result["registration"]
        assert r["id"] == "reg-1"
        assert r["person"]["name"] == "Jean Dupont"
        assert len(r["order_items"]) == 1
        order = r["order_items"][0]
        assert order["category"] == "champagne"
        assert order["delivered"] is False

    @pytest.mark.anyio
    async def test_volunteer_does_not_see_admin_only_fields(self):
        reg = make_registration()
        person = make_person(address="Rue 1", notes="VIP")
        db = make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("reg-1")
        p = result["registration"]["person"]
        assert "address" not in p
        assert "notes" not in p

    @pytest.mark.anyio
    async def test_admin_sees_all_fields(self):
        reg = make_registration()
        person = make_person(address="Rue 1", notes="VIP")
        db = make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["admin"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_guest_registration("reg-1")
        p = result["registration"]["person"]
        assert p["address"] == "Rue 1"
        assert p["notes"] == "VIP"


# ---------------------------------------------------------------------------
# get_table_seating
# ---------------------------------------------------------------------------


class TestGetTableSeating:
    @pytest.mark.anyio
    async def test_get_table_seating_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_table_seating(table_id="tbl-1")

    @pytest.mark.anyio
    async def test_get_specific_table_not_found(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_table_seating(table_id="nonexistent")
        assert result["tables"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_get_table_seating_returns_guests(self):
        table = make_table()
        reg = make_registration(checked_in=True, checked_in_at=datetime(2026, 3, 21, 19, 0, tzinfo=UTC))
        person = make_person()

        # Sequence of execute() calls:
        # 1. SELECT Table WHERE id == table_id
        # 2. SELECT Registration WHERE table_id.in_
        # 3. SELECT Person WHERE id.in_
        db = make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
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
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_table_seating()
        assert result["tables"] == []


# ---------------------------------------------------------------------------
# resolve_table_reference / get_table_order_summary
# ---------------------------------------------------------------------------


class TestResolveTableReference:
    @pytest.mark.anyio
    async def test_resolves_visible_table_number_without_fuzzy_numeric_matching(self):
        tables = [make_table(table_id="tbl-12", name="table-12"), make_table(table_id="tbl-21", name="table-21")]
        db = make_db_execute([tables])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.resolve_table_reference("Table 12")
        assert [table["table_id"] for table in result["tables"]] == ["tbl-12"]


class TestGetTableOrderSummary:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_table_order_summary("tbl-1")

    @pytest.mark.anyio
    async def test_table_not_found(self):
        db = make_db_execute([[None]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("nonexistent")
        assert result["registrations"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_order_summary(self):
        table = make_table()
        reg = make_registration(
            order_items=[
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
        person = make_person()
        db = make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
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
        table = make_table()
        reg = make_registration(
            order_items=[
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
        person = make_person()
        db = make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("tbl-1")
        assert result["registrations"][0]["all_delivered"] is True

    @pytest.mark.anyio
    async def test_volunteer_does_not_see_person_id(self):
        table = make_table()
        reg = make_registration()
        person = make_person()
        db = make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("tbl-1")
        assert result["registrations"][0]["person_id"] is None

    @pytest.mark.anyio
    async def test_admin_sees_person_id(self):
        table = make_table()
        reg = make_registration()
        person = make_person()
        db = make_db_execute([[table], [reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["admin"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_table_order_summary("tbl-1")
        assert result["registrations"][0]["person_id"] == "per-1"


# ---------------------------------------------------------------------------
# get_guest_order_status
# ---------------------------------------------------------------------------


class TestGetGuestOrderStatus:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_guest_order_status("reg-1")

    @pytest.mark.anyio
    async def test_registration_not_found(self):
        db = make_db_execute([[None], []])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_guest_order_status("nonexistent")
        assert result["orders"] == []

    @pytest.mark.anyio
    async def test_returns_delivery_state(self):
        reg = make_registration(
            order_items=[
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
        person = make_person()
        db = make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_guest_order_status("reg-1")
        assert result["champagne_lines_total"] == 2
        assert result["champagne_lines_delivered"] == 1
        assert result["champagne_lines_pending"] == 1
        assert result["champagne_quantity_ordered"] == 3
        assert result["champagne_quantity_delivered"] == 1
        assert result["champagne_quantity_pending"] == 2

    @pytest.mark.anyio
    async def test_non_champagne_orders_excluded_from_champagne_counts(self):
        reg = make_registration(
            order_items=[
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
        person = make_person()
        db = make_db_execute([[reg], [person]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
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
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_champagne_delivery_summary()

    @pytest.mark.anyio
    async def test_no_active_edition(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_champagne_delivery_summary()
        assert result["products"] == []

    @pytest.mark.anyio
    async def test_aggregates_delivery_by_product(self):
        ev = make_event(event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])
        reg1 = make_registration(
            reg_id="reg-1",
            order_items=[
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
        reg2 = make_registration(
            reg_id="reg-2",
            order_items=[
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
        db = make_db_execute([[edition], [reg1, reg2]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
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
        ev = make_event(event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])
        reg = make_registration(
            order_items=[
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
        db = make_db_execute([[edition], [reg]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_champagne_delivery_summary()
        assert result["products"] == []


# ---------------------------------------------------------------------------
# get_undelivered_champagne_by_table
# ---------------------------------------------------------------------------


class TestGetUndeliveredChampagneByTable:
    @pytest.mark.anyio
    async def test_requires_volunteer(self):
        backend = ChampagneFestivalMcpBackend(MagicMock())
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_undelivered_champagne_by_table()

    @pytest.mark.anyio
    async def test_no_active_edition(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_undelivered_champagne_by_table()
        assert result["tables"] == []

    @pytest.mark.anyio
    async def test_all_delivered_returns_empty_tables(self):
        ev = make_event(event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])
        reg = make_registration(
            order_items=[
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
        db = make_db_execute([[edition], [reg]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_undelivered_champagne_by_table()
        assert result["tables"] == []
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_tables_with_pending_orders(self):
        ev = make_event(event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])
        reg = make_registration(
            table_id="tbl-1",
            order_items=[
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
        table = make_table(table_id="tbl-1", name="Table A")
        db = make_db_execute([[edition], [reg], [table]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
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
        with patch.object(mcp_base_module, "get_access_token", return_value=None), pytest.raises(PermissionError):
            await backend.get_check_in_summary()

    @pytest.mark.anyio
    async def test_no_active_edition(self):
        db = make_db_execute([[]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_check_in_summary()
        assert "message" in result

    @pytest.mark.anyio
    async def test_returns_check_in_counts(self):
        ev = make_event(event_date=date(2099, 3, 21))
        edition = make_edition(events=[ev])
        reg1 = make_registration(reg_id="reg-1", guest_count=2, checked_in=True, strap_issued=True)
        reg2 = make_registration(reg_id="reg-2", guest_count=3, checked_in=False)
        db = make_db_execute([[edition], [reg1, reg2]])
        backend = ChampagneFestivalMcpBackend(make_session_factory(db))
        token = make_access_token(["volunteer"])
        with patch.object(mcp_base_module, "get_access_token", return_value=token):
            result = await backend.get_check_in_summary()
        assert result["total_registrations"] == 2
        assert result["checked_in"] == 1
        assert result["not_checked_in"] == 1
        assert result["total_guests"] == 5
        assert result["straps_issued"] == 1


# ---------------------------------------------------------------------------
# PII filtering integration
# ---------------------------------------------------------------------------


class TestPIIFiltering:
    def test_person_dict_public_has_no_pii(self):
        """Public role should not be able to use _person_dict (only volunteer+)."""
        # _person_dict is called internally with role; public should not reach it
        # but if it does, it would only return id and name
        person = make_person()
        d = person_dict(person, role=ROLE_PUBLIC)
        assert "id" in d
        assert "name" in d
        assert "email" not in d
        assert "phone" not in d
        assert "address" not in d

    def test_person_dict_volunteer_shows_contact_not_sensitive(self):
        person = make_person(address="Rue 1", notes="VIP")
        d = person_dict(person, role=ROLE_VOLUNTEER)
        assert "email" in d
        assert "phone" in d
        assert "address" not in d
        assert "notes" not in d
        assert "national_register_number" not in d
        assert "eid_document_number" not in d

    def test_person_dict_admin_shows_all_allowed_fields(self):
        person = make_person(address="Rue 1", notes="VIP")
        d = person_dict(person, role=ROLE_ADMIN)
        assert "email" in d
        assert "phone" in d
        assert "address" in d
        assert "notes" in d
        # Sensitive fields that should never appear
        assert "national_register_number" not in d
        assert "eid_document_number" not in d
