"""Durable outbox enqueueing, atomic claiming, retries, and delivery results."""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable, Mapping
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit import write_audit_entry
from app.models import DeliveryAttempt, OutboxJob
from app.utils import make_id

REGISTRATION_CONFIRMATION = "registration_confirmation"
Handler = Callable[[str], Awaitable[bool]]


async def enqueue_job(
    db: AsyncSession,
    *,
    job_type: str,
    resource_type: str,
    resource_id: str,
    deduplication_key: str,
    actor: str,
    request_id: str | None = None,
    scheduled_at: datetime | None = None,
) -> OutboxJob:
    """Add work to the caller's transaction; the caller owns the commit."""
    job = OutboxJob(
        id=make_id("job"),
        job_type=job_type,
        resource_type=resource_type,
        resource_id=resource_id,
        deduplication_key=deduplication_key,
        scheduled_at=scheduled_at or datetime.now(UTC),
    )
    db.add(job)
    await write_audit_entry(
        db,
        actor=actor,
        action="delivery_queued",
        resource_type=resource_type,
        resource_id=resource_id,
        request_id=request_id,
        details={"job_id": job.id, "job_type": job_type},
    )
    return job


async def enqueue_registration_confirmation(
    db: AsyncSession, registration_id: str, *, actor: str, request_id: str | None = None
) -> OutboxJob:
    return await enqueue_job(
        db,
        job_type=REGISTRATION_CONFIRMATION,
        resource_type="registration",
        resource_id=registration_id,
        deduplication_key=f"registration-confirmation:{registration_id}",
        actor=actor,
        request_id=request_id,
    )


async def claim_next_job(db: AsyncSession, *, lease_seconds: int = 300) -> OutboxJob | None:
    """Atomically lease one ready job; expired processing leases are recoverable."""
    now = datetime.now(UTC)
    job = await db.scalar(
        select(OutboxJob)
        .where(
            OutboxJob.scheduled_at <= now,
            or_(
                OutboxJob.state == "pending",
                and_(OutboxJob.state == "processing", OutboxJob.locked_until < now),
            ),
        )
        .order_by(OutboxJob.scheduled_at, OutboxJob.created_at, OutboxJob.id)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if job is None:
        await db.rollback()
        return None
    job.state = "processing"
    job.attempt_count += 1
    job.locked_until = now + timedelta(seconds=lease_seconds)
    job.claim_token = secrets.token_urlsafe(24)
    await db.commit()
    return job


async def finish_attempt(
    db: AsyncSession,
    job_id: str,
    *,
    claim_token: str,
    started_at: datetime,
    delivered: bool,
    error_code: str | None = None,
) -> bool:
    now = datetime.now(UTC)
    job = await db.scalar(
        select(OutboxJob)
        .where(
            OutboxJob.id == job_id,
            OutboxJob.state == "processing",
            OutboxJob.claim_token == claim_token,
        )
        .with_for_update()
    )
    if job is None:
        await db.rollback()
        return False
    outcome = "delivered" if delivered else "failed"
    db.add(
        DeliveryAttempt(
            id=make_id("attempt"),
            job_id=job.id,
            attempt_number=job.attempt_count,
            outcome=outcome,
            error_code=error_code,
            started_at=started_at,
            finished_at=now,
        )
    )
    job.locked_until = None
    job.claim_token = None
    job.last_error_code = error_code
    if delivered:
        job.state = "delivered"
        job.completed_at = now
    elif job.attempt_count >= job.max_attempts:
        job.state = "failed"
        job.completed_at = now
    else:
        job.state = "pending"
        job.scheduled_at = now + timedelta(seconds=min(60 * 2 ** (job.attempt_count - 1), 3600))
    await write_audit_entry(
        db,
        actor="outbox-worker",
        action="delivery_succeeded"
        if delivered
        else ("delivery_failed" if job.state == "failed" else "delivery_retry_scheduled"),
        resource_type=job.resource_type,
        resource_id=job.resource_id,
        details={"job_id": job.id, "job_type": job.job_type, "attempt": job.attempt_count, "error_code": error_code},
    )
    await db.commit()
    return True


async def process_one_job(
    session_factory: async_sessionmaker[AsyncSession],
    handlers: Mapping[str, Handler],
    *,
    lease_seconds: int = 300,
) -> bool:
    async with session_factory() as db:
        job = await claim_next_job(db, lease_seconds=lease_seconds)
    if job is None:
        return False
    claim_token = job.claim_token
    if claim_token is None:
        raise RuntimeError("Claimed outbox job has no claim token")

    started_at = datetime.now(UTC)
    delivered = False
    error_code: str | None = None
    handler = handlers.get(job.job_type)
    if handler is None:
        error_code = "unsupported_job_type"
    else:
        try:
            delivered = await handler(job.resource_id)
            if not delivered:
                error_code = "delivery_rejected"
        except Exception as exc:
            error_code = type(exc).__name__[:100]

    async with session_factory() as db:
        await finish_attempt(
            db,
            job.id,
            claim_token=claim_token,
            started_at=started_at,
            delivered=delivered,
            error_code=error_code,
        )
    return True


async def cleanup_completed_jobs(db: AsyncSession, *, retention_days: int) -> int:
    """Delete terminal jobs (and cascading attempts) after the retention window."""
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    deleted_ids = (
        await db.scalars(
            delete(OutboxJob)
            .where(
                OutboxJob.state.in_(("delivered", "failed")),
                OutboxJob.completed_at < cutoff,
            )
            .returning(OutboxJob.id)
        )
    ).all()
    await db.commit()
    return len(deleted_ids)
