"""Validated image storage; filesystem changes follow the database transaction.

The recovery command reconciles files after a process crash. All logo writers and
recovery share a PostgreSQL advisory lock so recovery cannot delete in-flight files.
"""

import asyncio
import hashlib
import logging
import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Organization, OrganizationChange
from app.services.errors import NotFoundError, ServiceError

PREFIX = "/uploads/organizations/"
NAME = re.compile(r"[a-f0-9]{32}-[a-f0-9]{64}\.png\Z")
LIMIT = 5 * 1024 * 1024
TYPES = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}
logger = logging.getLogger(__name__)


def roots() -> tuple[Path, Path]:
    public, pending = Path(settings.organization_logo_public_root), Path(settings.organization_logo_pending_root)
    if (
        public.resolve() == pending.resolve()
        or public.resolve() in pending.resolve().parents
        or pending.resolve() in public.resolve().parents
    ):
        raise ServiceError("Logo storage roots must be separate.", status_code=503)
    public.mkdir(parents=True, exist_ok=True)
    pending.mkdir(parents=True, exist_ok=True)
    return public, pending


async def lock(db: AsyncSession) -> None:
    await db.execute(text("SELECT pg_advisory_xact_lock(1194)"))


def remove(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.exception("Logo cleanup failed; run logo reconciliation: %s", path)


@event.listens_for(Session, "after_commit")
def committed(session: Session) -> None:
    if session.in_nested_transaction():
        return
    session.info.pop("logo_created", None)
    for path in session.info.pop("logo_delete", set()):
        remove(path)


@event.listens_for(Session, "after_transaction_end")
def ended(session: Session, transaction) -> None:
    if transaction.parent is None:
        for path in session.info.pop("logo_created", set()):
            remove(path)
        session.info.pop("logo_delete", None)


def defer_delete(db: AsyncSession, path: Path) -> None:
    db.sync_session.info.setdefault("logo_delete", set()).add(path)


def store(db: AsyncSession, root: Path, data: bytes) -> str:
    name = f"{uuid4().hex}-{hashlib.sha256(data).hexdigest()}.png"
    path = root / name
    db.sync_session.info.setdefault("logo_created", set()).add(path)
    with path.open("xb") as handle:
        handle.write(data)
    return name


def encode(data: bytes, content_type: str | None) -> bytes:
    if content_type not in TYPES:
        raise ServiceError("Use PNG, JPEG or WebP images.", status_code=415)
    if len(data) > LIMIT:
        raise ServiceError("Logo must be at most 5 MiB.", status_code=413)
    try:
        with Image.open(BytesIO(data), formats=[TYPES[content_type]]) as image:
            if image.width * image.height > 16_000_000:
                raise ServiceError("Logo must be at most 16 megapixels.", status_code=413)
            if getattr(image, "n_frames", 1) != 1:
                raise ServiceError("Use a static image.")
            image.load()
            normalized = ImageOps.exif_transpose(image).convert("RGBA")
            normalized.thumbnail((2048, 2048))
            # A fresh image carries no source EXIF, comments, ICC or text chunks.
            clean = Image.new("RGBA", normalized.size)
            clean.paste(normalized)
            output = BytesIO()
            clean.save(output, format="PNG")
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ServiceError("Logo is not a valid PNG, JPEG or WebP image.") from exc


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read(LIMIT + 1)
    return await asyncio.to_thread(encode, data, file.content_type)


def pending_path(change: OrganizationChange) -> Path:
    name = change.proposed.get("image")
    if change.status != "pending" or not isinstance(name, str) or not NAME.fullmatch(name):
        raise NotFoundError("Pending logo not found.")
    path = roots()[1] / name
    if not path.is_file():
        raise NotFoundError("Pending logo not found.")
    return path


def retire_pending(db: AsyncSession, change: OrganizationChange) -> None:
    name = change.proposed.get("image")
    if isinstance(name, str) and NAME.fullmatch(name):
        defer_delete(db, roots()[1] / name)


async def retire_public(db: AsyncSession, url: str) -> None:
    if not url.startswith(PREFIX) or not NAME.fullmatch(url[len(PREFIX) :]):
        return
    await db.flush()
    if await db.scalar(select(Organization.id).where(Organization.image == url).limit(1)) is None:
        defer_delete(db, roots()[0] / url[len(PREFIX) :])


async def reconcile(db: AsyncSession) -> int:
    """Remove crash leftovers under the same lock as every logo mutation."""
    await lock(db)
    public_urls = set((await db.scalars(select(Organization.image))).all())
    changes = (await db.scalars(select(OrganizationChange).where(OrganizationChange.status == "pending"))).all()
    private_names = {change.proposed.get("image") for change in changes}
    count = 0
    for root, referenced in zip(
        roots(), ({url[len(PREFIX) :] for url in public_urls if url.startswith(PREFIX)}, private_names), strict=True
    ):
        for path in root.iterdir():
            if NAME.fullmatch(path.name) and path.name not in referenced:
                remove(path)
                count += 1
    await db.commit()
    return count


async def main() -> None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        print(f"Removed {await reconcile(db)} unreferenced logos.")


if __name__ == "__main__":
    asyncio.run(main())
