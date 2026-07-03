"""Public authentication bootstrap endpoints."""

import logging

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class OidcDiscoveryConfig(BaseModel):
    """Public OIDC endpoints discovered by native clients from the API."""

    issuer: str
    authorization_url: str
    token_url: str


# Discovery results are stable for the lifetime of the process, like the JWKS
# cache in app.oidc_config. Keyed by issuer so a config change is picked up.
_config_cache: dict[str, OidcDiscoveryConfig] = {}


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=10)


async def _discover(issuer: str) -> OidcDiscoveryConfig:
    """Fetch the provider's OIDC discovery document and extract public endpoints."""
    discovery_url = f"{issuer}/.well-known/openid-configuration"
    async with _http_client() as client:
        response = await client.get(discovery_url)
    response.raise_for_status()
    data = response.json()
    return OidcDiscoveryConfig(
        issuer=data.get("issuer", issuer),
        authorization_url=data["authorization_endpoint"],
        token_url=data["token_endpoint"],
    )


@router.get("/oidc-config", response_model=OidcDiscoveryConfig)
async def oidc_config() -> OidcDiscoveryConfig:
    """Return public OIDC endpoints for native clients.

    Endpoints come from the provider's standard discovery document so any
    OIDC provider (Keycloak, authentik, ...) works without provider-specific
    URL paths.
    """
    if not settings.oidc_issuer_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC not configured on this server",
        )
    issuer = settings.oidc_issuer_url.rstrip("/")
    cached = _config_cache.get(issuer)
    if cached is not None:
        return cached
    try:
        config = await _discover(issuer)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.error("OIDC discovery failed for %s: %s", issuer, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC discovery failed",
        ) from exc
    _config_cache[issuer] = config
    return config
