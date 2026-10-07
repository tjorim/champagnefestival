"""Exhibitor manager login, live authorization and independent scope (#1192)."""

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.auth import require_admin, require_volunteer
from app.main import app
from app.models import Exhibitor, ExhibitorManagerMagicLink, ExhibitorManagerSession, Person


@pytest.fixture
async def manager(db_session, monkeypatch):
    import app.routers.exhibitor_manager_auth as auth

    sent = []

    async def send(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(auth, "send_exhibitor_manager_magic_link_email", send)
    person = Person(id="per-manager", name="Contact Manager", email=" Contact@Example.com ")
    other = Person(id="per-other", name="Other Contact", email="other@example.com")
    db_session.add_all([person, other])
    await db_session.flush()
    rows = [
        Exhibitor(name="One", contact_person_id=person.id),
        Exhibitor(name="Two", contact_person_id=person.id),
        Exhibitor(name="Other", contact_person_id=other.id),
    ]
    db_session.add_all(rows)
    await db_session.commit()
    return person, rows, sent


async def login(client, manager):
    await client.post("/api/exhibitor-manager-sessions/request", json={"email": "CONTACT@example.com"})
    return await client.post("/api/exhibitor-manager-sessions/redeem", json={"token": manager[2][-1]["token"]})


async def test_non_enumerating_request_and_rate_limit(client, manager):
    unknown = await client.post("/api/exhibitor-manager-sessions/request", json={"email": "unknown@example.com"})
    assert manager[2] == []
    known = await client.post("/api/exhibitor-manager-sessions/request", json={"email": "contact@example.com"})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert len(manager[2]) == 1
    for _ in range(3):
        assert (
            await client.post("/api/exhibitor-manager-sessions/request", json={"email": "unknown@example.com"})
        ).status_code == 202
    assert (
        await client.post("/api/exhibitor-manager-sessions/request", json={"email": "unknown@example.com"})
    ).status_code == 429


async def test_own_exhibitors_and_live_contact_revocation(client, db_session, manager):
    assert (await login(client, manager)).status_code == 200
    response = await client.get("/api/me/exhibitors")
    assert response.headers["cache-control"] == "no-store"
    assert [row["name"] for row in response.json()] == ["One", "Two"]
    manager[1][0].contact_person_id = "per-other"
    manager[1][1].contact_person_id = None
    await db_session.commit()
    assert (await client.get("/api/me/exhibitors")).json() == []
    manager[1][0].contact_person_id = manager[0].id
    manager[0].email = "changed@example.com"
    await db_session.commit()
    assert (await client.get("/api/me/exhibitors")).json() == []


async def test_replay_sign_out_and_hashed_credentials(client, db_session, manager):
    response = await login(client, manager)
    cookie = response.cookies["exhibitor_manager_session"]
    assert "HttpOnly" in response.headers["set-cookie"]
    row = await db_session.scalar(select(ExhibitorManagerSession))
    assert row.session_hash == hashlib.sha256(cookie.encode()).hexdigest()
    assert row.email == "contact@example.com"
    assert (
        await client.post("/api/exhibitor-manager-sessions/redeem", json={"token": manager[2][-1]["token"]})
    ).status_code == 401
    assert (await client.get("/api/exhibitor-manager-sessions/status")).json()["authenticated"]
    for _ in range(2):
        assert (await client.post("/api/exhibitor-manager-sessions/sign-out")).status_code == 204
    client.cookies.set("exhibitor_manager_session", cookie)
    assert (await client.get("/api/me/exhibitors")).status_code == 401


async def test_expiry_and_superseded_links(client, db_session, manager):
    await client.post("/api/exhibitor-manager-sessions/request", json={"email": "contact@example.com"})
    old = manager[2][-1]["token"]
    await client.post("/api/exhibitor-manager-sessions/request", json={"email": "contact@example.com"})
    assert (await client.post("/api/exhibitor-manager-sessions/redeem", json={"token": old})).status_code == 401
    link = await db_session.scalar(select(ExhibitorManagerMagicLink))
    link.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    assert (
        await client.post("/api/exhibitor-manager-sessions/redeem", json={"token": manager[2][-1]["token"]})
    ).status_code == 401


async def test_visitor_and_staff_cannot_grant_manager_scope(client, manager, monkeypatch):
    import app.routers.visitor_auth as visitor

    tokens = []

    async def send(**kwargs):
        tokens.append(kwargs["token"])
        return True

    monkeypatch.setattr(visitor, "send_visitor_magic_link_email", send)
    await client.post("/api/visitor-sessions/request", json={"email": "contact@example.com"})
    await client.post("/api/visitor-sessions/redeem", json={"token": tokens[-1]})
    assert (await client.get("/api/me/exhibitors")).status_code == 401
    assert (await client.get("/api/me/exhibitors", headers={"Authorization": "Bearer admin-token"})).status_code == 401
    assert (await client.post("/api/exhibitor-manager-sessions/redeem", json={"token": tokens[-1]})).status_code == 401


async def test_manager_grants_no_visitor_or_staff_scope(client, manager):
    await login(client, manager)
    app.dependency_overrides.pop(require_admin)
    app.dependency_overrides.pop(require_volunteer)
    assert (await client.get("/api/me/registrations")).status_code == 401
    assert not (await client.get("/api/visitor-sessions/status")).json()["authenticated"]
    assert (await client.get("/api/people")).status_code == 401
    assert (await client.get("/api/me/volunteer")).status_code == 401


@pytest.mark.parametrize("deadline", ["expires_at", "hard_expires_at"])
async def test_expired_session(client, db_session, manager, deadline):
    await login(client, manager)
    row = await db_session.scalar(select(ExhibitorManagerSession))
    setattr(row, deadline, datetime.now(UTC) - timedelta(seconds=1))
    await db_session.commit()
    assert not (await client.get("/api/exhibitor-manager-sessions/status")).json()["authenticated"]
    assert (await client.get("/api/me/exhibitors")).status_code == 401


async def test_contact_without_email_receives_no_link(client, db_session, manager):
    manager[0].email = ""
    await db_session.commit()
    response = await client.post("/api/exhibitor-manager-sessions/request", json={"email": "contact@example.com"})
    assert response.status_code == 202
    assert manager[2] == []


async def test_delivery_failure_still_returns_accepted(client, manager, monkeypatch):
    import app.routers.exhibitor_manager_auth as auth

    async def fail(**kwargs):
        raise RuntimeError("SMTP unavailable")

    monkeypatch.setattr(auth, "send_exhibitor_manager_magic_link_email", fail)
    response = await client.post("/api/exhibitor-manager-sessions/request", json={"email": "contact@example.com"})
    assert response.status_code == 202
    assert response.json()["delivery_mode"] == "email"


async def test_idle_refresh_is_capped_and_housekeeping(client, db_session, manager):
    from app.exhibitor_manager_session import cleanup_expired_magic_links, cleanup_expired_sessions

    await login(client, manager)
    row = await db_session.scalar(select(ExhibitorManagerSession))
    row.expires_at = datetime.now(UTC) + timedelta(hours=1)
    row.hard_expires_at = datetime.now(UTC) + timedelta(days=2)
    await db_session.commit()
    await client.get("/api/me/exhibitors")
    await db_session.refresh(row)
    assert row.expires_at == row.hard_expires_at
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    assert await cleanup_expired_sessions(db_session) == 1
    assert await cleanup_expired_magic_links(db_session) == 1
    assert await cleanup_expired_sessions(db_session) == 0
    assert await cleanup_expired_magic_links(db_session) == 0


async def test_concurrent_redemption_creates_one_session(client, db_session, engine, manager, monkeypatch):
    import asyncio

    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from starlette.responses import Response

    import app.routers.exhibitor_manager_auth as auth
    from app.schemas import ExhibitorManagerSessionStatus, RegistrationAccessLookupRequest

    await client.post("/api/exhibitor-manager-sessions/request", json={"email": "contact@example.com"})
    token = manager[2][-1]["token"]
    first_locked = asyncio.Event()
    release_first = asyncio.Event()
    original = auth._get_magic_link_or_401
    paused = False

    async def pause_first(db, token):
        nonlocal paused
        link = await original(db, token)
        if not paused:
            paused = True
            first_locked.set()
            await release_first.wait()
        return link

    monkeypatch.setattr(auth, "_get_magic_link_or_401", pause_first)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def attempt():
        async with factory() as db:
            try:
                return await auth.redeem_exhibitor_manager_magic_link(
                    RegistrationAccessLookupRequest(token=token), Response(), db
                )
            except HTTPException as exc:
                return exc.status_code

    first = asyncio.create_task(attempt())
    await asyncio.wait_for(first_locked.wait(), timeout=5)
    second = asyncio.create_task(attempt())
    release_first.set()
    outcomes = await asyncio.wait_for(asyncio.gather(first, second), timeout=5)
    assert sum(isinstance(outcome, ExhibitorManagerSessionStatus) for outcome in outcomes) == 1
    assert outcomes.count(401) == 1
    assert len((await db_session.scalars(select(ExhibitorManagerSession))).all()) == 1
