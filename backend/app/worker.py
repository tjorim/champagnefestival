"""Standalone durable outbox worker: ``uv run python -m app.worker``."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.composer_delivery import COMPOSER_MESSAGE_PUSH, deliver_composer_message_dispatch, deliver_composer_push
from app.config import settings
from app.database import async_session_factory
from app.email import deliver_contact_notification, deliver_registration_confirmation
from app.push import WEB_PUSH_TEST, deliver_web_push_test
from app.services.composer_service import COMPOSER_MESSAGE_DISPATCH
from app.services.outbox_service import (
    CONTACT_NOTIFICATION,
    REGISTRATION_CONFIRMATION,
    process_one_job,
)

logger = logging.getLogger(__name__)

# The worker has no HTTP listener, so Docker's HEALTHCHECK (see backend/Dockerfile's
# worker target) checks liveness by this file's mtime instead of a request. Keep the
# staleness threshold there in sync with HEARTBEAT_STALE_SECONDS below.
HEARTBEAT_PATH = Path("/tmp/worker-heartbeat")
HEARTBEAT_STALE_SECONDS = 600


async def run() -> None:
    handlers = {
        REGISTRATION_CONFIRMATION: deliver_registration_confirmation,
        CONTACT_NOTIFICATION: deliver_contact_notification,
        WEB_PUSH_TEST: deliver_web_push_test,
        COMPOSER_MESSAGE_DISPATCH: deliver_composer_message_dispatch,
        COMPOSER_MESSAGE_PUSH: deliver_composer_push,
    }
    while True:
        HEARTBEAT_PATH.touch()
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
