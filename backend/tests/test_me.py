"""Integration tests for /api/me/* self-service endpoints."""

from __future__ import annotations

from typing import cast

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PebbleAccessToken, Registration, User
from app.routers import me
from app.services.pebble_access import rotate_pebble_token
from tests.helpers import _post_registration

ADMIN_HEADERS = {"Authorization": "Bearer admin-token"}


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _RacingUserSession:
    def __init__(self, existing_user: User):
        self.results = [None, existing_user]
        self.added_user: User | None = None
        self.rolled_back = False
        self.refreshed_user: User | None = None

    async def execute(self, _statement):
        return _ScalarResult(self.results.pop(0))

    def add(self, user: User) -> None:
        self.added_user = user

    async def commit(self) -> None:
        raise IntegrityError("insert users", {}, Exception("duplicate oidc_subject"))

    async def rollback(self) -> None:
        self.rolled_back = True

    async def refresh(self, user: User) -> None:
        self.refreshed_user = user


@pytest.mark.anyio
async def test_get_or_create_user_recovers_from_concurrent_insert(monkeypatch):
    existing_user = User(id="usr-existing", oidc_subject="visitor-sub")
    session = _RacingUserSession(existing_user)
    monkeypatch.setattr(me, "make_id", lambda _prefix: "usr-new")

    user = await me._get_or_create_user(cast(AsyncSession, session), "visitor-sub")

    assert user is existing_user
    assert session.added_user is not None
    assert session.added_user.oidc_subject == "visitor-sub"
    assert session.rolled_back is True
    assert session.refreshed_user is existing_user


@pytest.mark.anyio
async def test_me_registrations_empty_for_new_user(me_client):
    """A freshly provisioned user has no registrations."""
    r = await me_client.get("/api/me/registrations")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.anyio
async def test_me_registrations_auto_provisions_user(me_client, db_session):
    """Calling /api/me/registrations creates a User record if none exists."""
    from sqlalchemy import select

    from app.models import User

    r = await me_client.get("/api/me/registrations")
    assert r.status_code == 200

    result = await db_session.execute(select(User).where(User.oidc_subject == "visitor-sub"))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.oidc_subject == "visitor-sub"


@pytest.mark.anyio
async def test_pebble_token_is_scoped_and_rotates(me_client, db_session):
    first = await me_client.post("/api/me/pebble-token")
    assert first.status_code == 200
    assert first.headers["cache-control"] == "no-store"
    first_token = first.json()["token"]
    assert first_token.startswith("cfpat_")

    glance = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert glance.status_code == 200
    assert glance.json() == []

    second = await me_client.post("/api/me/pebble-token")
    assert second.status_code == 200
    second_token = second.json()["token"]
    assert second_token != first_token

    revoked = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert revoked.status_code == 401

    active = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert active.status_code == 200

    rows = (await db_session.execute(select(PebbleAccessToken))).scalars().all()
    assert len(rows) == 1
    assert rows[0].token_hash not in {first_token, second_token}


@pytest.mark.anyio
async def test_pebble_token_can_be_revoked(me_client):
    created = await me_client.post("/api/me/pebble-token")
    token = created.json()["token"]

    response = await me_client.delete("/api/me/pebble-token")
    assert response.status_code == 204

    glance = await me_client.get(
        "/api/pebble/registrations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert glance.status_code == 401


@pytest.mark.anyio
async def test_pebble_token_cannot_access_oidc_self_service(client, db_session):
    user = User(id="usr-pebble-isolation", oidc_subject="pebble-isolation-sub")
    db_session.add(user)
    await db_session.commit()
    token = await rotate_pebble_token(db_session, user.id)
    headers = {"Authorization": f"Bearer {token}"}

    glance = await client.get("/api/pebble/registrations", headers=headers)
    self_service = await client.get("/api/me/registrations", headers=headers)

    assert glance.status_code == 200
    assert self_service.status_code == 401


@pytest.mark.anyio
async def test_delete_me_unlinks_account_without_deleting_registration(me_client, client, db_session):
    """Deleting a portal account keeps reservation/order records for operations."""
    user = User(id="usr-visitor", oidc_subject="visitor-sub")
    db_session.add(user)
    response = await _post_registration(client)
    assert response.status_code == 201
    registration_id = response.json()["id"]

    registration = await db_session.get(Registration, registration_id)
    assert registration is not None
    registration.user_id = user.id
    await db_session.commit()

    delete_response = await me_client.delete("/api/me")
    assert delete_response.status_code == 204

    deleted_user = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert deleted_user is None

    retained_registration = await db_session.get(Registration, registration_id)
    assert retained_registration is not None
    await db_session.refresh(retained_registration)
    assert retained_registration.user_id is None
    assert isinstance(retained_registration.pre_orders, list)
