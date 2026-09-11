"""Tests for the layouts API."""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import AuditEntry, Layout, RegistrationAllocation, Room, Venue
from app.schemas import LayoutRevisionSaveRequest
from app.services import layouts_service
from tests.helpers import (
    ADMIN_HEADERS,
    ROOM_PAYLOAD,
    TABLE_TYPE_PAYLOAD,
    VALID_RESERVATION,
    VENUE_PAYLOAD,
    _create_event,
    _create_layout_prerequisites,
    event_for_room,
    seed_layout_event,
)


@pytest.mark.anyio
async def test_layout_rejects_duplicate_room_day(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]

    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 4)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 4)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "A layout already exists for this room and event."


@pytest.mark.anyio
async def test_list_layouts_filters_by_edition_id_and_room_id(client):
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_a = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_b = r.json()["id"]
    r = await client.post(
        "/api/editions",
        json={"id": "edition-834", "year": 2099, "month": "march", "venue_id": venue_id, "active": False},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        "/api/layouts",
        json={"room_id": room_a, "event_id": await event_for_room(client, room_a, 1, "edition-834")},
        headers=ADMIN_HEADERS,
    )
    layout_a = r.json()["id"]
    await client.post(
        "/api/layouts",
        json={"room_id": room_b, "event_id": await event_for_room(client, room_b, 1)},
        headers=ADMIN_HEADERS,
    )

    r = await client.get("/api/layouts", params={"edition_id": "edition-834"}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert [lay["id"] for lay in r.json()] == [layout_a]

    r = await client.get("/api/layouts", params={"room_id": room_a}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert [lay["id"] for lay in r.json()] == [layout_a]

    r = await client.get("/api/layouts", params={"room_id": room_b}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert layout_a not in [lay["id"] for lay in r.json()]

    # An explicit edition_id="" / room_id="" filters on the (nonexistent) empty-string
    # id, not "no filter" — distinct from omitting the parameter entirely (#834 review).
    r = await client.get("/api/layouts", params={"edition_id": ""}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json() == []

    r = await client.get("/api/layouts", params={"room_id": ""}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.anyio
async def test_get_layout_include_tables(client):
    """get_layout(..., include_tables=True) returns the layout's tables and areas
    in one call, without a separate global list_tables/list_areas scan (#834)."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    r = await client.post(
        "/api/tables",
        json={"name": "T1", "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    table_id = r.json()["id"]
    r = await client.post(
        "/api/areas",
        json={"layout_id": layout_id, "label": "Zone A"},
        headers=ADMIN_HEADERS,
    )
    area_id = r.json()["id"]

    # Default: no tables/areas embedded.
    r = await client.get(f"/api/layouts/{layout_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["tables"] is None
    assert r.json()["areas"] is None

    r = await client.get(f"/api/layouts/{layout_id}", params={"include_tables": True}, headers=ADMIN_HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert [t["id"] for t in data["tables"]] == [table_id]
    assert [a["id"] for a in data["areas"]] == [area_id]


@pytest.mark.anyio
async def test_copy_layout_basic(client):
    """Copying a layout to a new day creates a new layout entry."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    source_id = r.json()["id"]

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 2)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["room_id"] == room_id
    assert data["event_id"] == await event_for_room(client, room_id, 2)
    assert data["id"] != source_id


@pytest.mark.anyio
async def test_copy_layout_404_source(client):
    """Copying a nonexistent source layout returns 404."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]

    r = await client.post(
        "/api/layouts/nonexistent-id/copy",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 404


@pytest.mark.anyio
async def test_copy_layout_409_duplicate(client):
    """Copying to a day that already has a layout for the same room returns 409."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    source_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 2)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 2)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "A layout already exists for this room and event."


@pytest.mark.anyio
async def test_copy_layout_copies_tables(client):
    """copy_tables=True copies tables that are outside areas to the new layout."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    source_id = r.json()["id"]
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    # Add a table to the source layout (no area, so it is an "outside" table)
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": source_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={
            "room_id": room_id,
            "event_id": await event_for_room(client, room_id, 2),
            "copy_tables": True,
            "copy_areas": False,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    new_layout_id = r.json()["id"]

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    tables_in_new = [t for t in r.json() if t["layout_id"] == new_layout_id]
    assert len(tables_in_new) == 1
    assert tables_in_new[0]["name"] == "T1"


@pytest.mark.anyio
async def test_copy_layout_copies_areas(client):
    """copy_areas=True copies areas (and tables inside them) to the new layout."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    source_id = r.json()["id"]
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    # Add an area covering the top-left of the room
    r = await client.post(
        "/api/areas",
        json={
            "layout_id": source_id,
            "label": "Zone A",
            "icon": "bi-star",
            "width_m": 10.0,
            "length_m": 10.0,
            "x": 0.0,
            "y": 0.0,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    # Add a table inside that area (x=10%, y=10% of a 25m×18m room = 2.5m, 1.8m — inside the 10m×10m area)
    r = await client.post(
        "/api/tables",
        json={"name": "InArea", "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": source_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={
            "room_id": room_id,
            "event_id": await event_for_room(client, room_id, 2),
            "copy_tables": False,
            "copy_areas": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    new_layout_id = r.json()["id"]

    # Both the area and the table inside it should be copied
    r = await client.get("/api/areas", params={"layout_id": new_layout_id}, headers=ADMIN_HEADERS)
    assert len(r.json()) == 1
    assert r.json()[0]["label"] == "Zone A"

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    tables_in_new = [t for t in r.json() if t["layout_id"] == new_layout_id]
    assert len(tables_in_new) == 1
    assert tables_in_new[0]["name"] == "InArea"


@pytest.mark.anyio
async def test_copy_layout_rejects_area_with_inactive_exhibitor(client):
    """An area whose exhibitor was deactivated after the area was created must not
    be silently carried into the copy — create_area/update_area both refuse to
    assign an inactive exhibitor, so the copy path can't create areas those tools
    would reject."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    source_id = r.json()["id"]

    r = await client.post("/api/exhibitors", json={"name": "Bollinger", "type": "producer"}, headers=ADMIN_HEADERS)
    exhibitor_id = r.json()["id"]
    r = await client.post(
        "/api/areas",
        json={"layout_id": source_id, "label": "Zone A", "exhibitor_id": exhibitor_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.put(f"/api/exhibitors/{exhibitor_id}", json={"active": False}, headers=ADMIN_HEADERS)
    assert r.status_code == 200

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={
            "room_id": room_id,
            "event_id": await event_for_room(client, room_id, 2),
            "copy_tables": False,
            "copy_areas": True,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400
    assert "inactive" in r.json()["detail"].lower()


@pytest.mark.anyio
async def test_copy_layout_no_tables_when_flags_false(client):
    """When both copy_tables and copy_areas are False, no tables are copied."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    source_id = r.json()["id"]
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]

    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": source_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201

    r = await client.post(
        f"/api/layouts/{source_id}/copy",
        json={
            "room_id": room_id,
            "event_id": await event_for_room(client, room_id, 2),
            "copy_tables": False,
            "copy_areas": False,
        },
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    new_layout_id = r.json()["id"]

    r = await client.get("/api/tables", headers=ADMIN_HEADERS)
    tables_in_new = [t for t in r.json() if t["layout_id"] == new_layout_id]
    assert tables_in_new == []


# ---------------------------------------------------------------------------
# Layout revisions (#1021)
# ---------------------------------------------------------------------------


async def _seed_layout(client) -> tuple[str, str, str, str]:
    """venue -> room -> layout -> table type. Returns (venue_id, room_id, layout_id, table_type_id)."""
    r = await client.post("/api/venues", json=VENUE_PAYLOAD, headers=ADMIN_HEADERS)
    venue_id = r.json()["id"]
    r = await client.post("/api/rooms", json={**ROOM_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    room_id = r.json()["id"]
    r = await client.post(
        "/api/layouts",
        json={"room_id": room_id, "event_id": await event_for_room(client, room_id, 1)},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    layout_id = r.json()["id"]
    r = await client.post("/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": venue_id}, headers=ADMIN_HEADERS)
    tt_id = r.json()["id"]
    return venue_id, room_id, layout_id, tt_id


@pytest.mark.anyio
async def test_save_layout_revision_snapshot_immutable_after_later_edit(client, db_session):
    """Saving a revision snapshots current geometry; a later edit to the live
    table must not retroactively change what the earlier revision reports."""
    _, _, layout_id, tt_id = await _seed_layout(client)
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    table_id = r.json()["id"]

    r = await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "Opening plan"}, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    revision = r.json()
    assert revision["revision_number"] == 1
    assert revision["label"] == "Opening plan"
    assert [t["id"] for t in revision["snapshot"]["tables"]] == [table_id]
    assert revision["snapshot"]["tables"][0]["x"] == 10.0

    r = await client.put(f"/api/tables/{table_id}", json={"x": 80.0}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/layouts/{layout_id}/revisions/1", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert r.json()["snapshot"]["tables"][0]["x"] == 10.0

    actions = set((await db_session.execute(select(AuditEntry.action))).scalars())
    assert "layout_revision_saved" in actions


@pytest.mark.anyio
async def test_save_layout_revision_404_unknown_layout(client):
    r = await client.post("/api/layouts/nonexistent/revisions", json={"label": "x"}, headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_save_layout_revision_rejects_whitespace_only_label(client):
    _, _, layout_id, _ = await _seed_layout(client)
    r = await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "   "}, headers=ADMIN_HEADERS)
    assert r.status_code == 422


@pytest.mark.anyio
async def test_deleting_a_layout_with_a_saved_revision_cascades(client, db_session):
    """A LayoutRevision references its Layout with a NOT NULL, ON DELETE
    CASCADE foreign key (see the migration). Layout.revisions must be mapped
    with passive_deletes so SQLAlchemy defers to that DB-level cascade
    instead of trying to null out the non-nullable layout_id column first."""
    _, _, layout_id, _ = await _seed_layout(client)
    r = await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "v1"}, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    revision_id = r.json()["id"]

    r = await client.delete(f"/api/layouts/{layout_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 204, r.text

    from app.models import LayoutRevision

    # A plain select (rather than db.get, which would happily return the
    # stale identity-mapped object from the earlier POST without a DB
    # round-trip) confirms the DB-level ON DELETE CASCADE actually ran.
    remaining = (
        await db_session.execute(select(LayoutRevision.id).where(LayoutRevision.id == revision_id))
    ).scalar_one_or_none()
    assert remaining is None


@pytest.mark.anyio
async def test_list_layout_revisions_orders_newest_first(client):
    _, _, layout_id, _ = await _seed_layout(client)
    for label in ("first", "second"):
        r = await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": label}, headers=ADMIN_HEADERS)
        assert r.status_code == 201, r.text
    r = await client.get(f"/api/layouts/{layout_id}/revisions", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert [rev["revision_number"] for rev in body] == [2, 1]
    assert [rev["label"] for rev in body] == ["second", "first"]


@pytest.mark.anyio
async def test_compare_layout_revisions_matches_by_stable_id_not_name(client):
    """A rename between two revisions is reported as a changed field, not as
    one table removed and a different one added."""
    _, _, layout_id, tt_id = await _seed_layout(client)
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    table_id = r.json()["id"]
    assert (
        await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "v1"}, headers=ADMIN_HEADERS)
    ).status_code == 201

    r = await client.put(f"/api/tables/{table_id}", json={"name": "T1 renamed", "x": 50.0}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    r = await client.post(
        "/api/tables",
        json={"name": "T2", "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    new_table_id = r.json()["id"]
    assert (
        await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "v2"}, headers=ADMIN_HEADERS)
    ).status_code == 201

    r = await client.get(
        f"/api/layouts/{layout_id}/revisions/compare", params={"from": "1", "to": "2"}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 200, r.text
    diff = r.json()
    assert [t["id"] for t in diff["added_tables"]] == [new_table_id]
    assert diff["removed_tables"] == []
    assert [t["id"] for t in diff["changed_tables"]] == [table_id]
    changed_fields = {c["field"] for c in diff["changed_tables"][0]["changes"]}
    assert changed_fields == {"name", "x"}


@pytest.mark.anyio
async def test_compare_revision_against_current_draft(client):
    _, _, layout_id, tt_id = await _seed_layout(client)
    assert (
        await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "v1"}, headers=ADMIN_HEADERS)
    ).status_code == 201

    r = await client.post(
        "/api/tables",
        json={"name": "T1", "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    table_id = r.json()["id"]

    r = await client.get(
        f"/api/layouts/{layout_id}/revisions/compare",
        params={"from": "1", "to": "current"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert [t["id"] for t in r.json()["added_tables"]] == [table_id]


@pytest.mark.anyio
async def test_compare_layout_revisions_invalid_ref(client):
    _, _, layout_id, _ = await _seed_layout(client)
    r = await client.get(
        f"/api/layouts/{layout_id}/revisions/compare",
        params={"from": "not-a-number", "to": "current"},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 400


@pytest.mark.anyio
async def test_restore_preview_reports_geometry_changes_without_conflicts(client):
    _, _, layout_id, tt_id = await _seed_layout(client)
    r = await client.post(
        "/api/tables",
        json={"name": "T1", "x": 10.0, "y": 10.0, "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    table_id = r.json()["id"]
    assert (
        await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "v1"}, headers=ADMIN_HEADERS)
    ).status_code == 201

    r = await client.put(f"/api/tables/{table_id}", json={"x": 90.0}, headers=ADMIN_HEADERS)
    assert r.status_code == 200

    r = await client.post(f"/api/layouts/{layout_id}/revisions/1/restore/preview", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["has_conflicts"] is False
    assert preview["allocation_conflicts"] == []
    assert [t["id"] for t in preview["tables_to_update"]] == [table_id]

    r = await client.post(f"/api/layouts/{layout_id}/revisions/1/restore", json={}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    restored_table = next(t for t in r.json()["tables"] if t["id"] == table_id)
    assert restored_table["x"] == 10.0


@pytest.mark.anyio
async def test_restore_preview_404_unknown_revision(client):
    _, _, layout_id, _ = await _seed_layout(client)
    r = await client.post(f"/api/layouts/{layout_id}/revisions/99/restore/preview", headers=ADMIN_HEADERS)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_restore_blocked_by_allocation_conflict_then_resolved(client, db_session):
    """Restoring a revision that would delete a table holding a live
    (non-cancelled) registration is refused unless resolve_allocations=true,
    and even then the registration/allocation rows themselves are never
    touched by the restore (#1021 acceptance criteria)."""
    # event_for_room's edition is inactive (registration would 400), so this
    # test needs its own active-edition event via _create_event instead.
    event = await _create_event(client)
    layout_id = await _create_layout_prerequisites(client, event["id"])
    layout = (await client.get(f"/api/layouts/{layout_id}", headers=ADMIN_HEADERS)).json()
    room = (await client.get(f"/api/rooms/{layout['room_id']}", headers=ADMIN_HEADERS)).json()
    r = await client.post(
        "/api/table-types", json={**TABLE_TYPE_PAYLOAD, "venue_id": room["venue_id"]}, headers=ADMIN_HEADERS
    )
    tt_id = r.json()["id"]

    # Revision 1 has no tables at all.
    assert (
        await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "empty"}, headers=ADMIN_HEADERS)
    ).status_code == 201

    r = await client.post(
        "/api/tables",
        json={"name": "T1", "table_type_id": tt_id, "layout_id": layout_id},
        headers=ADMIN_HEADERS,
    )
    table_id = r.json()["id"]

    reg_resp = await client.post(
        "/api/registrations", json={**VALID_RESERVATION, "event_id": event["id"], "guest_count": 2}
    )
    assert reg_resp.status_code == 201, reg_resp.text
    registration_id = reg_resp.json()["id"]
    alloc_resp = await client.put(
        f"/api/registrations/{registration_id}",
        json={"allocations": [{"table_id": table_id, "guest_count": 2}]},
    )
    assert alloc_resp.status_code == 200, alloc_resp.text

    r = await client.post(f"/api/layouts/{layout_id}/revisions/1/restore/preview", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["has_conflicts"] is True
    assert preview["allocation_conflicts"] == [
        {
            "kind": "table",
            "id": table_id,
            "name": "T1",
            "reason": "deleted",
            "registration_ids": [registration_id],
            "exhibitor_id": None,
        }
    ]

    r = await client.post(f"/api/layouts/{layout_id}/revisions/1/restore", json={}, headers=ADMIN_HEADERS)
    assert r.status_code == 409, r.text

    allocations = (
        (await db_session.execute(select(RegistrationAllocation).where(RegistrationAllocation.table_id == table_id)))
        .scalars()
        .all()
    )
    assert len(allocations) == 1

    r = await client.post(
        f"/api/layouts/{layout_id}/revisions/1/restore",
        json={"resolve_allocations": True},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["tables"] == []

    r = await client.get(f"/api/tables/{table_id}", headers=ADMIN_HEADERS)
    assert r.status_code == 404

    # The registration itself is never touched by the restore — only its
    # now-dangling allocation on the deleted table is cleared (required to
    # satisfy RegistrationAllocation.table_id's ON DELETE RESTRICT).
    reg_check = await client.put(f"/api/registrations/{registration_id}", json={}, headers=ADMIN_HEADERS)
    assert reg_check.status_code == 200, reg_check.text
    assert reg_check.json()["status"] != "cancelled"
    assert reg_check.json()["allocations"] == []


@pytest.mark.anyio
async def test_restore_blocked_by_moving_an_exhibitor_assigned_area(client):
    """An assigned area (live Area.exhibitor_id) that a restore would move —
    not just delete — must also require resolve_allocations, mirroring how a
    table that would only move (not be deleted) still needs the override."""
    _, _, layout_id, _ = await _seed_layout(client)
    r = await client.post("/api/exhibitors", json={"name": "Bollinger", "type": "producer"}, headers=ADMIN_HEADERS)
    exhibitor_id = r.json()["id"]
    r = await client.post(
        "/api/areas",
        json={"layout_id": layout_id, "label": "Zone A", "exhibitor_id": exhibitor_id, "x": 10.0, "y": 10.0},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    area_id = r.json()["id"]

    assert (
        await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "v1"}, headers=ADMIN_HEADERS)
    ).status_code == 201

    r = await client.put(f"/api/areas/{area_id}", json={"x": 90.0}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text

    r = await client.post(f"/api/layouts/{layout_id}/revisions/1/restore/preview", headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["has_conflicts"] is True
    assert preview["allocation_conflicts"] == [
        {
            "kind": "area",
            "id": area_id,
            "name": "Zone A",
            "reason": "moved",
            "registration_ids": [],
            "exhibitor_id": exhibitor_id,
        }
    ]

    r = await client.post(f"/api/layouts/{layout_id}/revisions/1/restore", json={}, headers=ADMIN_HEADERS)
    assert r.status_code == 409, r.text

    r = await client.post(
        f"/api/layouts/{layout_id}/revisions/1/restore",
        json={"resolve_allocations": True},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200, r.text
    restored_area = next(a for a in r.json()["areas"] if a["id"] == area_id)
    assert restored_area["x"] == 10.0
    assert restored_area["exhibitor_id"] == exhibitor_id


@pytest.mark.anyio
async def test_revision_snapshot_excludes_allocations(client):
    """A saved revision never captures exhibitor assignments or registration
    links — both remain live operational data outside any revision's scope."""
    _, _, layout_id, tt_id = await _seed_layout(client)
    r = await client.post("/api/exhibitors", json={"name": "Bollinger", "type": "producer"}, headers=ADMIN_HEADERS)
    exhibitor_id = r.json()["id"]
    r = await client.post(
        "/api/areas",
        json={"layout_id": layout_id, "label": "Zone A", "exhibitor_id": exhibitor_id},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text

    r = await client.post(f"/api/layouts/{layout_id}/revisions", json={"label": "v1"}, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    area_snapshot = r.json()["snapshot"]["areas"][0]
    assert "exhibitor_id" not in area_snapshot
    for table_snapshot in r.json()["snapshot"]["tables"]:
        assert "registration_ids" not in table_snapshot


@pytest.mark.anyio
async def test_concurrent_revision_saves_do_not_reuse_a_revision_number(engine):
    """Two concurrent save-revision calls for the same layout must not compute
    the same MAX(revision_number)+1 — the row lock on the parent Layout
    (mirroring policies_service._get_policy_locked) serializes them instead."""
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async with sessions() as setup:
        venue = Venue(id="venue-rev-race", name="Venue")
        setup.add(venue)
        await setup.flush()
        room = Room(id="room-rev-race", venue_id=venue.id, name="Hall", width_m=20.0, length_m=15.0)
        setup.add(room)
        await setup.flush()
        event_id = await seed_layout_event(setup, room_id=room.id)
        layout = Layout(id="lay-rev-race", event_id=event_id, room_id=room.id)
        setup.add(layout)
        await setup.commit()

    async def attempt(label: str):
        async with sessions() as session:
            return await layouts_service.save_layout_revision(
                session,
                actor="admin",
                layout_id="lay-rev-race",
                body=LayoutRevisionSaveRequest(label=label),
            )

    results = await asyncio.gather(attempt("a"), attempt("b"))
    assert sorted(r["revision_number"] for r in results) == [1, 2]
