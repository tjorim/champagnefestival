"""Local public logo serving; production Caddy serves only the public root."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.organization_logos import NAME, PREFIX, roots

router = APIRouter(tags=["organizations"])


@router.get(PREFIX + "{name}")
async def public_logo(name: str) -> Response:
    if not NAME.fullmatch(name):
        raise HTTPException(404, "Logo not found.")
    directory = roots()[0].resolve()
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
        raise HTTPException(404, "Logo not found.")
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise HTTPException(404, "Logo not found.") from exc
    return Response(
        data,
        media_type="image/png",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600"},
    )
