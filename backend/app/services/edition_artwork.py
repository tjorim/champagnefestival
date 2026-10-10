"""Admin-uploaded edition artwork: flyer, hero photo and sharing image (#1224).

Generalises the validated storage of ``app.services.organization_logos`` (format
allow-list, size and pixel limits, metadata-free re-encoding, content-hashed
names, filesystem changes after the database commit) to a second public
directory. Artwork needs no manager review, so there is no pending root.

Files are written before the commit that references them and obsolete files are
deleted after it, through the same session hooks the logos use. Run
``python -m app.services.edition_artwork`` after a crash to remove unreferenced
files; it shares the artwork advisory lock with every writer.
"""

import asyncio
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Literal

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Edition
from app.services.errors import ServiceError
from app.services.organization_logos import TYPES, defer_delete, store

PREFIX = "/uploads/editions/"
NAME = re.compile(r"[a-f0-9]{32}-[a-f0-9]{64}\.jpg\Z")
LIMIT = 10 * 1024 * 1024
MAX_PIXELS = 40_000_000
JPEG_QUALITY = 85

Slot = Literal["flyer", "hero", "share"]
SLOTS: tuple[Slot, ...] = ("flyer", "hero", "share")
COLUMNS: dict[Slot, str] = {"flyer": "flyer_image", "hero": "hero_image", "share": "share_image"}


@dataclass(frozen=True)
class SlotRules:
    """What a slot accepts. Ratios are width / height."""

    min_ratio: float
    max_ratio: float
    min_size: tuple[int, int]
    max_size: tuple[int, int]
    exact_size: tuple[int, int] | None = None
    """When set, an accepted image is cropped to the ratio and resized to exactly this size."""
    description: str = ""


RULES: dict[Slot, SlotRules] = {
    # Portrait poster: kept uncropped, only downscaled.
    "flyer": SlotRules(0.4, 1.0, (400, 560), (2000, 2800), description="a portrait image of at least 400 x 560 pixels"),
    # Wide photo behind the hero section; the page crops it with `cover`.
    "hero": SlotRules(
        1.5, 2.4, (1200, 500), (2400, 1600), description="a wide image (about 1.9:1) of at least 1200 pixels"
    ),
    # Facebook/Open Graph card: validated at 1.91:1 (3% tolerance), then trimmed to exactly 1200 x 630.
    "share": SlotRules(
        1.91 * 0.97,
        1.91 * 1.03,
        (1200, 630),
        (1200, 630),
        exact_size=(1200, 630),
        description="an image of 1.91:1 (for example 1200 x 630 pixels) or larger",
    ),
}


def public_root() -> Path:
    root = Path(settings.edition_artwork_public_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


async def lock(db: AsyncSession) -> None:
    """Serialise artwork writers and ``reconcile`` for the rest of the transaction."""
    await db.execute(text("SELECT pg_advisory_xact_lock(1224)"))


def encode(data: bytes, content_type: str | None, slot: Slot) -> bytes:
    """Validate *data* for *slot* and return a clean, metadata-free JPEG."""
    rules = RULES[slot]
    if content_type not in TYPES:
        raise ServiceError("Use PNG, JPEG or WebP images.", status_code=415)
    if len(data) > LIMIT:
        raise ServiceError("Image must be at most 10 MiB.", status_code=413)
    try:
        with Image.open(BytesIO(data), formats=[TYPES[content_type]]) as image:
            if image.width * image.height > MAX_PIXELS:
                raise ServiceError("Image must be at most 40 megapixels.", status_code=413)
            if getattr(image, "n_frames", 1) != 1:
                raise ServiceError("Use a static image.")
            image.load()
            normalized = ImageOps.exif_transpose(image)
            if normalized.mode in ("RGBA", "LA", "P"):
                normalized = normalized.convert("RGBA")
                background = Image.new("RGBA", normalized.size, (255, 255, 255, 255))
                background.alpha_composite(normalized)
                normalized = background
            normalized = normalized.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ServiceError("Image is not a valid PNG, JPEG or WebP image.") from exc

    width, height = normalized.size
    if (
        not rules.min_ratio <= width / height <= rules.max_ratio
        or width < rules.min_size[0]
        or height < rules.min_size[1]
    ):
        raise ServiceError(f"The {slot} image must be {rules.description}.", status_code=422)

    if rules.exact_size is not None:
        normalized = ImageOps.fit(normalized, rules.exact_size, Image.Resampling.LANCZOS)
    else:
        normalized.thumbnail(rules.max_size, Image.Resampling.LANCZOS)
    # A fresh image carries no source EXIF, comments or ICC profile.
    clean = Image.new("RGB", normalized.size)
    clean.paste(normalized)
    output = BytesIO()
    clean.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return output.getvalue()


async def read_upload(file: UploadFile, slot: Slot) -> bytes:
    data = await file.read(LIMIT + 1)
    return await asyncio.to_thread(encode, data, file.content_type, slot)


def is_managed(url: str | None) -> bool:
    return url is not None and url.startswith(PREFIX) and bool(NAME.fullmatch(url[len(PREFIX) :]))


def add(db: AsyncSession, data: bytes) -> str:
    """Store *data* and return its public path. Removed again if the transaction rolls back."""
    return PREFIX + store(db, public_root(), data, extension="jpg")


async def retire(db: AsyncSession, url: str | None) -> None:
    """Delete a replaced or cleared file after commit, unless another edition still references it."""
    if url is None or not is_managed(url):  # static or external paths are never ours to delete
        return
    await db.flush()
    referenced = await db.scalar(
        select(Edition.id).where(or_(*(getattr(Edition, column) == url for column in COLUMNS.values()))).limit(1)
    )
    if referenced is None:
        defer_delete(db, public_root() / url[len(PREFIX) :])


async def retire_all(db: AsyncSession, edition: Edition) -> None:
    for column in COLUMNS.values():
        await retire(db, getattr(edition, column))


async def reconcile(db: AsyncSession) -> int:
    """Remove crash leftovers under the same lock as every artwork mutation."""
    from app.services.organization_logos import remove

    await lock(db)
    referenced: set[str] = set()
    for column in COLUMNS.values():
        referenced.update(
            url[len(PREFIX) :] for url in (await db.scalars(select(getattr(Edition, column)))).all() if url
        )
    count = 0
    for path in public_root().iterdir():
        if NAME.fullmatch(path.name) and path.name not in referenced:
            remove(path)
            count += 1
    await db.commit()
    return count


async def main() -> None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        print(f"Removed {await reconcile(db)} unreferenced edition images.")


if __name__ == "__main__":
    asyncio.run(main())
