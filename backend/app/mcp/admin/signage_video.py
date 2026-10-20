"""Admin MCP tool implementations for signage video exports.

Mirrors the read and cancel routes of ``app.routers.signage_video``. An export is
created from slide images the admin browser renders and uploads one by one, so
creating, uploading, submitting and downloading stay browser-only; these tools let
an agent see and stop the caller's own jobs. Like the REST routes, jobs are scoped to
the creator (the ``sub`` claim).
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.mcp.utils import as_value_error
from app.services import signage_video as service


async def get_signage_video_capability() -> dict:
    """Whether a media worker is configured, and the limits an export must stay within."""
    return {"available": service.configured(), "max_slides": service.MAX_SLIDES, "max_seconds": service.MAX_SECONDS}


async def list_signage_video_exports(session_factory: Any, actor: str) -> dict:
    async with session_factory() as db:
        return {"exports": await service.list_owned(db, actor)}


async def get_signage_video_export(session_factory: Any, actor: str, job_id: str) -> dict:
    async with session_factory() as db:
        try:
            return service.summary(await service.owned(db, job_id, actor))
        except HTTPException as exc:
            raise as_value_error(exc) from exc


async def cancel_signage_video_export(session_factory: Any, actor: str, job_id: str) -> dict:
    async with session_factory() as db:
        try:
            return await service.cancel(db, job_id, actor)
        except HTTPException as exc:
            raise as_value_error(exc) from exc
