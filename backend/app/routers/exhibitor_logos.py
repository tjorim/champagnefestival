"""Local public logo serving; production Caddy serves only the public root."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.exhibitor_logos import NAME, PREFIX, roots

router = APIRouter(tags=["exhibitors"])


@router.get(PREFIX + "{name}")
async def public_logo(name: str) -> Response:
    if not NAME.fullmatch(name):
        raise HTTPException(404, "Logo not found.")
    path = roots()[0] / name
    try:
        data = path.read_bytes()
    except FileNotFoundError as exc:
        raise HTTPException(404, "Logo not found.") from exc
    return Response(
        data,
        media_type="image/png",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600"},
    )
