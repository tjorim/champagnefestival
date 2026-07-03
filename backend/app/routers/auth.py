"""Public authentication bootstrap endpoints."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class OidcDiscoveryConfig(BaseModel):
    """Public OIDC endpoints discovered by native clients from the API."""

    issuer: str
    authorization_url: str
    token_url: str


@router.get("/oidc-config", response_model=OidcDiscoveryConfig)
def oidc_config() -> OidcDiscoveryConfig:
    """Return public OIDC endpoints for native clients."""
    if not settings.oidc_issuer_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC not configured on this server",
        )
    issuer = settings.oidc_issuer_url.rstrip("/")
    return OidcDiscoveryConfig(
        issuer=issuer,
        authorization_url=f"{issuer}/protocol/openid-connect/auth",
        token_url=f"{issuer}/protocol/openid-connect/token",
    )
