"""Durable outbox claiming, recovery, retry, and isolation tests."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import DeliveryAttempt, OutboxJob
from app.services.outbox_service import claim_next_job, cleanup_completed_jobs, enqueue_job, process_one_job


async def _enqueue(db, resource_id: str, *, max_attempts: int = 5) -> OutboxJob:
    job = await enqueue_job(
        db,
        job_type="test_delivery",
        resource_type="registration",
        resource_id=resource_id,
        deduplication_key=f"test:{resource_id}",
        actor="test-admin",
    )
    job.max_attempts = max_attempts
    await db.commit()
    return job


@pytest.mark.anyio
async def test_two_workers_claim_one_job_once(engine, db_session):
    await _enqueue(db_session, "reg-concurrent")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def claim():
        async with factory() as session:
            return await claim_next_job(session)

    claimed = await asyncio.gather(claim(), claim())
    assert sum(job is not None for job in claimed) == 1


@pytest.mark.anyio
async def test_expired_processing_lease_is_reclaimed(db_session):
    job = await _enqueue(db_session, "reg-crashed")
    job.state = "processing"
    job.locked_until = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    reclaimed = await claim_next_job(db_session)
    assert reclaimed is not None
    assert reclaimed.id == job.id
    assert reclaimed.attempt_count == 1


@pytest.mark.anyio
async def test_poison_job_fails_without_blocking_next_job(engine, db_session):
    poison = await _enqueue(db_session, "reg-poison", max_attempts=1)
    healthy = await _enqueue(db_session, "reg-healthy")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def handler(resource_id: str) -> bool:
        return resource_id == "reg-healthy"

    assert await process_one_job(factory, {"test_delivery": handler}) is True
    assert await process_one_job(factory, {"test_delivery": handler}) is True

    await db_session.refresh(poison)
    await db_session.refresh(healthy)
    assert poison.state == "failed"
    assert healthy.state == "delivered"
    attempts = (await db_session.scalars(select(DeliveryAttempt).order_by(DeliveryAttempt.started_at))).all()
    assert [attempt.outcome for attempt in attempts] == ["failed", "delivered"]


@pytest.mark.anyio
async def test_retry_uses_bounded_backoff(db_session):
    job = await _enqueue(db_session, "reg-retry")
    claimed = await claim_next_job(db_session)
    assert claimed is not None
    from app.services.outbox_service import finish_attempt

    before = datetime.now(UTC)
    await finish_attempt(
        db_session,
        job.id,
        started_at=before,
        delivered=False,
        error_code="temporary",
    )
    await db_session.refresh(job)
    assert job.state == "pending"
    assert before + timedelta(seconds=60) <= job.scheduled_at <= before + timedelta(seconds=65)


@pytest.mark.anyio
async def test_outbox_diagnostics_list_jobs_without_deduplication_key(client, db_session):
    await _enqueue(db_session, "reg-visible")
    response = await client.get("/api/outbox?state=pending")
    assert response.status_code == 200
    assert response.json()[0]["resource_id"] == "reg-visible"
    assert "deduplication_key" not in response.json()[0]


@pytest.mark.anyio
async def test_outbox_diagnostics_require_admin(unauth_client):
    assert (await unauth_client.get("/api/outbox")).status_code == 401


@pytest.mark.anyio
async def test_cleanup_only_removes_old_terminal_jobs(db_session):
    old = await _enqueue(db_session, "reg-old")
    pending = await _enqueue(db_session, "reg-pending")
    old.state = "delivered"
    old.completed_at = datetime.now(UTC) - timedelta(days=91)
    await db_session.commit()
    assert await cleanup_completed_jobs(db_session, retention_days=90) == 1
    assert await db_session.get(OutboxJob, old.id) is None
    assert await db_session.get(OutboxJob, pending.id) is not None
