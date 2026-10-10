"""Local public serving of edition artwork; production Caddy serves the same directory (#1224)."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.edition_artwork import NAME, PREFIX, public_root

router = APIRouter(tags=["editions"])


@router.get(PREFIX + "{name}")
async def public_edition_artwork(name: str) -> Response:
    if not NAME.fullmatch(name):
        raise HTTPException(404, "Image not found.")
    directory = public_root().resolve()
    # Enumerate trusted storage paths: request data selects a file but never
    # becomes a filesystem path. Production Caddy serves this directory directly.
    path = next(
        (
            entry
            for entry in directory.iterdir()
            if entry.name == name and NAME.fullmatch(entry.name) and not entry.is_symlink() and entry.is_file()
        ),
        None,
    )
    if path is None:
        raise HTTPException(404, "Image not found.")
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise HTTPException(404, "Image not found.") from exc
    # Names are content-hashed and never reused, so the file is immutable.
    return Response(
        data,
        media_type="image/jpeg",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable"},
    )
