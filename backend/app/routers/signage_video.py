"""Admin-only creator-scoped video jobs; credentials and files stay private."""

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.models import SignageVideoExport
from app.schema_types import ResourceId
from app.schemas import FaqLocale
from app.services import signage_video as service


def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"


router = APIRouter(
    prefix="/api/signage/video-exports",
    tags=["signage"],
    dependencies=[Depends(require_admin), Depends(private_response)],
)


class CreateExport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channel_id: ResourceId
    locale: FaqLocale = "nl"


@router.get("/capability")
async def capability():
    return {"available": service.configured(), "max_slides": service.MAX_SLIDES, "max_seconds": service.MAX_SECONDS}


@router.get("")
async def list_exports(db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)):
    jobs = await db.scalars(
        select(SignageVideoExport)
        .where(SignageVideoExport.creator == actor)
        .order_by(
            (
                SignageVideoExport.state.in_(service.ACTIVE | {"ready"})
                & (SignageVideoExport.expires_at > datetime.now(UTC))
            ).desc(),
            SignageVideoExport.created_at.desc(),
        )
        .limit(100)
    )
    return [service.summary(job) for job in jobs]


@router.post("", status_code=201)
async def create_export(
    body: CreateExport,
    idempotency_key: str = Header(),
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
):
    job = await service.create(db, body.channel_id, body.locale, idempotency_key, actor)
    return {**service.summary(job), "playlist": job.snapshot}


@router.get("/{job_id}")
async def get_export(job_id: str, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)):
    return service.summary(await service.owned(db, job_id, actor))


@router.put("/{job_id}/slides/{index}")
async def upload_slide(
    job_id: str, index: int, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    job = await service.owned(db, job_id, actor, lock=True)
    if request.headers.get("content-type") != "image/png" or request.headers.get("content-encoding"):
        service.fail(415, "invalid_image")
    data = bytearray()
    try:
        async with asyncio.timeout(30):
            async for chunk in request.stream():
                if len(data) + len(chunk) > service.MAX_SLIDE_BYTES:
                    service.fail(413, "input_limit")
                data.extend(chunk)
    except TimeoutError:
        service.fail(408, "input_limit")
    try:
        await service.upload(db, job, index, bytes(data))
    except OSError:
        service.fail(507, "capacity")
    return service.summary(job)


@router.post("/{job_id}/submit")
async def submit_export(job_id: str, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)):
    job = await service.owned(db, job_id, actor, lock=True)
    await service.submit(db, job)
    return service.summary(job)


@router.post("/{job_id}/cancel")
async def cancel_export(job_id: str, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)):
    job = await service.owned(db, job_id, actor, lock=True)
    job.cancel_requested = True
    job.next_attempt_at = datetime.now(UTC)
    await db.commit()
    return service.summary(job)


@router.get("/{job_id}/download")
async def download(job_id: str, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)):
    job = await service.owned(db, job_id, actor)
    if service.summary(job)["state"] != "ready" or not job.artifact:
        service.fail(410, "not_ready")
    try:
        source = (service.directory(job.id) / "video.mp4").open("rb")
    except OSError:
        service.fail(410, "not_ready")
    size = job.artifact["bytes"]
    if source.seek(0, 2) != size or size > service.MAX_OUTPUT_BYTES:
        source.close()
        service.fail(410, "not_ready")
    source.seek(0)

    async def chunks():
        try:
            async with asyncio.timeout(120):
                while chunk := await asyncio.to_thread(source.read, 64 * 1024):
                    yield chunk
        finally:
            source.close()

    return StreamingResponse(
        chunks(),
        media_type="video/mp4",
        headers={
            "Content-Length": str(size),
            "Content-Disposition": f'attachment; filename="signage-{job.id}.mp4"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
