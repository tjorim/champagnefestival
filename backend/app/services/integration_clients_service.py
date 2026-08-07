"""Managed integration-client credentials for machine automation (issue #807).

Adapts daynest's database-backed integration-client pattern to
Champagnefestival's stateless-JWT role model: there is no local ``User``
table to own a client, so each ``IntegrationClient`` instead records
``created_by_actor`` (the admin's OIDC ``sub``) and a single ``allowed_role``
fixed at creation. A credential can never be created with a role tier more
privileged than its creator's own tier — see ``create_integration_client``.

Hashing follows the same convention as ``app.services.pebble_access``: a
plain SHA-256 digest of a high-entropy, server-generated token. An HMAC with
a server-side secret buys nothing extra at this entropy (128+ bits pulled
from ``secrets.token_urlsafe``) — brute force is infeasible either way — so a
keyed hash would only add a secret to manage without a security benefit.
"""

from __future__ import annotations

import collections
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import IntegrationClient
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.utils import make_id

TOKEN_PREFIX = "cfic_"
ALLOWED_ROLES = ("admin", "volunteer")
"""The only role tiers an integration client may resolve to. Deliberately
excludes 'public' — a public-only credential has no reason to be issued, since
every public MCP tool already works with no authentication at all."""

DEFAULT_RATE_LIMIT_PER_MINUTE = 120
_LAST_USED_UPDATE_INTERVAL = timedelta(minutes=5)

# In-process sliding-window request timestamps, keyed by client id. Mirrors
# app.ratelimit's per-IP limiter: process-local, so a multi-worker deployment
# multiplies the effective limit by worker count. Acceptable for an
# operator-issued automation credential; replace with a shared store if
# strict enforcement across workers becomes necessary.
_request_log: dict[str, collections.deque[datetime]] = {}


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _generate_raw_key() -> str:
    return f"{TOKEN_PREFIX}{secrets.token_urlsafe(32)}"


def integration_client_to_dict(client: IntegrationClient) -> dict:
    """Serialise a client — deliberately never includes key_hash or the raw key."""
    return {
        "id": client.id,
        "name": client.name,
        "allowed_role": client.allowed_role,
        "created_by_actor": client.created_by_actor,
        "rate_limit_per_minute": client.rate_limit_per_minute,
        "is_active": client.is_active,
        "created_at": client.created_at,
        "last_used_at": client.last_used_at,
        "revoked_at": client.revoked_at,
    }


async def create_integration_client(
    db: AsyncSession,
    *,
    actor: str,
    creator_role: str,
    name: str,
    allowed_role: str,
    rate_limit_per_minute: int = DEFAULT_RATE_LIMIT_PER_MINUTE,
    request_id: str | None = None,
) -> tuple[dict, str]:
    """Create a new integration client.

    Returns ``(dict, raw_key)`` — the raw key is shown exactly once here and is
    never recoverable afterward; only its hash is persisted.
    """
    if allowed_role not in ALLOWED_ROLES:
        raise ValidationFailedError(f"allowed_role must be one of {ALLOWED_ROLES}.")
    # An integration credential must never be able to mint a more privileged
    # credential than its own creator's tier: 'admin' outranks 'volunteer'.
    # In practice this endpoint is admin-only end to end, but this guard keeps
    # that invariant true even if a future caller path changes.
    if allowed_role == "admin" and creator_role != "admin":
        raise ValidationFailedError("Only an admin caller may create an admin-tier integration client.")
    if not name.strip():
        raise ValidationFailedError("name must not be blank.")
    if rate_limit_per_minute <= 0:
        raise ValidationFailedError("rate_limit_per_minute must be greater than 0.")

    raw_key = _generate_raw_key()
    client = IntegrationClient(
        id=make_id("ic"),
        name=name.strip(),
        key_hash=_hash_key(raw_key),
        allowed_role=allowed_role,
        created_by_actor=actor,
        rate_limit_per_minute=rate_limit_per_minute,
    )
    db.add(client)
    await db.flush()
    await write_audit_entry(
        db,
        actor=actor,
        action="integration_client_created",
        resource_type="integration_client",
        resource_id=client.id,
        request_id=request_id,
        details={"name": client.name, "allowed_role": client.allowed_role},
    )
    await db.commit()
    await db.refresh(client)
    return integration_client_to_dict(client), raw_key


async def list_integration_clients(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(IntegrationClient).order_by(IntegrationClient.created_at))
    return [integration_client_to_dict(c) for c in result.scalars().all()]


async def get_integration_client(db: AsyncSession, client_id: str) -> IntegrationClient:
    client = await db.get(IntegrationClient, client_id)
    if client is None:
        raise NotFoundError(f"Integration client '{client_id}' not found.")
    return client


async def revoke_integration_client(
    db: AsyncSession, *, actor: str, client_id: str, request_id: str | None = None
) -> dict:
    client = await get_integration_client(db, client_id)
    if not client.is_active:
        raise ConflictError(f"Integration client '{client_id}' is already revoked.")
    client.is_active = False
    client.revoked_at = datetime.now(UTC)
    await write_audit_entry(
        db,
        actor=actor,
        action="integration_client_revoked",
        resource_type="integration_client",
        resource_id=client_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    await db.refresh(client)
    return integration_client_to_dict(client)


async def rotate_integration_client(
    db: AsyncSession, *, actor: str, client_id: str, request_id: str | None = None
) -> tuple[dict, str]:
    """Replace a client's credential with a freshly generated one.

    Returns ``(dict, raw_key)`` — same one-time-reveal contract as creation.
    """
    client = await get_integration_client(db, client_id)
    if not client.is_active:
        raise ConflictError(f"Integration client '{client_id}' is revoked; create a new one instead.")
    raw_key = _generate_raw_key()
    client.key_hash = _hash_key(raw_key)
    client.last_used_at = None
    await write_audit_entry(
        db,
        actor=actor,
        action="integration_client_rotated",
        resource_type="integration_client",
        resource_id=client_id,
        request_id=request_id,
        details={},
    )
    await db.commit()
    await db.refresh(client)
    return integration_client_to_dict(client), raw_key


async def get_client_by_token_hash(db: AsyncSession, token_hash: str) -> IntegrationClient | None:
    result = await db.execute(select(IntegrationClient).where(IntegrationClient.key_hash == token_hash))
    return result.scalar_one_or_none()


def check_rate_limit(client_id: str, limit_per_minute: int) -> bool:
    """In-process sliding-window rate limit for one client. Returns True if within limit."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(minutes=1)
    bucket = _request_log.setdefault(client_id, collections.deque())
    while bucket and bucket[0] < cutoff:
        bucket.popleft()
    if len(bucket) >= limit_per_minute:
        return False
    bucket.append(now)
    return True


async def authenticate_integration_client(db: AsyncSession, raw_token: str) -> IntegrationClient | None:
    """Validate a raw bearer token against the integration_clients table.

    Returns the active, rate-limit-passing client, or ``None`` on any failure
    (unknown token, inactive/revoked client, rate limit exceeded) — deliberately
    a single opaque failure mode so a caller can't distinguish "wrong token"
    from "right token, but revoked" or "right token, but rate limited".
    Updates ``last_used_at`` (throttled, like app.services.pebble_access, to
    avoid a write on every single call) on success.
    """
    if not raw_token.startswith(TOKEN_PREFIX):
        return None
    client = await get_client_by_token_hash(db, _hash_key(raw_token))
    if client is None or not client.is_active:
        return None
    if not check_rate_limit(client.id, client.rate_limit_per_minute):
        return None

    now = datetime.now(UTC)
    last_used_at = client.last_used_at
    if last_used_at is not None and last_used_at.tzinfo is None:
        last_used_at = last_used_at.replace(tzinfo=UTC)
    if last_used_at is None or now - last_used_at >= _LAST_USED_UPDATE_INTERVAL:
        client.last_used_at = now
        await db.commit()
    return client
