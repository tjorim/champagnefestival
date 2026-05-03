"""OIDC/JWT authentication for Champagne Festival backend.

Validates Bearer JWTs issued by a configured OIDC provider (e.g. authentik,
Keycloak) and provides token decoding for the admin endpoints.

The provider is configured via environment variables:
  OIDC_ISSUER_URL   — OIDC provider base URL
  OIDC_AUDIENCE     — Expected audience claim (optional)
  OIDC_JWKS_URI     — JWKS endpoint override (defaults to {issuer}/.well-known/jwks.json)
  OIDC_ALGORITHMS   — Comma-separated list of accepted algorithms (default RS256)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.config import settings

logger = logging.getLogger(__name__)

_OIDC_ALGORITHMS: list[str] = [a.strip() for a in settings.oidc_algorithms.split(",") if a.strip()]
_OIDC_AUDIENCE: str | None = settings.oidc_audience or None
_OIDC_ISSUER: str | None = settings.oidc_issuer_url or None

_jwks_lock = asyncio.Lock()
_jwks_cache: dict[str, Any] | None = None


def _get_jwks_uri() -> str:
    if settings.oidc_jwks_uri:
        return settings.oidc_jwks_uri
    if not settings.oidc_issuer_url:
        raise OIDCTokenError("OIDC_ISSUER_URL is not configured")
    base = settings.oidc_issuer_url.rstrip("/")
    return f"{base}/.well-known/jwks.json"


async def _fetch_jwks() -> dict[str, Any]:
    uri = _get_jwks_uri()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(uri)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.error("Failed to fetch JWKS from %s: %s", uri, exc)
        raise


async def _get_jwks(*, force_refresh: bool = False) -> dict[str, Any]:
    global _jwks_cache  # noqa: PLW0603
    async with _jwks_lock:
        if _jwks_cache is None or force_refresh:
            _jwks_cache = await _fetch_jwks()
        return _jwks_cache


class OIDCTokenError(Exception):
    """Raised when a JWT cannot be validated."""


async def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT Bearer token.

    Tries cached JWKS first; on key-not-found, refreshes once to handle key rotation.
    """
    options: dict[str, Any] = {
        "verify_aud": _OIDC_AUDIENCE is not None,
        "verify_iss": _OIDC_ISSUER is not None,
    }

    for attempt in range(2):
        try:
            jwks = await _get_jwks(force_refresh=(attempt == 1))
            return jwt.decode(
                token,
                jwks,
                algorithms=_OIDC_ALGORITHMS,
                audience=_OIDC_AUDIENCE,
                issuer=_OIDC_ISSUER,
                options=options,
            )
        except ExpiredSignatureError as exc:
            raise OIDCTokenError("Token has expired") from exc
        except JWTError as exc:
            if attempt == 0 and "Unable to find a signing key" in str(exc):
                logger.info("Signing key not found in cached JWKS — refreshing")
                continue
            raise OIDCTokenError(f"Token validation failed: {exc}") from exc

    raise OIDCTokenError("Token validation failed after JWKS refresh")
