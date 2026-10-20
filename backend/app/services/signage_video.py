"""Private app-owned snapshots and the apps#273 v1 adapter.

Pixels are admin-authored output, not server-verified copies of the renderer.
The database owns identity/state; private files are disposable and never public.
"""

import asyncio
import hashlib
import io
import json
import logging
import os
import re
import shutil
import struct
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import NoReturn, Protocol
from uuid import uuid4

import httpx
from PIL import Image
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import SignageVideoExport
from app.services import signage_service
from app.services.errors import ApiHTTPException

PROFILE = "signage-slideshow-v1"
MAX_SLIDES = 60
MAX_SLIDE_BYTES = 8 * 1024**2
MAX_INPUT_BYTES = 120 * 1024**2
MAX_OUTPUT_BYTES = 160 * 1024**2
MAX_SECONDS = 600
RETENTION = timedelta(hours=24)
PREPARE_TIMEOUT = timedelta(minutes=45)
ACTIVE = {"preparing", "submitted", "queued", "running"}
TERMINAL = {"ready", "failed", "cancelled", "expired"}
KEY = re.compile(r"[A-Za-z0-9_-]{16,128}\Z")
WORKER_ID = re.compile(r"[a-f0-9]{32}\Z")
logger = logging.getLogger(__name__)


def fail(status: int, code: str) -> NoReturn:
    raise ApiHTTPException(status, f"signage_video_{code}", "Video export could not be completed.")


def token() -> str:
    try:
        value = Path(settings.media_worker_token_file).read_text().strip()
    except OSError:
        return ""
    return value if len(value) >= 32 and value.isascii() and not any(c.isspace() for c in value) else ""


def configured() -> bool:
    return bool(settings.media_worker_url and token())


def directory(job_id: str) -> Path:
    # IDs are server generated, including on every filesystem cleanup path.
    if not WORKER_ID.fullmatch(job_id):
        raise ValueError("Invalid app job identity")
    root = Path(settings.signage_video_storage)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    return root / job_id


def durable_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(".tmp")
    with temporary.open("wb") as output:
        os.chmod(temporary, 0o600)
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
    sync_directory(path.parent)
    sync_directory(path.parent.parent)


def sync_directory(path: Path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def remove_directory(path: Path):
    with suppress(FileNotFoundError):
        shutil.rmtree(path)


def validate_png(data: bytes):
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "PNG" or image.size != (1920, 1080) or getattr(image, "n_frames", 1) != 1:
                fail(422, "invalid_image")
            image.verify()
        # verify() alone does not decode compressed data.
        with Image.open(io.BytesIO(data)) as image:
            image.load()
    except (OSError, ValueError, SyntaxError, EOFError, struct.error, Image.DecompressionBombError) as exc:
        raise ApiHTTPException(422, "signage_video_invalid_image", "Invalid PNG.") from exc


def manifest(job: SignageVideoExport) -> dict:
    return {"profile": job.profile, "durations_ms": [slide["duration"] * 1000 for slide in job.snapshot["slides"]]}


def digest(job: SignageVideoExport) -> str:
    value = {
        "manifest": manifest(job),
        "sha256": [job.uploads[str(i)]["sha256"] for i in range(len(job.snapshot["slides"]))],
    }
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode()
    ).hexdigest()


def preparation_expired(job: SignageVideoExport, now: datetime) -> bool:
    return job.state == "preparing" and job.created_at <= now - PREPARE_TIMEOUT


def stale_preparations(now: datetime):
    return (SignageVideoExport.state == "preparing") & (SignageVideoExport.created_at <= now - PREPARE_TIMEOUT)


def summary(job: SignageVideoExport) -> dict:
    state = job.state
    now = datetime.now(UTC)
    if job.expires_at <= now:
        state = "expired"
    elif job.cancel_requested or job.channel_id is None or preparation_expired(job, now):
        state = "cancelled"
    elif state == "ready" and not (directory(job.id) / "video.mp4").is_file():
        state = "expired"
    return {
        "id": job.id,
        "channel_id": job.channel_id,
        "channel_name": job.channel_name,
        "locale": job.locale,
        "state": state,
        "cancel_requested": job.cancel_requested,
        "retrying": job.error_code == "worker_unavailable",
        "created_at": job.created_at,
        "expires_at": job.expires_at,
        "slide_count": len(job.snapshot["slides"]),
        "duration_seconds": sum(slide["duration"] for slide in job.snapshot["slides"]),
    }


async def owned(db: AsyncSession, job_id: str, actor: str, *, lock: bool = False) -> SignageVideoExport:
    query = select(SignageVideoExport).where(SignageVideoExport.id == job_id, SignageVideoExport.creator == actor)
    if lock:
        query = query.with_for_update()
    job = await db.scalar(query.execution_options(populate_existing=True))
    if job is None:
        fail(404, "not_found")
    return job


async def list_owned(db: AsyncSession, actor: str) -> list[dict]:
    """The caller's exports: live ones first, then newest first (at most 100)."""
    jobs = await db.scalars(
        select(SignageVideoExport)
        .where(SignageVideoExport.creator == actor)
        .order_by(
            (
                SignageVideoExport.state.in_(ACTIVE | {"ready"}) & (SignageVideoExport.expires_at > datetime.now(UTC))
            ).desc(),
            SignageVideoExport.created_at.desc(),
        )
        .limit(100)
    )
    return [summary(job) for job in jobs]


async def cancel(db: AsyncSession, job_id: str, actor: str) -> dict:
    job = await owned(db, job_id, actor, lock=True)
    job.cancel_requested = True
    job.next_attempt_at = datetime.now(UTC)
    await db.commit()
    return summary(job)


async def create(db: AsyncSession, channel_id: str, locale: str, key: str, actor: str) -> SignageVideoExport:
    if not KEY.fullmatch(key):
        fail(422, "invalid_key")
    # Serializes admission and snapshot creation with signage edits/deletions.
    await signage_service.lock(db)
    existing = await db.scalar(
        select(SignageVideoExport).where(SignageVideoExport.creator == actor, SignageVideoExport.idempotency_key == key)
    )
    if existing:
        if existing.channel_id != channel_id or existing.locale != locale:
            fail(409, "conflict")
        return existing
    if not configured():
        fail(503, "unavailable")
    channel = await signage_service.get(db, "channels", channel_id)
    snapshot = await signage_service.playlist(db, channel.slug, locale, export_limits=(MAX_SLIDES, MAX_SECONDS))
    if (
        not snapshot.slides
        or len(snapshot.slides) > MAX_SLIDES
        or sum(s.duration for s in snapshot.slides) > MAX_SECONDS
    ):
        fail(422, "playlist_limit")
    now = datetime.now(UTC)
    # Two uploads/encodes globally, plus at most six retained results (~960MiB).
    active_count = await db.scalar(
        select(func.count())
        .select_from(SignageVideoExport)
        .where(SignageVideoExport.state.in_(ACTIVE), SignageVideoExport.expires_at > now, ~stale_preparations(now))
    )
    retained_count = await db.scalar(
        select(func.count())
        .select_from(SignageVideoExport)
        .where(
            SignageVideoExport.state.in_(ACTIVE | {"ready"}),
            SignageVideoExport.expires_at > now,
            ~stale_preparations(now),
        )
    )
    if (active_count or 0) >= 2 or (retained_count or 0) >= 6:
        fail(429, "capacity")
    try:
        path = directory(uuid4().hex).parent
        if shutil.disk_usage(path).free < 480 * 1024**2:
            fail(507, "capacity")
    except OSError:
        fail(507, "capacity")
    job = SignageVideoExport(
        id=uuid4().hex,
        creator=actor,
        idempotency_key=key,
        channel_id=channel.id,
        channel_name=channel.name,
        locale=locale,
        snapshot=snapshot.model_dump(mode="json"),
        expires_at=now + RETENTION,
    )
    db.add(job)
    await db.commit()
    return job


async def upload(db: AsyncSession, job: SignageVideoExport, index: int, data: bytes):
    if summary(job)["state"] != "preparing" or not 0 <= index < len(job.snapshot["slides"]):
        fail(409, "conflict")
    if not data or len(data) > MAX_SLIDE_BYTES:
        fail(413, "input_limit")
    sha = hashlib.sha256(data).hexdigest()
    existing = job.uploads.get(str(index))
    if existing:
        if existing["sha256"] != sha:
            fail(409, "conflict")
        return
    if sum(value["bytes"] for value in job.uploads.values()) + len(data) > MAX_INPUT_BYTES:
        fail(413, "input_limit")
    await asyncio.to_thread(validate_png, data)
    await asyncio.to_thread(durable_write, directory(job.id) / f"{index}.png", data)
    job.uploads = {**job.uploads, str(index): {"sha256": sha, "bytes": len(data)}}
    await db.commit()


async def submit(db: AsyncSession, job: SignageVideoExport):
    if job.payload_digest:
        return  # Durable replay, even after artifact expiry; never a second worker job.
    if summary(job)["state"] != "preparing" or set(job.uploads) != {str(i) for i in range(len(job.snapshot["slides"]))}:
        fail(409, "incomplete")
    job.payload_digest = digest(job)
    job.state = "submitted"
    job.next_attempt_at = datetime.now(UTC)
    await db.commit()


class WorkerError(Exception):
    def __init__(self, status: int):
        self.status = status


class WorkerClient(Protocol):
    async def submit(self, job: SignageVideoExport, *, lookup_only: bool = False) -> dict: ...
    async def status(self, worker_id: str) -> dict: ...
    async def cancel(self, worker_id: str): ...
    async def ack(self, worker_id: str): ...
    async def download(self, job: SignageVideoExport, metadata: dict): ...


class Worker:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=settings.media_worker_url,
            headers={"Authorization": f"Bearer {token()}"},
            trust_env=False,
            follow_redirects=False,
            timeout=httpx.Timeout(120, connect=5),
        )

    async def close(self):
        await self.client.aclose()

    async def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        response = await self.client.request(method, path, **kwargs)
        if not response.is_success:
            raise WorkerError(response.status_code)
        if len(response.content) > 32 * 1024:
            raise WorkerError(502)
        return response

    async def submit(self, job: SignageVideoExport, *, lookup_only: bool = False) -> dict:
        headers = {"Idempotency-Key": job.id, "X-Payload-SHA256": job.payload_digest or ""}
        if lookup_only:
            response = await self.request("POST", "/v1/jobs", headers=headers)
        else:
            # Async streaming keeps 120MiB inputs off the event loop and out of RAM.
            boundary = "signage-" + job.id
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

            async def body():
                yield f'--{boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n'.encode()
                yield json.dumps(manifest(job), separators=(",", ":")).encode() + b"\r\n"
                for i in range(len(job.snapshot["slides"])):
                    yield f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="slide.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
                    with (directory(job.id) / f"{i}.png").open("rb") as source:
                        while chunk := await asyncio.to_thread(source.read, 64 * 1024):
                            yield chunk
                    yield b"\r\n"
                yield f"--{boundary}--\r\n".encode()

            response = await self.request("POST", "/v1/jobs", headers=headers, content=body())
        return response.json()

    async def status(self, worker_id: str) -> dict:
        return (await self.request("GET", f"/v1/jobs/{worker_id}")).json()

    async def cancel(self, worker_id: str):
        await self.request("POST", f"/v1/jobs/{worker_id}/cancel")

    async def ack(self, worker_id: str):
        await self.request("DELETE", f"/v1/jobs/{worker_id}/artifacts")

    async def download(self, job: SignageVideoExport, metadata: dict):
        path = directory(job.id) / "video.tmp"
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        sha = hashlib.sha256()
        size = 0
        async with self.client.stream("GET", f"/v1/jobs/{job.worker_id}/artifacts/video.mp4") as response:
            if response.status_code != 200:
                raise WorkerError(response.status_code)
            with path.open("wb") as output:
                os.chmod(path, 0o600)
                async for chunk in response.aiter_bytes(64 * 1024):
                    size += len(chunk)
                    if size > metadata["bytes"] or size > MAX_OUTPUT_BYTES:
                        raise WorkerError(502)
                    sha.update(chunk)
                    await asyncio.to_thread(output.write, chunk)
                await asyncio.to_thread(output.flush)
                await asyncio.to_thread(os.fsync, output.fileno())
        if size != metadata["bytes"] or sha.hexdigest() != metadata["sha256"]:
            path.unlink(missing_ok=True)
            raise WorkerError(502)
        os.replace(path, directory(job.id) / "video.mp4")
        await asyncio.to_thread(sync_directory, path.parent)
        await asyncio.to_thread(sync_directory, path.parent.parent)


def validate_status(data: dict, expected_id: str | None = None) -> str:
    worker_id = data.get("id", "")
    if (
        data.get("api_version") != "v1"
        or not WORKER_ID.fullmatch(worker_id)
        or expected_id
        and worker_id != expected_id
        or data.get("state") not in {"queued", "running", "succeeded", "failed", "cancelled", "expired"}
    ):
        raise WorkerError(502)
    return worker_id


def validate_artifact(data: dict, seconds: int) -> dict:
    metadata = data.get("artifacts", {}).get("video.mp4", {})
    size, duration = metadata.get("bytes"), metadata.get("duration_seconds")
    if (
        metadata.get("content_type") != "video/mp4"
        or metadata.get("width") != 1920
        or metadata.get("height") != 1080
        or type(size) is not int
        or not 0 < size <= MAX_OUTPUT_BYTES
        or not re.fullmatch(r"[a-f0-9]{64}", metadata.get("sha256", ""))
        or not isinstance(duration, (int, float))
        or not abs(duration - seconds) <= 1 / 30
    ):
        raise WorkerError(502)
    return metadata


async def reconcile(db: AsyncSession, job: SignageVideoExport, worker: WorkerClient | None):
    now = datetime.now(UTC)
    expired = job.expires_at <= now
    if preparation_expired(job, now):
        job.cancel_requested = True
        job.error_code = "preparation_timeout"
    stop = expired or job.cancel_requested or job.channel_id is None
    if job.state == "ready" and not (directory(job.id) / "video.mp4").is_file():
        job.state = "expired"
    if stop:
        job.state = "expired" if expired else "cancelled"
        await asyncio.to_thread(remove_directory, directory(job.id))
        job.local_cleaned = True
        if not job.payload_digest:
            job.acknowledged = True
    if worker is None:
        if job.state in {"submitted", "queued", "running"}:
            job.error_code = "worker_unavailable"
        return
    job.error_code = None
    # The worker ID must commit before cancel/status/download use; this pass ONLY submits.
    if job.payload_digest and not job.worker_id and not job.acknowledged:
        # After one day never create new remote work. Resolve uncertain acceptance by
        # bodyless idempotency lookup; stop even lookup before seven-day tombstones die.
        if now >= job.created_at + timedelta(days=6):
            job.acknowledged = True
            job.state = "expired"
        else:
            try:
                data = await worker.submit(job, lookup_only=stop)
                job.worker_id = validate_status(data)
            except WorkerError as exc:
                if stop and exc.status in {400, 422}:
                    job.acknowledged = True
                elif exc.status in {400, 409, 413, 422}:
                    # 409 can be submission_in_progress: reconcile with same identity.
                    if exc.status == 409:
                        raise
                    job.state = "failed"
                    job.error_code = "input_rejected"
                    job.acknowledged = True
                else:
                    raise
        return
    if job.worker_id and not job.acknowledged:
        if job.state in TERMINAL:
            if job.state != "ready":
                await worker.cancel(job.worker_id)
            data = await worker.status(job.worker_id)
            validate_status(data, job.worker_id)
            if data["state"] not in {"queued", "running"}:
                await worker.ack(job.worker_id)
                job.acknowledged = True
        else:
            data = await worker.status(job.worker_id)
            validate_status(data, job.worker_id)
            if data["state"] == "succeeded":
                metadata = validate_artifact(data, sum(s["duration"] for s in job.snapshot["slides"]))
                await worker.download(job, metadata)
                # Only the subsequent pass may ACK after this result commits.
                job.artifact = metadata
                job.state = "ready"
            else:
                job.state = data["state"]
                if job.state == "failed":
                    job.error_code = "encoding_failed"
    if job.state in TERMINAL or job.worker_id:
        path = directory(job.id)
        if path.exists():
            for image in path.glob("*.png"):
                image.unlink(missing_ok=True)
            if job.state != "ready":
                await asyncio.to_thread(remove_directory, path)


async def tick(factory, worker: WorkerClient | None):
    """A transaction advisory lock elects one reconciler across API processes.

    Rows are locked while reconciling: uploads, cancel and channel deletion cannot
    race a completion. Each remote pass has a 125s total bound, with backoff.
    """
    async with factory() as db:
        if not await db.scalar(text("SELECT pg_try_advisory_xact_lock(1349)")):
            return
        job = await db.scalar(
            select(SignageVideoExport)
            .where(
                SignageVideoExport.next_attempt_at <= datetime.now(UTC),
                (SignageVideoExport.state.in_(ACTIVE))
                | (~SignageVideoExport.acknowledged)
                | (
                    (SignageVideoExport.cancel_requested | SignageVideoExport.channel_id.is_(None))
                    & ~SignageVideoExport.state.in_({"cancelled", "expired"})
                )
                | ((SignageVideoExport.state != "expired") & (SignageVideoExport.expires_at <= datetime.now(UTC))),
            )
            .order_by(SignageVideoExport.next_attempt_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if job is None:
            return
        job_id = job.id
        try:
            await _reconcile_locked(db, job, worker)
        except Exception as exc:
            # Any other failure must still move next_attempt_at, or this row stays
            # first in the queue and blocks every export behind it. Log the type
            # only: never media, manifests, credentials or worker responses.
            await db.rollback()
            logger.warning("Signage export reconciliation raised %s; backing off", type(exc).__name__)
            await db.execute(
                update(SignageVideoExport)
                .where(SignageVideoExport.id == job_id)
                .values(error_code="worker_unavailable", next_attempt_at=datetime.now(UTC) + timedelta(seconds=15))
            )
            await db.commit()


async def _reconcile_locked(db: AsyncSession, job: SignageVideoExport, worker: WorkerClient | None):
    """One locked reconciliation pass; commits its own backoff. Raises only for unexpected failures."""
    try:
        async with asyncio.timeout(125):
            await reconcile(db, job, worker)
    except WorkerError as exc:
        if exc.status in {404, 410} and job.worker_id:
            # Remote expiry/loss after our durable copy does not invalidate it.
            if job.state != "ready" or not (directory(job.id) / "video.mp4").is_file():
                job.state = "expired"
            job.acknowledged = True
        else:
            job.error_code = "worker_unavailable"
    except httpx.HTTPError, TimeoutError, OSError, ValueError, TypeError, AttributeError, KeyError:
        # Malformed worker JSON must commit backoff too, rather than starving the queue.
        job.error_code = "worker_unavailable"
    if job.state in TERMINAL and job.state != "ready":
        try:
            await asyncio.to_thread(remove_directory, directory(job.id))
            job.local_cleaned = True
        except OSError:
            # Keep terminal cleanup discoverable, even if remote ACK already won.
            job.acknowledged = False
            job.local_cleaned = False
            job.error_code = "worker_unavailable"
    if job.expires_at <= datetime.now(UTC):
        # Keep only a compact identity/duration tombstone, never rendered content.
        job.snapshot = {"slides": [{"duration": s["duration"]} for s in job.snapshot["slides"]]}
        job.uploads = {}
        job.artifact = None
    # Never log media, manifests, bearer credentials or worker responses.
    job.next_attempt_at = datetime.now(UTC) + timedelta(seconds=15 if job.error_code else 3)
    await db.commit()


async def dispatch_loop(factory):
    while True:
        worker = None
        try:
            worker = Worker() if configured() else None
            await tick(factory, worker)
        except Exception:
            logger.warning("Signage export reconciliation failed; will retry")
        finally:
            if worker:
                await worker.close()
        await asyncio.sleep(3)


async def cleanup_tick(factory):
    """Local retention must not sit behind unavailable remote submissions/ACKs."""
    async with factory() as db:
        if not await db.scalar(text("SELECT pg_try_advisory_xact_lock(13490)")):
            return
        now = datetime.now(UTC)
        jobs = await db.scalars(
            select(SignageVideoExport)
            .where(
                (
                    ~SignageVideoExport.local_cleaned
                    & (
                        (SignageVideoExport.expires_at <= now)
                        | SignageVideoExport.cancel_requested
                        | SignageVideoExport.channel_id.is_(None)
                        | stale_preparations(now)
                    )
                )
                | ((SignageVideoExport.expires_at <= now) & (SignageVideoExport.state != "expired")),
            )
            .order_by(SignageVideoExport.expires_at)
            .with_for_update(skip_locked=True)
            .limit(100)
        )
        for job in jobs:
            if preparation_expired(job, now):
                job.cancel_requested = True
                job.error_code = "preparation_timeout"
            job.state = "expired" if job.expires_at <= now else "cancelled"
            try:
                await asyncio.to_thread(remove_directory, directory(job.id))
            except OSError:
                job.error_code = "worker_unavailable"
                continue
            job.local_cleaned = True
            if not job.payload_digest:
                job.acknowledged = True
            if job.expires_at <= now:
                job.snapshot = {"slides": [{"duration": s["duration"]} for s in job.snapshot["slides"]]}
                job.uploads = {}
                job.artifact = None
            job.next_attempt_at = now
        await db.commit()


async def cleanup_loop(factory):
    while True:
        try:
            await cleanup_tick(factory)
        except Exception:
            logger.warning("Signage export cleanup failed; will retry")
        await asyncio.sleep(30)


async def run(factory):
    async with asyncio.TaskGroup() as tasks:
        tasks.create_task(dispatch_loop(factory))
        tasks.create_task(cleanup_loop(factory))
