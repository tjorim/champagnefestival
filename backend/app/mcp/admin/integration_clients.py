"""Admin (write) MCP tool implementations for managed integration clients.

Mirrors ``app.routers.integration_clients``. Business logic lives in
``app.services.integration_clients_service`` and is shared with the REST
router — see issue #807.
"""

from __future__ import annotations

from typing import Any

from app.services import integration_clients_service as ics
from app.services.errors import ServiceError


async def create_integration_client(
    session_factory: Any,
    actor: str,
    *,
    name: str,
    allowed_role: str,
    rate_limit_per_minute: int = ics.DEFAULT_RATE_LIMIT_PER_MINUTE,
) -> dict:
    async with session_factory() as db:
        try:
            client_dict, raw_key = await ics.create_integration_client(
                db,
                actor=actor,
                creator_role="admin",  # _require_admin() already gated this call
                name=name,
                allowed_role=allowed_role,
                rate_limit_per_minute=rate_limit_per_minute,
            )
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc
        return {**client_dict, "key": raw_key}


async def list_integration_clients(session_factory: Any) -> dict:
    async with session_factory() as db:
        return {"integration_clients": await ics.list_integration_clients(db)}


async def revoke_integration_client(session_factory: Any, actor: str, client_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await ics.revoke_integration_client(db, actor=actor, client_id=client_id)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc


async def rotate_integration_client(session_factory: Any, actor: str, client_id: str) -> dict:
    async with session_factory() as db:
        try:
            client_dict, raw_key = await ics.rotate_integration_client(db, actor=actor, client_id=client_id)
        except ServiceError as exc:
            raise ValueError(str(exc)) from exc
        return {**client_dict, "key": raw_key}
