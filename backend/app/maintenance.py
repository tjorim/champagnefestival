"""Run-once maintenance commands: ``uv run python -m app.maintenance housekeeping``.

The VPS schedules ``housekeeping`` daily (tjorim/apps); the application runs no
cleanup scheduler of its own, and the outbox worker only delivers jobs.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.ratelimit import cleanup_expired_rate_limit_buckets
from app.services.outbox_service import cleanup_completed_jobs
from app.services.push_service import cleanup_expired_subscriptions
from app.visitor_session import cleanup_expired_magic_links, cleanup_expired_sessions

logger = logging.getLogger(__name__)

Sweep = Callable[[AsyncSession], Awaitable[int]]

SWEEPS: tuple[tuple[str, Sweep], ...] = (
    ("terminal outbox jobs", lambda db: cleanup_completed_jobs(db, retention_days=settings.outbox_retention_days)),
    ("stale rate-limit buckets", cleanup_expired_rate_limit_buckets),
    ("expired visitor sessions", cleanup_expired_sessions),
    ("expired visitor magic links", cleanup_expired_magic_links),
    ("stale push subscriptions", cleanup_expired_subscriptions),
)


async def housekeeping() -> int:
    """Run every sweep in its own session; return how many failed.

    A failing sweep never skips the others, and each is idempotent, so the next
    scheduled run simply repeats it.
    """
    failed = 0
    for name, sweep in SWEEPS:
        try:
            async with async_session_factory() as db:
                removed = await sweep(db)
        except Exception:
            failed += 1
            logger.exception("Housekeeping failed for %s", name)
        else:
            logger.info("Housekeeping removed %s %s", removed, name)
    return failed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.maintenance")
    parser.add_subparsers(dest="command", required=True).add_parser("housekeeping", help="delete expired or stale rows")
    parser.parse_args(argv)
    return 1 if asyncio.run(housekeeping()) else 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    sys.exit(main())
