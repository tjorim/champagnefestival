"""Tests for operational audit trail entries."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditEntry
from tests.helpers import (
    ADMIN_HEADERS,
    TABLE_TYPE_PAYLOAD,
    _create_event,
    _create_layout_prerequisites,
    _post_registration,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _all_audit_entries(db_session) -> list[AuditEntry]:
    result = await db_session.execute(select(AuditEntry).order_by(AuditEntry.timestamp))
    return list(result.scalars().all())


async def _create_admin_registration(client, *, event=None):
    if event is None:
        event = await _create_event(client)
    # Create a person first
    person_r = await client.post(
        "/api/people",
        json={"name": "Audit Tester", "email": "audit@example.com"},
        headers=ADMIN_HEADERS,
    )
    assert person_r.status_code == 201, person_r.text
    person_id = person_r.json()["id"]

    reg_r = await client.post(
        "/api/registrations/admin",
        json={
            "person_id": person_id,
            "event_id": event["id"],
            "guest_count": 2,
            "notes": "",
            "accessibility_note": "",
            "status": "confirmed",
            "pre_orders": [],
        },
        headers=ADMIN_HEADERS,
    )
    assert reg_r.status_code == 201, reg_r.text
    return reg_r.json(), event


# ---------------------------------------------------------------------------
# AuditEntry model unit tests
# ---------------------------------------------------------------------------


def test_audit_entry_model_has_required_fields():
    from app.models import AuditEntry

    cols = {c.name for c in AuditEntry.__table__.columns}
    assert {"id", "timestamp", "actor", "action", "resource_type", "resource_id", "request_id", "details"} <= cols


# ---------------------------------------------------------------------------
# Check-in audit entries
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_check_in_writes_audit_entry(client, db_session):
    reg_body = await _post_registration(client)
    assert reg_body.status_code == 201, reg_body.text
    reg = reg_body.json()
    check_in_token = (
        await client.get(f"/api/registrations/{reg['id']}", headers=ADMIN_HEADERS)
    ).json()["check_in_token"]

    r = await client.post(
        f"/api/check-in/{reg['id']}",
        json={"token": check_in_token, "issue_strap": False},
    )
    assert r.status_code == 200

    entries = await _all_audit_entries(db_session)
    check_ins = [e for e in entries if e.action == "check_in"]
    assert len(check_ins) == 1
    entry = check_ins[0]
    assert entry.resource_type == "registration"
    assert entry.resource_id == reg["id"]
    assert entry.actor  # non-empty
    assert entry.request_id is not None  # set by middleware


@pytest.mark.anyio
async def test_strap_issued_writes_audit_entry(client, db_session):
    reg_body = await _post_registration(client)
    reg = reg_body.json()
    check_in_token = (
        await client.get(f"/api/registrations/{reg['id']}", headers=ADMIN_HEADERS)
    ).json()["check_in_token"]

    r = await client.post(
        f"/api/check-in/{reg['id']}",
        json={"token": check_in_token, "issue_strap": True},
    )
    assert r.status_code == 200

    entries = await _all_audit_entries(db_session)
    actions = {e.action for e in entries}
    assert "check_in" in actions
    assert "strap_issued" in actions


@pytest.mark.anyio
async def test_duplicate_check_in_does_not_write_second_audit_entry(client, db_session):
    reg_body = await _post_registration(client)
    reg = reg_body.json()
    check_in_token = (
        await client.get(f"/api/registrations/{reg['id']}", headers=ADMIN_HEADERS)
    ).json()["check_in_token"]

    await client.post(
        f"/api/check-in/{reg['id']}",
        json={"token": check_in_token, "issue_strap": False},
    )
    await client.post(
        f"/api/check-in/{reg['id']}",
        json={"token": check_in_token, "issue_strap": False},
    )

    entries = await _all_audit_entries(db_session)
    check_ins = [e for e in entries if e.action == "check_in"]
    assert len(check_ins) == 1


# ---------------------------------------------------------------------------
# Registration mutation audit entries
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_admin_create_registration_writes_audit_entry(client, db_session):
    reg, _ = await _create_admin_registration(client)

    entries = await _all_audit_entries(db_session)
    created = [e for e in entries if e.action == "registration_created"]
    assert len(created) == 1
    assert created[0].resource_type == "registration"
    assert created[0].resource_id == reg["id"]


@pytest.mark.anyio
async def test_table_assignment_writes_audit_entry(client, db_session):
    reg, event = await _create_admin_registration(client)
    layout_id = await _create_layout_prerequisites(client)
    tt_r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    assert tt_r.status_code == 201
    table_r = await client.post(
        "/api/tables",
        json={"name": "T1", "capacity": 4, "layout_id": layout_id, "table_type_id": tt_r.json()["id"]},
        headers=ADMIN_HEADERS,
    )
    assert table_r.status_code == 201
    table_id = table_r.json()["id"]

    r = await client.put(
        f"/api/registrations/{reg['id']}",
        json={"table_id": table_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    entries = await _all_audit_entries(db_session)
    assigned = [e for e in entries if e.action == "table_assigned"]
    assert len(assigned) == 1
    assert assigned[0].details["table_id"] == table_id


@pytest.mark.anyio
async def test_status_change_writes_audit_entry(client, db_session):
    reg, _ = await _create_admin_registration(client)

    r = await client.put(
        f"/api/registrations/{reg['id']}",
        json={"status": "cancelled"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    entries = await _all_audit_entries(db_session)
    status_entries = [e for e in entries if e.action == "registration_status_changed"]
    assert len(status_entries) == 1


@pytest.mark.anyio
async def test_delete_registration_writes_audit_entry(client, db_session):
    reg, _ = await _create_admin_registration(client)

    r = await client.delete(f"/api/registrations/{reg['id']}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    entries = await _all_audit_entries(db_session)
    deleted = [e for e in entries if e.action == "registration_deleted"]
    assert len(deleted) == 1
    assert deleted[0].resource_id == reg["id"]


# ---------------------------------------------------------------------------
# Table CRUD audit entries
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_table_writes_audit_entry(client, db_session):
    layout_id = await _create_layout_prerequisites(client)
    tt_r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    assert tt_r.status_code == 201

    r = await client.post(
        "/api/tables",
        json={"name": "AuditTable", "capacity": 4, "layout_id": layout_id, "table_type_id": tt_r.json()["id"]},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    table_id = r.json()["id"]

    entries = await _all_audit_entries(db_session)
    created = [e for e in entries if e.action == "table_created"]
    assert len(created) == 1
    assert created[0].resource_id == table_id
    assert created[0].details["name"] == "AuditTable"


@pytest.mark.anyio
async def test_update_table_writes_audit_entry(client, db_session):
    layout_id = await _create_layout_prerequisites(client)
    tt_r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    table_r = await client.post(
        "/api/tables",
        json={"name": "T1", "capacity": 4, "layout_id": layout_id, "table_type_id": tt_r.json()["id"]},
        headers=ADMIN_HEADERS,
    )
    table_id = table_r.json()["id"]

    r = await client.put(f"/api/tables/{table_id}", json={"name": "T1-renamed"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200

    entries = await _all_audit_entries(db_session)
    updated = [e for e in entries if e.action == "table_updated"]
    assert len(updated) == 1
    assert updated[0].resource_id == table_id
    assert "name" in updated[0].details["fields"]


@pytest.mark.anyio
async def test_delete_table_writes_audit_entry(client, db_session):
    layout_id = await _create_layout_prerequisites(client)
    tt_r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    table_r = await client.post(
        "/api/tables",
        json={"name": "T-del", "capacity": 4, "layout_id": layout_id, "table_type_id": tt_r.json()["id"]},
        headers=ADMIN_HEADERS,
    )
    table_id = table_r.json()["id"]

    r = await client.delete(f"/api/tables/{table_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204

    entries = await _all_audit_entries(db_session)
    deleted = [e for e in entries if e.action == "table_deleted"]
    assert len(deleted) == 1
    assert deleted[0].resource_id == table_id


# ---------------------------------------------------------------------------
# Audit entry schema validation
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_audit_entry_includes_request_id(client, db_session):
    """Every audit entry must carry the X-Request-ID from the middleware."""
    layout_id = await _create_layout_prerequisites(client)
    tt_r = await client.post("/api/table-types", json=TABLE_TYPE_PAYLOAD, headers=ADMIN_HEADERS)
    await client.post(
        "/api/tables",
        json={"name": "T-req", "capacity": 2, "layout_id": layout_id, "table_type_id": tt_r.json()["id"]},
        headers=ADMIN_HEADERS,
    )

    entries = await _all_audit_entries(db_session)
    for entry in entries:
        if entry.action == "table_created":
            assert entry.request_id is not None
