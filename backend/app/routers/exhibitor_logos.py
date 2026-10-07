"""Local public logo serving; production Caddy serves only the public root."""

from os.path import basename

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.exhibitor_logos import NAME, PREFIX, roots

router = APIRouter(tags=["exhibitors"])


@router.get(PREFIX + "{name}")
async def public_logo(name: str) -> Response:
    filename = basename(name)
    if filename != name or not NAME.fullmatch(filename):
        raise HTTPException(404, "Logo not found.")
    directory = roots()[0].resolve()
    path = (directory / filename).resolve()
    if path.parent != directory:
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
