"""Announcement scheduling, localization, CRUD, ordering, and audit tests."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Announcement, AuditEntry
from app.schemas import AnnouncementCreate
from app.services.announcements_service import create
from tests.helpers import ADMIN_HEADERS


@pytest.mark.anyio
async def test_public_visibility_is_server_scheduled_and_locale_explicit(client):
    now = datetime.now(UTC)
    payloads = [
        {
            "text_nl": "Nu zichtbaar",
            "active": True,
            "starts_at": (now - timedelta(minutes=1)).isoformat(),
            "ends_at": (now + timedelta(minutes=1)).isoformat(),
        },
        {"text_nl": "Later", "active": True, "starts_at": (now + timedelta(hours=1)).isoformat()},
        {"text_en": "English only", "active": True},
        {"text_nl": "Disabled", "active": False},
    ]
    for payload in payloads:
        assert (await client.post("/api/announcements", json=payload, headers=ADMIN_HEADERS)).status_code == 201
    response = await client.get("/api/announcements/active", params={"locale": "nl"})
    assert response.status_code == 200
    assert [item["text"] for item in response.json()] == ["Nu zichtbaar"]
    response = await client.get("/api/announcements/active", params={"locale": "en"})
    assert [item["text"] for item in response.json()] == ["English only"]


@pytest.mark.anyio
async def test_crud_reorder_and_audit(client, db_session):
    first = (await client.post("/api/announcements", json={"text_nl": "Eerste"}, headers=ADMIN_HEADERS)).json()
    second = (await client.post("/api/announcements", json={"text_nl": "Tweede"}, headers=ADMIN_HEADERS)).json()
    response = await client.post(
        "/api/announcements/reorder", json={"ordered_ids": [second["id"], first["id"]]}, headers=ADMIN_HEADERS
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [second["id"], first["id"]]
    response = await client.put(f"/api/announcements/{first['id']}", json={"active": True}, headers=ADMIN_HEADERS)
    assert response.status_code == 200
    assert response.json()["published_at"] is not None
    assert (
        await client.put(f"/api/announcements/{first['id']}", json={"active": False}, headers=ADMIN_HEADERS)
    ).status_code == 200
    assert (await client.delete(f"/api/announcements/{second['id']}", headers=ADMIN_HEADERS)).status_code == 204
    actions = set((await db_session.execute(select(AuditEntry.action))).scalars())
    assert {
        "announcement_created",
        "announcements_reordered",
        "announcement_published",
        "announcement_unpublished",
        "announcement_deleted",
    } <= actions


@pytest.mark.anyio
async def test_rejects_unsafe_links_naive_dates_and_invalid_windows(client):
    for payload in (
        {"text_nl": "Bad", "link_url": "http://example.com", "link_label_nl": "More"},
        {"text_nl": "Bad", "starts_at": "2026-09-02T12:00:00"},
        {"text_nl": "Bad", "starts_at": "2026-09-03T12:00:00Z", "ends_at": "2026-09-02T12:00:00Z"},
    ):
        assert (await client.post("/api/announcements", json=payload, headers=ADMIN_HEADERS)).status_code == 422


@pytest.mark.anyio
async def test_update_rejects_credential_bearing_link(client):
    item = (await client.post("/api/announcements", json={"text_nl": "Veilig"}, headers=ADMIN_HEADERS)).json()
    response = await client.put(
        f"/api/announcements/{item['id']}",
        json={"link_url": "https://user:secret@example.com/info", "link_label_nl": "Meer"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_concurrent_creates_allocate_distinct_sequential_positions(engine):
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def create_one(text: str) -> dict:
        async with sessions() as session:
            return await create(
                session,
                actor="admin-sub",
                body=AnnouncementCreate(text_nl=text),
                request_id=None,
            )

    created = await asyncio.gather(create_one("Eerste"), create_one("Tweede"))
    assert sorted(item["sort_order"] for item in created) == [0, 1]
    async with sessions() as session:
        positions = (await session.execute(select(Announcement.sort_order))).scalars().all()
    assert sorted(positions) == [0, 1]
