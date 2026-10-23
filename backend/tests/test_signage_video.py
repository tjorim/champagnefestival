"""Frozen upload protocol, authorization, durable retry identity and lifecycle."""

import hashlib
import io
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from PIL import Image
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.auth import get_actor_id, require_admin
from app.config import settings
from app.main import app
from app.models import SignageVideoExport
from app.services import signage_video as service
from tests.helpers import requires_postgres
from tests.test_signage import setup, slide


@pytest.fixture
async def configured(client, monkeypatch, tmp_path):
    secret = tmp_path / "token"
    secret.write_text("x" * 64, encoding="utf-8")
    monkeypatch.setattr(settings, "media_worker_url", "http://media-worker:8090")
    monkeypatch.setattr(settings, "media_worker_token_file", str(secret))
    monkeypatch.setattr(settings, "signage_video_storage", str(tmp_path / "private"))
    app.dependency_overrides[get_actor_id] = lambda: "admin-a"
    yield


def png(size=(1920, 1080), color="red", format="PNG"):
    output = io.BytesIO()
    Image.new("RGB", size, color).save(output, format=format)
    return output.getvalue()


async def new_job(client, db_session, **kwargs):
    channel, template, _ = await setup(client, db_session)
    await slide(client, channel, template, **kwargs)
    response = await client.post(
        "/api/signage/video-exports",
        json={"channel_id": channel["id"], "locale": "en"},
        headers={"Idempotency-Key": "snapshot-key-123456"},
    )
    assert response.status_code == 201, response.text
    return response.json(), channel, template


async def uploaded(client, job):
    response = await client.put(
        f"/api/signage/video-exports/{job['id']}/slides/0", content=png(), headers={"Content-Type": "image/png"}
    )
    assert response.status_code == 200, response.text
    response = await client.post(f"/api/signage/video-exports/{job['id']}/submit")
    assert response.status_code == 200, response.text


class FakeWorker:
    def __init__(self):
        self.id = "a" * 32
        self.submissions = []
        self.state = "queued"
        self.acks = 0
        self.cancels = 0
        self.lose_response = False
        self.video = b"private-video"

    async def submit(self, job, **kwargs):
        self.submissions.append((job.id, job.payload_digest))
        if self.lose_response:
            self.lose_response = False
            raise httpx.ReadTimeout("lost acknowledgement")
        return {"api_version": "v1", "id": self.id, "state": self.state}

    async def status(self, worker_id):
        assert worker_id == self.id
        return {
            "api_version": "v1",
            "id": self.id,
            "state": self.state,
            "artifacts": {
                "video.mp4": {
                    "content_type": "video/mp4",
                    "width": 1920,
                    "height": 1080,
                    "bytes": len(self.video),
                    "sha256": hashlib.sha256(self.video).hexdigest(),
                    "duration_seconds": 10,
                }
            },
        }

    async def download(self, job, metadata):
        # The ID was persisted in the preceding pass, and not merely a local variable.
        service.durable_write(service.directory(job.id) / "video.mp4", self.video)

    async def cancel(self, worker_id):
        self.cancels += 1
        self.state = "cancelled"

    async def ack(self, worker_id):
        self.acks += 1
        self.state = "expired"


async def pass_worker(engine, db_session, worker):
    await db_session.execute(
        update(SignageVideoExport).values(next_attempt_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db_session.commit()
    await service.tick(async_sessionmaker(engine, expire_on_commit=False), worker)
    db_session.expire_all()


async def test_frozen_snapshot_locale_schedules_and_retry(client, db_session, configured):
    job, channel, template = await new_job(client, db_session, content={"text": "Hello"})
    await slide(client, channel, template, duration=99, starts_at=(datetime.now(UTC) + timedelta(hours=1)).isoformat())
    await slide(client, channel, template, active=False)
    # Later publication and schedule changes cannot affect the recorded manifest.
    await slide(client, channel, template, duration=20)
    replay = await client.post(
        "/api/signage/video-exports",
        json={"channel_id": channel["id"], "locale": "en"},
        headers={"Idempotency-Key": "snapshot-key-123456"},
    )
    assert replay.json()["id"] == job["id"]
    assert replay.json()["playlist"] == job["playlist"]
    assert len(job["playlist"]["slides"]) == 1
    assert job["playlist"]["slides"][0]["text"] == "Hello"
    conflict = await client.post(
        "/api/signage/video-exports",
        json={"channel_id": channel["id"], "locale": "fr"},
        headers={"Idempotency-Key": "snapshot-key-123456"},
    )
    assert conflict.status_code == 409
    assert "worker" not in str(replay.json()).lower()


@pytest.mark.parametrize("data", [b"not a png", png((100, 100)), png(format="JPEG")])
async def test_invalid_image(client, db_session, configured, data):
    job, _, _ = await new_job(client, db_session)
    result = await client.put(
        f"/api/signage/video-exports/{job['id']}/slides/0", content=data, headers={"Content-Type": "image/png"}
    )
    assert result.status_code == 422
    assert result.json()["code"] == "signage_video_invalid_image"


async def test_upload_limits_order_and_immutable_slots(client, db_session, configured, monkeypatch):
    job, _, _ = await new_job(client, db_session)
    path = f"/api/signage/video-exports/{job['id']}"
    assert (await client.post(path + "/submit")).status_code == 409
    assert (
        await client.put(path + "/slides/1", content=png(), headers={"Content-Type": "image/png"})
    ).status_code == 409
    assert (
        await client.put(path + "/slides/0", content=png(), headers={"Content-Type": "image/jpeg"})
    ).status_code == 415
    monkeypatch.setattr(service, "MAX_SLIDE_BYTES", 10)
    assert (
        await client.put(path + "/slides/0", content=b"x" * 11, headers={"Content-Type": "image/png"})
    ).status_code == 413
    monkeypatch.setattr(service, "MAX_SLIDE_BYTES", 8 * 1024**2)
    monkeypatch.setattr(service, "MAX_INPUT_BYTES", 1)
    assert (
        await client.put(path + "/slides/0", content=png(), headers={"Content-Type": "image/png"})
    ).status_code == 413
    monkeypatch.setattr(service, "MAX_INPUT_BYTES", 120 * 1024**2)
    for _ in range(2):
        assert (
            await client.put(path + "/slides/0", content=png(), headers={"Content-Type": "image/png"})
        ).status_code == 200
    assert (
        await client.put(path + "/slides/0", content=png(color="blue"), headers={"Content-Type": "image/png"})
    ).status_code == 409
    for _ in range(2):
        assert (await client.post(path + "/submit")).status_code == 200
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.payload_digest == service.digest(row)
    assert (service.directory(row.id) / "0.png").stat().st_mode & 0o777 == 0o600


async def test_lost_response_restart_completion_ack_and_expiry(client, db_session, engine, configured):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    worker.lose_response = True
    await pass_worker(engine, db_session, worker)
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.worker_id is None
    # Every pass uses a fresh DB session, just as after an API process restart.
    await pass_worker(engine, db_session, worker)
    assert len(worker.submissions) == 2
    assert worker.submissions[0] == worker.submissions[1]
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.worker_id == worker.id
    assert worker.acks == 0
    worker.state = "running"
    await pass_worker(engine, db_session, worker)
    assert (await client.get(f"/api/signage/video-exports/{job['id']}")).json()["state"] == "running"
    worker.state = "succeeded"
    await pass_worker(engine, db_session, worker)
    response = await client.get(f"/api/signage/video-exports/{job['id']}/download")
    assert response.content == worker.video
    assert response.headers["cache-control"] == "private, no-store"
    assert worker.acks == 0  # Cannot ACK before local result commit.
    await pass_worker(engine, db_session, worker)
    assert worker.acks == 1
    # ACK does not expire the app's downloaded result or duplicate publication.
    assert (await client.get(f"/api/signage/video-exports/{job['id']}/download")).status_code == 200
    row = await db_session.get(SignageVideoExport, job["id"])
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    await pass_worker(engine, db_session, worker)
    assert (await client.get(f"/api/signage/video-exports/{job['id']}/download")).status_code == 410
    assert not service.directory(job["id"]).exists()
    await client.post(f"/api/signage/video-exports/{job['id']}/submit")
    assert len(worker.submissions) == 2


async def test_cancellation_deletion_and_local_cleanup_without_worker(client, db_session, engine, configured):
    job, channel, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    await pass_worker(engine, db_session, worker)
    assert (await client.delete(f"/api/signage/channels/{channel['id']}")).status_code == 204
    await pass_worker(engine, db_session, worker)
    assert worker.cancels == 1 and worker.acks == 1
    assert not service.directory(job["id"]).exists()
    assert (await client.get("/api/signage/video-exports")).json()[0]["state"] == "cancelled"
    # Repeated cancellation remains harmless even after channel deletion.
    for _ in range(2):
        assert (await client.post(f"/api/signage/video-exports/{job['id']}/cancel")).status_code == 200
    await pass_worker(engine, db_session, None)


async def test_creator_scope_and_revoked_admin(client, db_session, configured):
    job, _, _ = await new_job(client, db_session)
    app.dependency_overrides[get_actor_id] = lambda: "other-admin"
    assert (await client.get("/api/signage/video-exports")).json() == []
    for method, suffix in [
        ("GET", ""),
        ("GET", "/download"),
        ("POST", "/cancel"),
        ("POST", "/submit"),
        ("PUT", "/slides/0"),
    ]:
        assert (await client.request(method, f"/api/signage/video-exports/{job['id']}{suffix}")).status_code == 404
    from fastapi import HTTPException

    def revoked():
        raise HTTPException(403)

    app.dependency_overrides[require_admin] = revoked
    for method, path in [
        ("GET", ""),
        ("GET", "/capability"),
        ("GET", f"/{job['id']}/download"),
        ("POST", f"/{job['id']}/cancel"),
    ]:
        assert (await client.request(method, "/api/signage/video-exports" + path)).status_code == 403


async def test_disabled_empty_excessive_and_admission(client, db_session, configured, monkeypatch):
    channel, template, _ = await setup(client, db_session)

    async def create(key):
        return await client.post(
            "/api/signage/video-exports", json={"channel_id": channel["id"]}, headers={"Idempotency-Key": key}
        )

    assert (await create("empty-1234567890123")).status_code == 422
    await slide(client, channel, template, duration=601)
    assert (await create("long-12345678901234")).status_code == 422
    slides = (await client.get("/api/signage/slides")).json()
    await client.delete(f"/api/signage/slides/{slides[0]['id']}")
    await slide(client, channel, template)
    monkeypatch.setattr(service, "MAX_SLIDES", 0)
    assert (await create("many-12345678901234")).status_code == 422
    monkeypatch.setattr(service, "MAX_SLIDES", 60)
    for i in range(2):
        assert (await create(f"valid-1234567890123{i}")).status_code == 201
    assert (await create("full-12345678901234")).status_code == 429
    monkeypatch.setattr(settings, "media_worker_url", "")
    assert (await client.get("/api/signage/video-exports/capability")).json()["available"] is False
    assert (await create("off-123456789012345")).status_code == 503
    assert (await client.get("/api/signage/hall/playlist")).status_code == 200


async def test_worker_transport_digest_upload_and_verified_download(client, db_session, configured):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    row = await db_session.get(SignageVideoExport, job["id"])
    raw = png()
    video = b"mp4-output"

    async def transport(request):
        assert request.headers["Authorization"] == "Bearer " + "x" * 64
        if request.method == "POST":
            assert request.headers["Idempotency-Key"] == row.id
            assert request.headers["X-Payload-SHA256"] == row.payload_digest
            body = await request.aread()
            assert body.index(b'name="manifest"') < body.index(b'name="file"')
            assert raw in body
            assert b'"durations_ms":[10000]' in body
            return httpx.Response(202, json={"id": "a" * 32, "api_version": "v1", "state": "queued"})
        return httpx.Response(200, content=video)

    worker = service.Worker()
    await worker.close()
    worker.client = httpx.AsyncClient(
        base_url=settings.media_worker_url,
        headers={"Authorization": "Bearer " + "x" * 64},
        transport=httpx.MockTransport(transport),
    )
    try:
        assert (await worker.submit(row))["id"] == "a" * 32
        row.worker_id = "a" * 32
        metadata = {"bytes": len(video), "sha256": hashlib.sha256(video).hexdigest()}
        await worker.download(row, metadata)
        assert (service.directory(row.id) / "video.mp4").read_bytes() == video
        with pytest.raises(service.WorkerError):
            await worker.download(row, {**metadata, "sha256": "0" * 64})
    finally:
        await worker.close()


async def test_early_cancel_cleans_pixels_even_when_worker_disabled(client, db_session, engine, configured):
    job, _, _ = await new_job(client, db_session)
    await client.put(
        f"/api/signage/video-exports/{job['id']}/slides/0", content=png(), headers={"Content-Type": "image/png"}
    )
    await client.post(f"/api/signage/video-exports/{job['id']}/cancel")
    await pass_worker(engine, db_session, None)
    assert not service.directory(job["id"]).exists()
    assert (await client.get("/api/signage/video-exports")).json()[0]["state"] == "cancelled"


async def test_ready_cancel_removes_app_copy_after_worker_ack(client, db_session, engine, configured):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    await pass_worker(engine, db_session, worker)
    worker.state = "succeeded"
    await pass_worker(engine, db_session, worker)
    await pass_worker(engine, db_session, worker)
    await client.post(f"/api/signage/video-exports/{job['id']}/cancel")
    assert (await client.get(f"/api/signage/video-exports/{job['id']}/download")).status_code == 410
    await pass_worker(engine, db_session, None)
    assert not service.directory(job["id"]).exists()


async def test_expired_uncertain_submission_only_looks_up_never_reencodes(client, db_session, engine, configured):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    row = await db_session.get(SignageVideoExport, job["id"])
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    worker = FakeWorker()
    worker.submit = AsyncMock(side_effect=service.WorkerError(422))
    await pass_worker(engine, db_session, worker)
    assert worker.submit.call_args.kwargs == {"lookup_only": True}
    assert not service.directory(job["id"]).exists()
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.state == "expired" and row.acknowledged
    assert row.snapshot == {"slides": [{"duration": 10}]}
    assert row.payload_digest is not None


@requires_postgres("two sessions racing on row locks or advisory locks; SQLite has one writer lock")
async def test_reconciler_election_and_missing_remote_artifact(client, db_session, engine, configured):
    from sqlalchemy import text

    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as leader:
        await leader.execute(text("SELECT pg_advisory_xact_lock(1349)"))
        await service.tick(factory, worker)
        assert worker.submissions == []
    await pass_worker(engine, db_session, worker)
    worker.status = AsyncMock(side_effect=service.WorkerError(404))
    await pass_worker(engine, db_session, worker)
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.state == "expired" and row.acknowledged
    assert not service.directory(job["id"]).exists()


async def test_real_worker_complete_cycle(client, db_session, engine, configured, monkeypatch, tmp_path):
    """Opt-in against the pinned apps worker; normal CI uses transport/lifecycle fixtures."""
    import asyncio
    import json
    import os
    import shutil
    import subprocess

    url = os.environ.get("MEDIA_WORKER_TEST_URL")
    token_file = os.environ.get("MEDIA_WORKER_TEST_TOKEN_FILE")
    if not url or not token_file:
        pytest.skip("Set MEDIA_WORKER_TEST_URL and MEDIA_WORKER_TEST_TOKEN_FILE for real encoding")
    monkeypatch.setattr(settings, "media_worker_url", url)
    monkeypatch.setattr(settings, "media_worker_token_file", token_file)
    job, channel, template = await new_job(client, db_session, duration=1)
    await uploaded(client, job)
    worker = service.Worker()
    try:
        for _ in range(40):
            await pass_worker(engine, db_session, worker)
            result = (await client.get(f"/api/signage/video-exports/{job['id']}")).json()
            if result["state"] == "ready":
                break
            assert result["state"] not in {"failed", "expired"}, result
            await asyncio.sleep(0.5)
        assert result["state"] == "ready", result
        video = await client.get(f"/api/signage/video-exports/{job['id']}/download")
        target = tmp_path / "single.mp4"
        target.write_bytes(video.content)
        probe = json.loads(
            subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(target)]
            )
        )
        assert len(probe["streams"]) == 1
        stream = probe["streams"][0]
        assert (stream["codec_name"], stream["pix_fmt"], stream["width"], stream["height"]) == (
            "h264",
            "yuv420p",
            1920,
            1080,
        )
        assert abs(float(probe["format"]["duration"]) - 1) <= 1 / 30
        assert stream["r_frame_rate"] == "30/1"
        assert video.content.index(b"moov") < video.content.index(b"mdat")
        await pass_worker(engine, db_session, worker)
        # Preserve an inspection artifact without publishing it or storing credentials.
        artifact = os.environ.get("MEDIA_WORKER_TEST_ARTIFACT")
        if artifact:
            shutil.copyfile(target, artifact)
    finally:
        await worker.close()


async def test_remote_expiry_after_app_completion_preserves_local_download(client, db_session, engine, configured):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    await pass_worker(engine, db_session, worker)
    worker.state = "succeeded"
    await pass_worker(engine, db_session, worker)
    worker.status = AsyncMock(side_effect=service.WorkerError(404))
    await pass_worker(engine, db_session, worker)
    response = await client.get(f"/api/signage/video-exports/{job['id']}/download")
    assert response.status_code == 200 and response.content == worker.video


async def test_missing_acknowledged_app_artifact_is_reported_expired(client, db_session, engine, configured):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    await pass_worker(engine, db_session, worker)
    worker.state = "succeeded"
    await pass_worker(engine, db_session, worker)
    await pass_worker(engine, db_session, worker)
    (service.directory(job["id"]) / "video.mp4").unlink()
    response = await client.get(f"/api/signage/video-exports/{job['id']}")
    assert response.json()["state"] == "expired"
    assert (await client.get(f"/api/signage/video-exports/{job['id']}/download")).status_code == 410


async def test_local_cleanup_failure_retries_after_remote_ack(client, db_session, engine, configured, monkeypatch):
    job, _, _ = await new_job(client, db_session)
    await client.put(
        f"/api/signage/video-exports/{job['id']}/slides/0", content=png(), headers={"Content-Type": "image/png"}
    )
    await client.post(f"/api/signage/video-exports/{job['id']}/cancel")
    original = service.remove_directory

    def denied(path):
        raise PermissionError("test storage outage")

    monkeypatch.setattr(service, "remove_directory", denied)
    await pass_worker(engine, db_session, None)
    row = await db_session.get(SignageVideoExport, job["id"])
    assert not row.acknowledged and row.state == "cancelled"
    monkeypatch.setattr(service, "remove_directory", original)
    await pass_worker(engine, db_session, None)
    assert not service.directory(job["id"]).exists()


async def test_local_retention_does_not_wait_for_unavailable_remote_jobs(client, db_session, engine, configured):
    import asyncio

    job, channel, template = await new_job(client, db_session)
    await uploaded(client, job)
    second = (
        await client.post(
            "/api/signage/video-exports",
            json={"channel_id": channel["id"]},
            headers={"Idempotency-Key": "second-key-1234567"},
        )
    ).json()
    await client.put(
        f"/api/signage/video-exports/{second['id']}/slides/0", content=png(), headers={"Content-Type": "image/png"}
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    started, release = asyncio.Event(), asyncio.Event()
    worker = FakeWorker()
    original_submit = worker.submit

    async def blocked_submit(row, **kwargs):
        started.set()
        await release.wait()
        return await original_submit(row, **kwargs)

    worker.submit = AsyncMock(side_effect=blocked_submit)
    remote = asyncio.create_task(service.tick(factory, worker))
    try:
        await asyncio.wait_for(started.wait(), 5)
        await client.post(f"/api/signage/video-exports/{second['id']}/cancel")
        await service.cleanup_tick(factory)
        assert not service.directory(second["id"]).exists()
        assert (await client.get(f"/api/signage/video-exports/{second['id']}")).json()["state"] == "cancelled"
    finally:
        release.set()
        await remote


async def test_abandoned_preparations_release_admission_before_cleanup(client, db_session, engine, configured):
    first, channel, _ = await new_job(client, db_session)
    second = (
        await client.post(
            "/api/signage/video-exports",
            json={"channel_id": channel["id"]},
            headers={"Idempotency-Key": "second-prepare-key"},
        )
    ).json()
    for job in (first, second):
        await client.put(
            f"/api/signage/video-exports/{job['id']}/slides/0", content=png(), headers={"Content-Type": "image/png"}
        )
    deadline = datetime.now(UTC) - service.PREPARE_TIMEOUT
    await db_session.execute(update(SignageVideoExport).values(created_at=deadline))
    await db_session.commit()
    # Fill the retained-job ceiling too, so both admission counters must ignore stale preparations.
    for index in range(4):
        response = await client.post(
            "/api/signage/video-exports",
            json={"channel_id": channel["id"]},
            headers={"Idempotency-Key": f"more-stale-preparations-{index}"},
        )
        assert response.status_code == 201, response.text
        await db_session.execute(
            update(SignageVideoExport).where(SignageVideoExport.id == response.json()["id"]).values(created_at=deadline)
        )
        await db_session.commit()
    # No cleanup tick is needed for another admin to reclaim capacity.
    app.dependency_overrides[get_actor_id] = lambda: "admin-b"
    replacement = await client.post(
        "/api/signage/video-exports",
        json={"channel_id": channel["id"]},
        headers={"Idempotency-Key": "replacement-prepare-key"},
    )
    assert replacement.status_code == 201, replacement.text
    app.dependency_overrides[get_actor_id] = lambda: "admin-a"
    assert (await client.get(f"/api/signage/video-exports/{first['id']}")).json()["state"] == "cancelled"
    assert (
        await client.put(
            f"/api/signage/video-exports/{first['id']}/slides/0", content=png(), headers={"Content-Type": "image/png"}
        )
    ).status_code == 409
    assert (await client.post(f"/api/signage/video-exports/{first['id']}/submit")).status_code == 409
    # The fixture reuses a session; emulate request teardown after rejected row-locked writes.
    await db_session.rollback()
    await service.cleanup_tick(async_sessionmaker(engine, expire_on_commit=False))
    db_session.expire_all()
    for job in (first, second):
        row = await db_session.get(SignageVideoExport, job["id"])
        assert row.state == "cancelled" and row.acknowledged and row.local_cleaned
        assert not service.directory(job["id"]).exists()
    assert (await client.get(f"/api/signage/video-exports/{first['id']}")).json()["state"] == "cancelled"


async def test_preparation_deadline_does_not_cancel_submitted_jobs(client, db_session, engine, configured):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    await db_session.execute(update(SignageVideoExport).values(created_at=datetime.now(UTC) - service.PREPARE_TIMEOUT))
    await db_session.commit()
    await service.cleanup_tick(async_sessionmaker(engine, expire_on_commit=False))
    worker = FakeWorker()
    await pass_worker(engine, db_session, worker)
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.worker_id == worker.id and not row.cancel_requested


@pytest.mark.parametrize(
    "failure",
    [
        TypeError("invalid id"),
        AttributeError("invalid object"),
        KeyError("missing field"),
        # Unlisted types must back off too, or one bad row blocks every export behind it.
        RuntimeError("unexpected"),
        IndexError("unexpected"),
    ],
)
async def test_worker_contract_exception_backs_off_and_allows_next_job(client, db_session, engine, configured, failure):
    first, channel, _ = await new_job(client, db_session)
    await uploaded(client, first)
    second = (
        await client.post(
            "/api/signage/video-exports",
            json={"channel_id": channel["id"]},
            headers={"Idempotency-Key": "second-encoding-key"},
        )
    ).json()
    await uploaded(client, second)
    worker = FakeWorker()
    worker.submit = AsyncMock(side_effect=[failure, {"api_version": "v1", "id": worker.id, "state": "queued"}])
    factory = async_sessionmaker(engine, expire_on_commit=False)
    before = datetime.now(UTC)
    await service.tick(factory, worker)
    db_session.expire_all()
    failed = await db_session.get(SignageVideoExport, first["id"])
    assert failed.error_code == "worker_unavailable"
    assert failed.next_attempt_at >= before + timedelta(seconds=15)
    # Do not reset retry times: the real query must select the other job.
    await service.tick(factory, worker)
    db_session.expire_all()
    next_job = await db_session.get(SignageVideoExport, second["id"])
    assert next_job.worker_id == worker.id


@pytest.mark.parametrize(
    "response",
    [[], {"api_version": "v1", "id": 123, "state": "queued"}, {"api_version": "v1", "id": "a" * 32, "state": []}],
)
async def test_malformed_submission_json_is_retryable(client, db_session, engine, configured, response):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    worker.submit = AsyncMock(return_value=response)
    await pass_worker(engine, db_session, worker)
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.error_code == "worker_unavailable" and row.next_attempt_at > datetime.now(UTC)
    assert row.worker_id is None


@pytest.mark.parametrize(
    "artifacts",
    [
        None,
        [],
        {"video.mp4": []},
        {"video.mp4": {"content_type": "video/mp4", "width": 1920, "height": 1080, "bytes": 10, "sha256": 123}},
    ],
)
async def test_malformed_artifact_json_is_retryable(client, db_session, engine, configured, artifacts):
    job, _, _ = await new_job(client, db_session)
    await uploaded(client, job)
    worker = FakeWorker()
    await pass_worker(engine, db_session, worker)
    worker.status = AsyncMock(
        return_value={"api_version": "v1", "id": worker.id, "state": "succeeded", "artifacts": artifacts}
    )
    await pass_worker(engine, db_session, worker)
    row = await db_session.get(SignageVideoExport, job["id"])
    assert row.error_code == "worker_unavailable" and row.state != "ready"
    assert row.next_attempt_at > datetime.now(UTC)
    assert worker.acks == 0
