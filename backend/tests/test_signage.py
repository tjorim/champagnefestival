"""Signage public contract and administrative transaction regression tests."""

from datetime import UTC, datetime, timedelta
from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select

from app.auth import require_admin
from app.main import app
from app.models import Area, AuditEntry, Edition, Layout, Organization, Room
from app.services.signage_service import playlist
from tests.helpers import _create_event


async def setup(client, db_session):
    await _create_event(client)
    edition = await db_session.get(Edition, "edition-public")
    organizations = [
        Organization(name=name, type=kind, active=active)
        for name, kind, active in [
            ("Zulu", "producer", True),
            ("Alpha", "producer", True),
            ("Partner", "sponsor", True),
            ("Main", "sponsor", True),
            ("Hidden", "producer", False),
            ("Food", "vendor", True),
        ]
    ]
    db_session.add_all(organizations)
    await db_session.flush()
    edition.organizations = [org.id for org in organizations[:-1]]
    edition.sponsor_tiers = {str(organizations[2].id): "partner", str(organizations[3].id): "main"}
    room = Room(id="signage-room", name="Private room", venue_id=edition.venue_id)
    db_session.add(room)
    await db_session.flush()
    layout = Layout(id="signage-layout", event_id="event-public", room_id=room.id)
    from app.models import Event

    event = await db_session.scalar(select(Event).where(Event.edition_id == edition.id))
    layout.event_id = event.id
    db_session.add(layout)
    await db_session.flush()
    db_session.add(
        Area(id="signage-area", layout_id=layout.id, organization_id=organizations[-1].id, label="SECRET STAND")
    )
    await db_session.commit()
    channel = await client.post(
        "/api/signage/channels",
        json={
            "slug": "hall",
            "name": "Hall",
            "edition_id": edition.id,
            "active": True,
        },
    )
    assert channel.status_code == 201, channel.text
    template = await client.post(
        "/api/signage/templates",
        json={
            "name": "Default",
            "layers": [
                {"id": key, "kind": "binding", "binding": key} for key in ("logo", "name", "sponsor", "title", "text")
            ],
        },
    )
    assert template.status_code == 201, template.text
    return channel.json(), template.json(), organizations


async def slide(client, channel, template, **kwargs):
    body = {
        "channel_id": channel["id"],
        "template_id": template["id"],
        "kind": "notice",
        "active": True,
        "content": {"text": "Hello"},
        **kwargs,
    }
    result = await client.post("/api/signage/slides", json=body)
    assert result.status_code == 201, result.text
    return result.json()


@pytest.mark.anyio
async def test_public_playlist_privacy_order_translation_and_cache(client, db_session):
    channel, template, organizations = await setup(client, db_session)
    await slide(client, channel, template, kind="organizations", content={}, sort_order=0)
    await slide(
        client,
        channel,
        template,
        sort_order=1,
        content={"title": "Hi", "text": "Bonjour"},
    )
    now = datetime.now(UTC)
    await slide(client, channel, template, active=False)
    await slide(client, channel, template, starts_at=(now + timedelta(hours=1)).isoformat())
    await slide(client, channel, template, ends_at=(now - timedelta(hours=1)).isoformat())
    first = await client.get("/api/signage/hall/playlist?locale=en")
    assert first.status_code == 200, first.text
    data = first.json()
    assert [s["organization"]["name"] for s in data["slides"] if s["organization"]] == [
        "Alpha",
        "Zulu",
        "Food",
        "Main",
        "Partner",
    ]
    assert data["slides"][-1]["text"] == "Bonjour"
    assert data["slides"][-1]["title"] == "Hi"
    assert data["slides"][3]["organization"]["sponsor"] is True
    assert (await client.get("/api/signage/hall/playlist?locale=en")).json() == data
    # Notice text is typed once by the organiser and is not translated per locale.
    assert (await client.get("/api/signage/hall/playlist?locale=nl")).json()["slides"][-1]["text"] == "Bonjour"
    forbidden = {
        "stand",
        "stands",
        "room",
        "room_id",
        "room_name",
        "table",
        "tables",
        "registrations",
        "registration_id",
        "contact_person_id",
        "edition_id",
        "channel_id",
        "active",
        "sort_order",
        "created_at",
        "updated_at",
    }

    def check(value):
        if isinstance(value, dict):
            assert not forbidden.intersection(value)
            for child in value.values():
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)

    check(data)
    assert "SECRET STAND" not in first.text and "Private room" not in first.text
    assert "public" in first.headers["cache-control"]
    cached = await client.get("/api/signage/hall/playlist?locale=en", headers={"If-None-Match": first.headers["etag"]})
    assert cached.status_code == 304 and not cached.content
    organizations[0].name = "Changed"
    await db_session.commit()
    assert (await client.get("/api/signage/hall/playlist?locale=en")).headers["etag"] != first.headers["etag"]
    assert (await client.get("/api/signage/time")).headers["cache-control"] == "no-store"
    assert (await client.get("/api/signage/missing/playlist")).status_code == 404
    channel["active"] = False
    body = {k: channel[k] for k in ("slug", "name", "edition_id", "active")}
    assert (await client.put(f"/api/signage/channels/{channel['id']}", json=body)).status_code == 200
    assert (await client.get("/api/signage/hall/playlist")).status_code == 404


@pytest.mark.anyio
async def test_crud_reorder_validation_audit_and_fixed_epoch(client, db_session):
    channel, template, _ = await setup(client, db_session)
    duplicate = await client.post(
        "/api/signage/channels", json={"slug": "hall", "name": "Duplicate", "edition_id": channel["edition_id"]}
    )
    assert duplicate.status_code == 409 and duplicate.json()["code"] == "signage_conflict"
    first = await slide(client, channel, template)
    second = await slide(client, channel, template)
    path = f"/api/signage/channels/{channel['id']}/reorder"
    assert (await client.post(path, json={"ordered_ids": [first["id"], first["id"]]})).status_code == 400
    for _ in range(2):
        response = await client.post(path, json={"ordered_ids": [second["id"], first["id"]]})
        assert response.status_code == 200
        assert [s["id"] for s in response.json()] == [second["id"], first["id"]]
    assert (await client.get("/api/signage/hall/playlist")).json()["epoch"] == channel["epoch"]
    assert (await client.delete(f"/api/signage/templates/{template['id']}")).json()["code"] == "signage_in_use"
    assert (
        await client.post(
            "/api/signage/templates", json={"name": "Bad", "layers": [{"id": "x", "kind": "binding", "x": 101}]}
        )
    ).status_code == 422
    body = {k: first[k] for k in first if k != "id"}
    for change in ({"content": {}}, {"duration": 0}, {"starts_at": "2026-01-01T00:00:00"}):
        assert (await client.put(f"/api/signage/slides/{first['id']}", json={**body, **change})).status_code == 422
    for _ in range(2):
        assert (await client.put(f"/api/signage/slides/{first['id']}", json=body)).status_code == 200
    await client.delete(f"/api/signage/slides/{first['id']}")
    assert (await client.delete(f"/api/signage/slides/{first['id']}")).status_code == 404
    await client.delete(f"/api/signage/channels/{channel['id']}")
    assert (await client.get("/api/signage/slides")).json() == []
    assert (await client.delete(f"/api/signage/templates/{template['id']}")).status_code == 204
    audits = (await db_session.scalars(select(AuditEntry).where(AuditEntry.resource_type.like("signage_%")))).all()
    assert {a.action for a in audits} >= {"create", "update", "delete", "reorder"}


@pytest.mark.anyio
async def test_schedule_boundaries_and_template_revision(client, db_session):
    channel, template, _ = await setup(client, db_session)
    now = datetime.now(UTC)
    await slide(client, channel, template, starts_at=now.isoformat(), ends_at=(now + timedelta(seconds=10)).isoformat())
    before = await playlist(db_session, "hall", "en", now - timedelta(microseconds=1))
    at_start = await playlist(db_session, "hall", "en", now)
    at_end = await playlist(db_session, "hall", "en", now + timedelta(seconds=10))
    assert not before.slides and len(at_start.slides) == 1 and not at_end.slides
    assert before._max_age == 0 and at_start._max_age == 5
    body = {key: template[key] for key in ("name", "background", "layers")}
    body["background"]["color"] = "#ffffff"
    assert (await client.put(f"/api/signage/templates/{template['id']}", json=body)).status_code == 200
    assert (await playlist(db_session, "hall", "en", now)).revision != at_start.revision


@pytest.mark.anyio
async def test_assets_and_admin_auth(client, db_session, monkeypatch, tmp_path):
    from app.config import settings

    monkeypatch.setattr(settings, "edition_artwork_public_root", str(tmp_path))
    image = BytesIO()
    Image.new("RGB", (1200, 675), "red").save(image, format="PNG")
    response = await client.post("/api/signage/assets", files={"file": ("image.png", image.getvalue(), "image/png")})
    assert response.status_code == 201, response.text
    url = response.json()["url"]
    repeated = await client.post("/api/signage/assets", files={"file": ("image.png", image.getvalue(), "image/png")})
    assert repeated.status_code == 201 and repeated.json()["url"] != url
    channel, template, _ = await setup(client, db_session)
    await slide(client, channel, template, kind="image", content={"image": url, "text": "Caption"})
    shown = (await client.get("/api/signage/hall/playlist")).json()["slides"][0]
    assert shown["image"] == url and shown["text"] == "Caption"
    missing = "/uploads/signage/" + "0" * 32 + "-" + "0" * 64 + ".jpg"
    invalid = await client.post(
        "/api/signage/templates", json={"name": "Missing", "background": {"kind": "image", "image": missing}}
    )
    assert invalid.status_code == 400 and invalid.json()["code"] == "signage_asset_not_found"
    asset = await client.get(url)
    assert asset.status_code == 200 and asset.headers["content-type"] == "image/jpeg"
    assert (await client.post("/api/signage/assets", files={"file": ("bad.png", b"bad", "image/png")})).json()[
        "code"
    ] == "signage_invalid_image"
    assert (await client.get("/uploads/signage/bad.jpg")).status_code == 404
    app.dependency_overrides.pop(require_admin)
    assert (await client.post("/api/signage/preview", json={})).status_code == 401
    for resource in ("channels", "templates", "slides"):
        assert (await client.get(f"/api/signage/{resource}")).status_code == 401
        assert (await client.post(f"/api/signage/{resource}", json={})).status_code == 401


async def test_required_bindings_checked_on_assignment_and_shared_edit(client, db_session):
    channel, template, _ = await setup(client, db_session)
    empty = (await client.post("/api/signage/templates", json={"name": "Draft"})).json()
    result = await client.post(
        "/api/signage/slides",
        json={
            "channel_id": channel["id"],
            "template_id": empty["id"],
            "kind": "organizations",
        },
    )
    assert result.status_code == 422
    assert result.json()["code"] == "signage_missing_placeholders"
    await slide(client, channel, template, kind="organizations", content={})
    body = {key: template[key] for key in ("name", "background", "layers")}
    body["layers"][0]["visible"] = False
    result = await client.put(f"/api/signage/templates/{template['id']}", json=body)
    assert result.status_code == 422
    assert result.json()["code"] == "signage_missing_placeholders"
    assert (await client.get(f"/api/signage/templates/{template['id']}")).json()["layers"][0]["visible"]


@pytest.mark.anyio
async def test_draft_preview_filters_schedules_and_never_publishes(client, db_session):
    channel, template, _ = await setup(client, db_session)
    now = datetime.now(UTC)
    body = {
        "channel": {key: channel[key] for key in ("name", "slug", "edition_id", "active")},
        "at": now.isoformat(),
        "slides": [
            {
                "channel_id": channel["id"],
                "template_id": template["id"],
                "kind": "organizations",
                "active": True,
                "duration": 7,
                "content": {"organization_type": kind},
                "sort_order": index,
            }
            for index, kind in enumerate(("vendor", "sponsor", "producer"))
        ],
    }
    body["channel"]["active"] = False
    response = await client.post("/api/signage/preview", json=body)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert [row["organization"]["name"] for row in response.json()["slides"]] == [
        "Food",
        "Main",
        "Partner",
        "Alpha",
        "Zulu",
    ]
    assert sum(row["duration"] for row in response.json()["slides"]) == 35
    body["slides"][0]["active"] = False
    body["slides"][1]["starts_at"] = (now + timedelta(hours=1)).isoformat()
    body["slides"][2]["ends_at"] = now.isoformat()
    assert (await client.post("/api/signage/preview", json=body)).json()["slides"] == []
    assert (await client.get("/api/signage/slides")).json() == []
    assert (await client.get("/api/signage/hall/playlist")).json()["slides"] == []
    body["at"] = "2026-10-16T12:00:00"
    assert (await client.post("/api/signage/preview", json=body)).status_code == 422


@pytest.mark.anyio
async def test_public_organization_block_filter(client, db_session):
    channel, template, _ = await setup(client, db_session)
    await slide(client, channel, template, kind="organizations", content={"organization_type": "vendor"})
    result = await client.get("/api/signage/hall/playlist")
    assert [item["organization"]["name"] for item in result.json()["slides"]] == ["Food"]
