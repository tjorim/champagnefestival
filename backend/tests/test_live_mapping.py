"""Unit tests for live-update domain mapping functions.

These tests pin the mapping of domain actions to TanStack Query keys so
that the backend and frontend invalidation contracts cannot drift silently.
"""

from __future__ import annotations

import json

import pytest

from app.live.mapping import (
    _K_ADMIN_REGISTRATIONS,
    _K_ADMIN_TABLES,
    check_in_changed,
    delivery_changed,
    order_changed,
    registration_changed,
    seating_changed,
)

# ---------------------------------------------------------------------------
# check_in_changed
# ---------------------------------------------------------------------------


def test_check_in_changed_topic_and_action():
    e = check_in_changed(registration_id="reg-1")
    assert e.topic == "check_in"
    assert e.action == "updated"


def test_check_in_changed_scope():
    e = check_in_changed(registration_id="reg-1", event_id="ev-1", edition_id="ed-1")
    assert e.scope.registration_id == "reg-1"
    assert e.scope.event_id == "ev-1"
    assert e.scope.edition_id == "ed-1"
    assert e.scope.table_id is None


def test_check_in_changed_keys():
    e = check_in_changed(registration_id="reg-1")
    assert _K_ADMIN_REGISTRATIONS in e.keys
    assert _K_ADMIN_TABLES not in e.keys


def test_check_in_changed_has_id():
    e = check_in_changed(registration_id="reg-1")
    assert e.id.startswith("evt_")


# ---------------------------------------------------------------------------
# registration_changed
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("action", ["created", "updated", "deleted"])
def test_registration_changed_actions(action: str):
    e = registration_changed(action=action, registration_id="reg-1")
    assert e.topic == "registration"
    assert e.action == action


def test_registration_changed_keys():
    e = registration_changed(action="updated", registration_id="reg-1")
    assert _K_ADMIN_REGISTRATIONS in e.keys


# ---------------------------------------------------------------------------
# seating_changed
# ---------------------------------------------------------------------------


def test_seating_changed_defaults():
    e = seating_changed(registration_id="reg-1", table_id="tbl-1")
    assert e.topic == "seating"
    assert e.action == "updated"


def test_seating_changed_keys_include_tables():
    e = seating_changed(registration_id="reg-1", table_id="tbl-1")
    assert _K_ADMIN_REGISTRATIONS in e.keys
    assert _K_ADMIN_TABLES in e.keys


def test_seating_changed_scope():
    e = seating_changed(registration_id="reg-1", table_id="tbl-1", edition_id="ed-1")
    assert e.scope.table_id == "tbl-1"
    assert e.scope.registration_id == "reg-1"
    assert e.scope.edition_id == "ed-1"


# ---------------------------------------------------------------------------
# order_changed
# ---------------------------------------------------------------------------


def test_order_changed_topic():
    e = order_changed(registration_id="reg-1")
    assert e.topic == "order"
    assert e.action == "updated"


def test_order_changed_keys():
    e = order_changed(registration_id="reg-1")
    assert _K_ADMIN_REGISTRATIONS in e.keys
    assert _K_ADMIN_TABLES not in e.keys


# ---------------------------------------------------------------------------
# delivery_changed
# ---------------------------------------------------------------------------


def test_delivery_changed_topic():
    e = delivery_changed(registration_id="reg-1")
    assert e.topic == "delivery"
    assert e.action == "updated"


def test_delivery_changed_keys():
    e = delivery_changed(registration_id="reg-1")
    assert _K_ADMIN_REGISTRATIONS in e.keys


# ---------------------------------------------------------------------------
# SSE serialisation
# ---------------------------------------------------------------------------


def test_to_sse_data_format():
    e = check_in_changed(registration_id="reg-1", event_id="ev-1")
    sse = e.to_sse_data()
    assert sse.startswith("event: invalidate\n")
    assert "data: " in sse
    assert sse.endswith("\n\n")


def test_to_sse_data_id_line_present():
    e = check_in_changed(registration_id="reg-1")
    sse = e.to_sse_data()
    assert f"id: {e.id}\n" in sse


def test_to_sse_data_keys_are_lists():
    e = seating_changed(registration_id="reg-1", table_id="tbl-1")
    data_line = next(line for line in e.to_sse_data().splitlines() if line.startswith("data: "))
    payload = json.loads(data_line[6:])
    assert isinstance(payload["keys"], list)
    assert all(isinstance(k, list) for k in payload["keys"])


def test_to_sse_data_scope_nulls_explicit():
    e = check_in_changed(registration_id="reg-1")
    data_line = next(line for line in e.to_sse_data().splitlines() if line.startswith("data: "))
    payload = json.loads(data_line[6:])
    scope = payload["scope"]
    assert "table_id" in scope
    assert scope["table_id"] is None
