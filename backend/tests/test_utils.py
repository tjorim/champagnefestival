from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.utils import csv_safe, registration_to_guest_dict


@pytest.mark.parametrize("prefix", ["=", "+", "-", "@", "\t", "\r", "\n"])
def test_csv_safe_prefixes_spreadsheet_formula_characters(prefix: str):
    assert csv_safe(f"{prefix}value") == f"'{prefix}value"


def test_csv_safe_normalizes_other_cell_values():
    assert csv_safe(None) == ""
    assert csv_safe(42) == "42"
    assert csv_safe("Alice") == "Alice"


def _make_registration():
    now = datetime.now(UTC)
    return SimpleNamespace(
        id="reg_test",
        person_id="per_test",
        event_id="evt_test",
        check_in_token="check-in-secret",
        guest_count=2,
        order_items=[],
        status="confirmed",
        payment_status="paid",
        amount_due=None,
        amount_paid=0,
        allocations=[],
        product_snapshot={},
        checked_in=False,
        checked_in_at=None,
        strap_issued=False,
        created_at=now,
    )


def _make_person(name: str = "Jean Dupont"):
    return SimpleNamespace(name=name)


def _make_event(title: str = "Friday Tasting"):
    return SimpleNamespace(title=title, date=datetime.now(UTC).date())


def test_registration_to_guest_dict_includes_person_name():
    r = _make_registration()
    result = registration_to_guest_dict(r, _make_person("Alice"), _make_event())
    assert result["name"] == "Alice"


def test_registration_to_guest_dict_includes_event_title():
    r = _make_registration()
    result = registration_to_guest_dict(r, _make_person(), _make_event("Saturday Gala"))
    assert result["event_title"] == "Saturday Gala"


def test_registration_to_guest_dict_includes_check_in_fields():
    event = _make_event()
    result = registration_to_guest_dict(_make_registration(), _make_person(), event)
    assert result["event_date"] == event.date
    assert result["check_in_token"] == "check-in-secret"


def test_registration_to_guest_dict_strips_hidden_order_items():
    """This function has no admin caller — every reader is the visitor
    looking at their own booking (guest access token, magic link, `/me`), so
    a hidden line's name/product_id must never appear here, matching the
    `public=True` path of `registration_to_dict` (#1020)."""
    r = _make_registration()
    r.order_items = [
        {"product_id": "napkin", "name": "Napkin", "quantity": 1, "visible": False},
        {"product_id": "coffee", "name": "Coffee", "quantity": 1, "visible": True},
    ]
    result = registration_to_guest_dict(r, _make_person(), _make_event())
    assert [i["product_id"] for i in result["order_items"]] == ["coffee"]
