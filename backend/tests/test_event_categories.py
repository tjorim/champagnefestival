"""Event categories as admin-managed data (#1222): REST, MCP and the events that use them."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.mcp.admin import event_categories as mcp_categories
from app.mcp.admin import events as mcp_events
from app.models import AuditEntry
from tests.conftest import DEFAULT_TEST_CATEGORIES
from tests.helpers import ADMIN_HEADERS, _create_event, mcp_session_factory


async def _create(client, **body):
    return await client.post("/api/event-categories", json={"label_language": "nl", **body}, headers=ADMIN_HEADERS)


async def test_list_is_public_ordered_and_resolves_labels_for_the_locale(client):
    for key, order, nl, fr in (("zeta", 5, "Zeta", None), ("alpha", 5, "Alfa", "Alpha"), ("first", 0, "Eerste", None)):
        response = await _create(client, key=key, sort_order=order, label_nl=nl, label_fr=fr)
        assert response.status_code == 201, response.text

    listed = (await client.get("/api/event-categories", params={"locale": "fr"})).json()
    keys = [category["key"] for category in listed]
    # Display order is sort order, then key; the seeded categories all sort first (0).
    assert keys.index("first") < keys.index("alpha") < keys.index("zeta")
    labels = {category["key"]: category["label"] for category in listed}
    assert labels["alpha"] == "Alpha"
    assert labels["zeta"] == "Zeta"  # no French label: the original language
    assert (await client.get("/api/event-categories")).json()[0]["label"]
    assert (await client.get("/api/event-categories", params={"locale": "de"})).status_code == 422


async def test_create_validates_the_key_and_the_original_label(client):
    created = await _create(client, key="gala-night_2", label_language="en", label_en="Gala night", sort_order=3)
    assert created.status_code == 201, created.text
    assert created.json()["label"] == "Gala night"
    assert created.json()["sort_order"] == 3

    assert (await _create(client, key="gala-night_2", label_nl="Dubbel")).status_code == 409
    for bad in (
        {"key": "Gala", "label_nl": "x"},
        {"key": "1gala", "label_nl": "x"},
        {"key": "gala night", "label_nl": "x"},
        {"key": "a" * 51, "label_nl": "x"},
        {"key": "nolabel"},
        {"key": "wrong-original", "label_language": "fr", "label_nl": "Seulement"},
        {"key": "blank", "label_nl": "   "},
        {"key": "long", "label_nl": "x" * 101},
        {"key": "negative", "label_nl": "x", "sort_order": -1},
    ):
        assert (await _create(client, **bad)).status_code == 422, bad


async def test_update_edits_single_labels_and_keeps_the_key(client):
    await _create(client, key="gala", label_nl="Gala")

    translated = await client.put(
        "/api/event-categories/gala", json={"label_en": "Gala night", "sort_order": 7}, headers=ADMIN_HEADERS
    )
    assert translated.status_code == 200
    assert (translated.json()["label_nl"], translated.json()["label_en"]) == ("Gala", "Gala night")
    assert translated.json()["sort_order"] == 7

    cleared = await client.put("/api/event-categories/gala", json={"label_en": ""}, headers=ADMIN_HEADERS)
    assert cleared.json()["label_en"] is None

    no_original = await client.put("/api/event-categories/gala", json={"label_nl": ""}, headers=ADMIN_HEADERS)
    assert no_original.status_code == 400
    assert "original language" in no_original.text

    switched = await client.put(
        "/api/event-categories/gala", json={"label_language": "fr", "label_fr": "Gala"}, headers=ADMIN_HEADERS
    )
    assert (switched.json()["label_language"], switched.json()["label"]) == ("fr", "Gala")

    assert (
        await client.put("/api/event-categories/gala", json={"key": "other"}, headers=ADMIN_HEADERS)
    ).status_code == 422
    assert (
        await client.put("/api/event-categories/missing", json={"sort_order": 1}, headers=ADMIN_HEADERS)
    ).status_code == 404


async def test_delete_is_refused_while_events_use_the_category(client):
    event = await _create_event(client, edition_id="edition-category-delete")
    in_use = await client.delete(f"/api/event-categories/{event['category']}", headers=ADMIN_HEADERS)
    assert in_use.status_code == 409
    assert "1 event(s)" in in_use.text

    await _create(client, key="gala", label_nl="Gala")
    assert (await client.delete("/api/event-categories/gala", headers=ADMIN_HEADERS)).status_code == 204
    assert (await client.delete("/api/event-categories/gala", headers=ADMIN_HEADERS)).status_code == 404
    keys = [c["key"] for c in (await client.get("/api/event-categories")).json()]
    assert "gala" not in keys
    assert set(DEFAULT_TEST_CATEGORIES) <= set(keys)


async def test_writes_require_a_signed_in_admin_but_the_list_does_not(unauth_client):
    body = {"key": "gala", "label_nl": "Gala"}
    assert (await unauth_client.post("/api/event-categories", json=body)).status_code == 401
    assert (await unauth_client.put("/api/event-categories/tasting", json={"sort_order": 1})).status_code == 401
    assert (await unauth_client.delete("/api/event-categories/tasting")).status_code == 401
    assert (await unauth_client.get("/api/event-categories")).status_code == 200


async def test_writes_require_the_admin_role(forbidden_client):
    body = {"key": "gala", "label_nl": "Gala"}
    assert (await forbidden_client.post("/api/event-categories", json=body)).status_code == 403
    assert (await forbidden_client.delete("/api/event-categories/tasting")).status_code == 403


async def test_changes_are_audited(client, db_session):
    await _create(client, key="gala", label_nl="Gala")
    await client.put("/api/event-categories/gala", json={"label_en": "Gala"}, headers=ADMIN_HEADERS)
    await client.delete("/api/event-categories/gala", headers=ADMIN_HEADERS)

    actions = (
        (await db_session.execute(select(AuditEntry.action).where(AuditEntry.resource_type == "event_category")))
        .scalars()
        .all()
    )
    assert sorted(actions) == ["event_category_created", "event_category_deleted", "event_category_updated"]


async def test_mcp_tools_manage_categories_and_events_use_them(db_session):
    from app.models import Edition, Venue

    factory = mcp_session_factory(db_session)
    created = await mcp_categories.create_event_category(
        factory, "admin-1", key="gala", label_language="nl", label_nl="Gala"
    )
    assert created["key"] == "gala"
    updated = await mcp_categories.update_event_category(factory, "admin-1", "gala", label_en="Gala night")
    assert updated["label_en"] == "Gala night"
    english = await mcp_categories.list_event_categories(factory, "en")
    assert {c["key"]: c["label"] for c in english["event_categories"]}["gala"] == "Gala night"

    with pytest.raises(ValueError, match="already exists"):
        await mcp_categories.create_event_category(
            factory, "admin-1", key="gala", label_language="nl", label_nl="Nog eens"
        )
    with pytest.raises(ValueError, match="key"):
        await mcp_categories.create_event_category(
            factory, "admin-1", key="Not A Key", label_language="nl", label_nl="x"
        )

    db_session.add(Venue(id="venue-cat", name="Venue"))
    await db_session.flush()
    db_session.add(Edition(id="edition-cat", year=2099, month="march", venue_id="venue-cat"))
    await db_session.flush()
    event = await mcp_events.create_event(
        factory,
        "admin-1",
        edition_id="edition-cat",
        title_en="Gala-avond",
        date=date(2099, 3, 21),
        start_time="19:00",
        category="gala",
    )
    with pytest.raises(ValueError, match="1 event"):
        await mcp_categories.delete_event_category(factory, "admin-1", "gala")
    with pytest.raises(ValueError, match="Unknown event category"):
        await mcp_events.update_event(factory, "admin-1", event["id"], category="nope")

    await mcp_events.update_event(factory, "admin-1", event["id"], category="other")
    assert (await mcp_categories.delete_event_category(factory, "admin-1", "gala"))["deleted"] is True
