"""Standalone durable outbox worker: ``uv run python -m app.worker``."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.config import settings
from app.database import async_session_factory
from app.email import deliver_registration_confirmation
from app.ratelimit import cleanup_expired_rate_limit_buckets
from app.services.outbox_service import REGISTRATION_CONFIRMATION, cleanup_completed_jobs, process_one_job
from app.visitor_session import cleanup_expired_magic_links, cleanup_expired_sessions

logger = logging.getLogger(__name__)


async def run() -> None:
    handlers = {REGISTRATION_CONFIRMATION: deliver_registration_confirmation}
    next_cleanup = datetime.now(UTC)
    while True:
        if datetime.now(UTC) >= next_cleanup:
            async with async_session_factory() as db:
                deleted = await cleanup_completed_jobs(db, retention_days=settings.outbox_retention_days)
            logger.info("Outbox cleanup removed %s terminal jobs", deleted)
            async with async_session_factory() as db:
                deleted_buckets = await cleanup_expired_rate_limit_buckets(db)
            logger.info("Rate-limit bucket cleanup removed %s stale rows", deleted_buckets)
            async with async_session_factory() as db:
                deleted_sessions = await cleanup_expired_sessions(db)
            logger.info("Visitor session cleanup removed %s expired sessions", deleted_sessions)
            async with async_session_factory() as db:
                deleted_links = await cleanup_expired_magic_links(db)
            logger.info("Visitor magic-link cleanup removed %s expired links", deleted_links)
            next_cleanup = datetime.now(UTC) + timedelta(days=1)
        processed = await process_one_job(
            async_session_factory,
            handlers,
            lease_seconds=settings.outbox_lease_seconds,
        )
        if not processed:
            await asyncio.sleep(settings.outbox_poll_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
