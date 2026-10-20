"""Admin MCP tool implementations for the sold-out waitlist queue.

Mirrors the admin routes of ``app.routers.waitlist``; business logic lives in
``app.services.waitlist_service``. Visitors join the waitlist through the public
form only (spam-guarded and rate-limited per client), so there is no create tool.
"""

from __future__ import annotations

from typing import Any

from app.mcp.utils import MCPToolError
from app.services import waitlist_service as service
from app.services.errors import ServiceError


async def list_waitlist_entries(
    session_factory: Any, *, product_id: str | None = None, event_id: str | None = None
) -> dict:
    """Waitlist entries, oldest first, optionally narrowed to one product or one event."""
    async with session_factory() as db:
        return {"entries": await service.list_entries(db, product_id=product_id, event_id=event_id)}


async def mark_waitlist_entry_handled(session_factory: Any, entry_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await service.mark_handled(db, entry_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc


async def delete_waitlist_entry(session_factory: Any, entry_id: str) -> dict:
    async with session_factory() as db:
        try:
            await service.delete_entry(db, entry_id)
        except ServiceError as exc:
            raise MCPToolError(str(exc)) from exc
    return {"deleted": True, "id": entry_id}
