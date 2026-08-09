"""Unit/integration tests for managed integration-client credentials (issue #807).

Covers hashing, lookup, rate limiting, role-escalation prevention, and
revocation/rotation — mirroring the spirit of daynest's
backend/tests/test_integration_clients.py.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.models import IntegrationClient
from app.services import integration_clients_service as ics
from app.services.errors import ConflictError, ValidationFailedError

# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


def test_hash_key_is_deterministic_sha256():
    raw = "cfic_sometoken"
    assert ics._hash_key(raw) == ics._hash_key(raw)
    assert len(ics._hash_key(raw)) == 64  # hex-encoded SHA-256 digest


def test_generated_raw_key_has_prefix_and_high_entropy():
    keys = {ics._generate_raw_key() for _ in range(20)}
    assert all(k.startswith(ics.TOKEN_PREFIX) for k in keys)
    assert len(keys) == 20  # no collisions across 20 draws


# ---------------------------------------------------------------------------
# create_integration_client — validation and role-escalation prevention
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_integration_client_returns_dict_and_raw_key(db_session):
    client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="Home Assistant", allowed_role="volunteer"
    )
    assert client_dict["name"] == "Home Assistant"
    assert client_dict["allowed_role"] == "volunteer"
    assert client_dict["is_active"] is True
    assert client_dict["created_by_actor"] == "admin-1"
    assert raw_key.startswith(ics.TOKEN_PREFIX)
    assert client_dict["key_preview"] == raw_key[-8:]
    # The raw key itself is never persisted anywhere retrievable.
    assert "key" not in client_dict
    assert "key_hash" not in client_dict


@pytest.mark.anyio
async def test_create_integration_client_rejects_unknown_role(db_session):
    with pytest.raises(ValidationFailedError, match="allowed_role"):
        await ics.create_integration_client(
            db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="public"
        )


@pytest.mark.anyio
async def test_create_integration_client_rejects_blank_name(db_session):
    with pytest.raises(ValidationFailedError, match="name"):
        await ics.create_integration_client(
            db_session, actor="admin-1", creator_role="admin", name="   ", allowed_role="volunteer"
        )


@pytest.mark.anyio
async def test_create_integration_client_rejects_non_positive_rate_limit(db_session):
    with pytest.raises(ValidationFailedError, match="rate_limit_per_minute"):
        await ics.create_integration_client(
            db_session,
            actor="admin-1",
            creator_role="admin",
            name="X",
            allowed_role="volunteer",
            rate_limit_per_minute=0,
        )


@pytest.mark.anyio
async def test_create_integration_client_prevents_role_escalation(db_session):
    """A caller whose own tier is 'volunteer' must never be able to mint an
    'admin'-tier integration client — the credential can never outrank its
    creator. (In practice the REST/MCP surfaces are admin-only end to end,
    but this is the last line of defence at the service layer.)"""
    with pytest.raises(ValidationFailedError, match="admin"):
        await ics.create_integration_client(
            db_session, actor="volunteer-1", creator_role="volunteer", name="X", allowed_role="admin"
        )


@pytest.mark.anyio
async def test_create_integration_client_allows_admin_creator_to_mint_volunteer_tier(db_session):
    client_dict, _raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    assert client_dict["allowed_role"] == "volunteer"


@pytest.mark.anyio
async def test_create_integration_client_allows_admin_creator_to_mint_admin_tier(db_session):
    client_dict, _raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="admin"
    )
    assert client_dict["allowed_role"] == "admin"


# ---------------------------------------------------------------------------
# authenticate_integration_client — lookup, revocation, rate limiting
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_authenticate_accepts_valid_active_key(db_session):
    _client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    client = await ics.authenticate_integration_client(db_session, raw_key)
    assert client is not None
    assert client.allowed_role == "volunteer"


@pytest.mark.anyio
async def test_authenticate_rejects_unknown_token(db_session):
    assert await ics.authenticate_integration_client(db_session, f"{ics.TOKEN_PREFIX}bogus") is None


@pytest.mark.anyio
async def test_authenticate_rejects_token_without_expected_prefix(db_session):
    assert await ics.authenticate_integration_client(db_session, "not-a-valid-prefix") is None


@pytest.mark.anyio
async def test_authenticate_rejects_revoked_client(db_session):
    client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])

    assert await ics.authenticate_integration_client(db_session, raw_key) is None


@pytest.mark.anyio
async def test_authenticate_rejects_key_after_rotation(db_session):
    client_dict, old_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    new_dict, new_key = await ics.rotate_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])

    assert await ics.authenticate_integration_client(db_session, old_key) is None
    assert await ics.authenticate_integration_client(db_session, new_key) is not None
    assert new_dict["key_preview"] == new_key[-8:]
    assert new_dict["key_preview"] != client_dict["key_preview"]


@pytest.mark.anyio
async def test_authenticate_updates_last_used_at(db_session):
    client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    assert client_dict["last_used_at"] is None

    client = await ics.authenticate_integration_client(db_session, raw_key)
    assert client is not None
    assert client.last_used_at is not None


@pytest.mark.anyio
async def test_authenticate_throttles_last_used_write_on_rapid_reuse(db_session, monkeypatch):
    client_dict, raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    first = await ics.authenticate_integration_client(db_session, raw_key)
    assert first is not None
    first_seen = first.last_used_at

    # Immediately re-authenticate: within the throttle window, last_used_at must not move.
    second = await ics.authenticate_integration_client(db_session, raw_key)
    assert second is not None
    assert second.last_used_at == first_seen


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_check_rate_limit_allows_up_to_the_configured_limit(db_session):
    client_dict, _ = await ics.create_integration_client(
        db_session, actor="admin", creator_role="admin", name="rl-1", allowed_role="volunteer", rate_limit_per_minute=5
    )
    for _ in range(5):
        assert await ics.check_rate_limit(db_session, client_dict["id"]) is True
    assert await ics.check_rate_limit(db_session, client_dict["id"]) is False


@pytest.mark.anyio
async def test_check_rate_limit_recovers_after_window_expires(db_session):
    client_dict, _ = await ics.create_integration_client(
        db_session, actor="admin", creator_role="admin", name="rl-2", allowed_role="volunteer", rate_limit_per_minute=1
    )
    client = await db_session.get(IntegrationClient, client_dict["id"])
    client.rate_limit_window_started_at = datetime.now(UTC) - timedelta(minutes=2)
    client.rate_limit_window_count = 1
    await db_session.commit()
    assert await ics.check_rate_limit(db_session, client_dict["id"]) is True


@pytest.mark.anyio
async def test_authenticate_rejects_when_rate_limit_exceeded(db_session):
    client_dict, raw_key = await ics.create_integration_client(
        db_session,
        actor="admin-1",
        creator_role="admin",
        name="X",
        allowed_role="volunteer",
        rate_limit_per_minute=2,
    )
    assert await ics.authenticate_integration_client(db_session, raw_key) is not None
    assert await ics.authenticate_integration_client(db_session, raw_key) is not None
    # Third call within the same minute exceeds the per-client limit.
    assert await ics.authenticate_integration_client(db_session, raw_key) is None


# ---------------------------------------------------------------------------
# revoke / rotate
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_revoke_sets_inactive_and_revoked_at(db_session):
    client_dict, _raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    revoked = await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])
    assert revoked["is_active"] is False
    assert revoked["revoked_at"] is not None


@pytest.mark.anyio
async def test_revoke_already_revoked_raises_conflict(db_session):
    client_dict, _raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])
    with pytest.raises(ConflictError, match="already revoked"):
        await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])


@pytest.mark.anyio
async def test_rotate_revoked_client_raises_conflict(db_session):
    client_dict, _raw_key = await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    await ics.revoke_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])
    with pytest.raises(ConflictError, match="revoked"):
        await ics.rotate_integration_client(db_session, actor="admin-1", client_id=client_dict["id"])


@pytest.mark.anyio
async def test_get_integration_client_not_found(db_session):
    from app.services.errors import NotFoundError

    with pytest.raises(NotFoundError, match="not found"):
        await ics.get_integration_client(db_session, "nonexistent")


@pytest.mark.anyio
async def test_list_integration_clients_never_exposes_key_hash(db_session):
    await ics.create_integration_client(
        db_session, actor="admin-1", creator_role="admin", name="X", allowed_role="volunteer"
    )
    listed = await ics.list_integration_clients(db_session)
    assert len(listed) == 1
    assert "key_hash" not in listed[0]
    assert "key" not in listed[0]
