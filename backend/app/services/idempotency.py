"""Idempotency-key support for bulk/import write operations (#837).

A caller may pass a client-supplied ``idempotency_key`` alongside a bulk
create request. The first successful call stores its result keyed by
(``scope``, ``key``); a retried call with the same key and an identical
request body (detected via a hash of the canonicalised payload) replays that
stored result instead of re-executing the write, so a retry after a timeout
or partial failure can't create duplicate records. Reusing the same key with
a *different* body is rejected as a conflict rather than silently applied or
silently replayed.

Used by every ``bulk_create_*`` function in ``app.services.*_service`` — see
those for the pattern: check the key first (short-circuiting all validation
if it's a safe replay), do the work, then stage the key's result in the same
transaction as the records it describes via ``record_idempotency_key`` so it
only becomes visible once the write actually commits.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IdempotencyKey
from app.services.errors import ConflictError
from app.utils import make_id


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def hash_request(payload: Any) -> str:
    """Return a stable hash of a JSON-serialisable request payload."""
    canonical = json.dumps(_json_safe(payload), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def check_idempotency_key(db: AsyncSession, *, scope: str, key: str, request_hash: str) -> dict | None:
    """Return the stored response to replay, or None if this is a first use.

    Raises ``ConflictError`` if ``key`` was already used within ``scope`` for
    a request with a different body — that's not a safe retry.
    """
    result = await db.execute(select(IdempotencyKey).where(IdempotencyKey.scope == scope, IdempotencyKey.key == key))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    if row.request_hash != request_hash:
        raise ConflictError(f"Idempotency key '{key}' was already used for a different request.")
    return row.response_body


def record_idempotency_key(
    db: AsyncSession, *, scope: str, key: str, actor: str, request_hash: str, response_body: dict
) -> None:
    """Stage the (uncommitted) result for (``scope``, ``key``).

    Caller commits as part of the same transaction as the records the
    response describes — see ``commit_with_idempotency_guard``.
    """
    db.add(
        IdempotencyKey(
            id=make_id("idem"),
            scope=scope,
            key=key,
            actor=actor,
            request_hash=request_hash,
            response_body=_json_safe(response_body),
        )
    )


async def commit_with_idempotency_guard(db: AsyncSession, *, idempotency_key: str | None) -> None:
    """Commit, translating a concurrent duplicate-key race into a clean ConflictError.

    Two concurrent retries with the same key can both pass ``check_idempotency_key``
    (neither has committed yet) and both attempt to insert the same (scope, key)
    row; the loser hits the unique constraint at commit time rather than earlier.
    """
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if idempotency_key:
            raise ConflictError(
                f"Idempotency key '{idempotency_key}' is already in use by a concurrent request; retry."
            ) from exc
        raise
