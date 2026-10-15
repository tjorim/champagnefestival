"""Public signage clock/playlist, administrative CRUD and validated uploads."""

from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import FaqLocale
from app.services import edition_artwork
from app.services import signage_service as service
from app.services.errors import ServiceError
from app.services.organization_logos import store
from app.signage_schemas import (
    ChannelOut,
    ChannelWrite,
    Playlist,
    Reorder,
    SlideOut,
    SlideWrite,
    TemplateOut,
    TemplateWrite,
)

router = APIRouter(prefix="/api/signage", tags=["signage"])
assets_router = APIRouter(tags=["signage"])


@router.get("/time")
async def server_time(response: Response) -> dict[str, datetime]:
    response.headers["Cache-Control"] = "no-store"
    return {"server_time": datetime.now(UTC)}


@router.get("/{channel}/playlist", response_model=Playlist)
async def public_playlist(
    channel: str, request: Request, response: Response, locale: FaqLocale = "nl", db: AsyncSession = Depends(get_db)
):
    result = await service.playlist(db, channel, locale)
    etag = f'"{result.revision}"'
    # Cap the short cache at the next schedule edge.
    headers = {"Cache-Control": f"public, max-age={result._max_age}, must-revalidate", "ETag": etag}
    if (
        etag in [value.strip().removeprefix("W/") for value in request.headers.get("if-none-match", "").split(",")]
        or request.headers.get("if-none-match") == "*"
    ):
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return result


def asset_root() -> Path:
    root = edition_artwork.public_root() / "signage"
    root.mkdir(parents=True, exist_ok=True)
    return root


@router.post("/assets", dependencies=[Depends(require_admin)], status_code=201)
async def upload_asset(
    file: UploadFile, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    from app.audit import write_audit_entry

    try:
        data = await edition_artwork.read_upload(file, "hero")
    except ServiceError as exc:
        from app.services.errors import ApiHTTPException

        raise ApiHTTPException(exc.status_code, "signage_invalid_image", exc.message) from exc
    await service.lock(db)
    url = "/uploads/signage/" + store(db, asset_root(), data, extension="jpg")
    await write_audit_entry(
        db,
        actor=actor,
        action="upload",
        resource_type="signage_asset",
        resource_id=url.split("/")[-1].split("-")[0],
        details={"url": url},
        request_id=getattr(request.state, "request_id", None),
    )
    await db.commit()
    return {"url": url}


@assets_router.get("/uploads/signage/{name}")
async def public_asset(name: str):
    from app.services.errors import ApiHTTPException

    if not edition_artwork.NAME.fullmatch(name):
        raise ApiHTTPException(404, "signage_asset_not_found", "Image not found.")
    path = next(
        (
            entry
            for entry in asset_root().iterdir()
            if entry.name == name and entry.is_file() and not entry.is_symlink()
        ),
        None,
    )
    if path is None:
        raise ApiHTTPException(404, "signage_asset_not_found", "Image not found.")
    return Response(
        path.read_bytes(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/channels/{channel_id}/reorder", response_model=list[SlideOut], dependencies=[Depends(require_admin)])
async def reorder(
    channel_id: str,
    body: Reorder,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
):
    return await service.reorder(db, channel_id, body.ordered_ids, actor, getattr(request.state, "request_id", None))


@router.get("/channels", response_model=list[ChannelOut], dependencies=[Depends(require_admin)])
async def list_channels(db: AsyncSession = Depends(get_db)):
    return await service.list_all(db, "channels")


@router.post("/channels", response_model=ChannelOut, status_code=201, dependencies=[Depends(require_admin)])
async def create_channels(
    body: ChannelWrite, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    return await service.save(db, "channels", body, actor, getattr(request.state, "request_id", None))


@router.put("/channels/{item_id}", response_model=ChannelOut, dependencies=[Depends(require_admin)])
async def update_channels(
    item_id: str,
    body: ChannelWrite,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
):
    return await service.save(db, "channels", body, actor, getattr(request.state, "request_id", None), item_id)


@router.delete("/channels/{item_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_channels(
    item_id: str, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    await service.delete(db, "channels", item_id, actor, getattr(request.state, "request_id", None))


@router.get("/templates", response_model=list[TemplateOut], dependencies=[Depends(require_admin)])
async def list_templates(db: AsyncSession = Depends(get_db)):
    return await service.list_all(db, "templates")


@router.post("/templates", response_model=TemplateOut, status_code=201, dependencies=[Depends(require_admin)])
async def create_templates(
    body: TemplateWrite, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    return await service.save(db, "templates", body, actor, getattr(request.state, "request_id", None))


@router.put("/templates/{item_id}", response_model=TemplateOut, dependencies=[Depends(require_admin)])
async def update_templates(
    item_id: str,
    body: TemplateWrite,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
):
    return await service.save(db, "templates", body, actor, getattr(request.state, "request_id", None), item_id)


@router.delete("/templates/{item_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_templates(
    item_id: str, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    await service.delete(db, "templates", item_id, actor, getattr(request.state, "request_id", None))


@router.get("/slides", response_model=list[SlideOut], dependencies=[Depends(require_admin)])
async def list_slides(db: AsyncSession = Depends(get_db)):
    return await service.list_all(db, "slides")


@router.post("/slides", response_model=SlideOut, status_code=201, dependencies=[Depends(require_admin)])
async def create_slides(
    body: SlideWrite, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    return await service.save(db, "slides", body, actor, getattr(request.state, "request_id", None))


@router.put("/slides/{item_id}", response_model=SlideOut, dependencies=[Depends(require_admin)])
async def update_slides(
    item_id: str,
    body: SlideWrite,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
):
    return await service.save(db, "slides", body, actor, getattr(request.state, "request_id", None), item_id)


@router.delete("/slides/{item_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_slides(
    item_id: str, request: Request, db: AsyncSession = Depends(get_db), actor: str = Depends(get_actor_id)
):
    await service.delete(db, "slides", item_id, actor, getattr(request.state, "request_id", None))


@router.get("/channels/{item_id}", response_model=ChannelOut, dependencies=[Depends(require_admin)])
async def get_channels(item_id: str, db: AsyncSession = Depends(get_db)):
    return await service.get(db, "channels", item_id)


@router.get("/templates/{item_id}", response_model=TemplateOut, dependencies=[Depends(require_admin)])
async def get_templates(item_id: str, db: AsyncSession = Depends(get_db)):
    return await service.get(db, "templates", item_id)


@router.get("/slides/{item_id}", response_model=SlideOut, dependencies=[Depends(require_admin)])
async def get_slides(item_id: str, db: AsyncSession = Depends(get_db)):
    return await service.get(db, "slides", item_id)
