"""OIDC/JWT authentication for Champagne Festival backend.

Validates Bearer JWTs issued by a configured OIDC provider (e.g. authentik,
Keycloak) and provides token decoding for the admin endpoints.

The provider is configured via environment variables:
  OIDC_ISSUER_URL   — OIDC provider base URL
  OIDC_AUDIENCE     — Expected audience claim (optional)
  OIDC_JWKS_URI     — JWKS endpoint override (auto-discovered via /.well-known/openid-configuration if omitted)
  OIDC_ALGORITHMS   — Comma-separated list of accepted algorithms (default RS256)
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
import jwt
from jwt.exceptions import ExpiredSignatureError, PyJWTError
from jwt.types import Options

from app.config import settings

logger = logging.getLogger(__name__)

_OIDC_ALGORITHMS: list[str] = [a.strip() for a in settings.oidc_algorithms.split(",") if a.strip()]
_OIDC_AUDIENCE: str | None = settings.oidc_audience or None
_OIDC_ISSUER: str | None = settings.oidc_issuer_url or None

_jwks_lock = asyncio.Lock()
_jwks_cache: dict[str, Any] | None = None

_jwks_uri_lock = asyncio.Lock()
_jwks_uri_cache: str | None = None


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=10)


async def _resolve_jwks_uri() -> str:
    """Return the JWKS URI, discovering it from the OIDC configuration document.

    Keycloak (and other providers) serve their signing keys at a
    provider-specific path, not the generic {issuer}/.well-known/jwks.json, so
    the URI is discovered from the standard OIDC discovery document instead of
    guessed. Discovery results are cached for the process lifetime.
    """
    global _jwks_uri_cache  # noqa: PLW0603
    if settings.oidc_jwks_uri:
        return settings.oidc_jwks_uri
    if not settings.oidc_issuer_url:
        raise OIDCTokenError("OIDC_ISSUER_URL is not configured")
    async with _jwks_uri_lock:
        if _jwks_uri_cache is not None:
            return _jwks_uri_cache
        base = settings.oidc_issuer_url.rstrip("/")
        try:
            async with _http_client() as client:
                resp = await client.get(f"{base}/.well-known/openid-configuration")
            resp.raise_for_status()
            _jwks_uri_cache = resp.json()["jwks_uri"]
            logger.info("Discovered JWKS URI: %s", _jwks_uri_cache)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise OIDCTokenError(f"OIDC discovery failed for {base}: {exc}") from exc
        return _jwks_uri_cache


async def _fetch_jwks() -> dict[str, Any]:
    uri = await _resolve_jwks_uri()
    try:
        async with _http_client() as client:
            response = await client.get(uri)
        response.raise_for_status()
        return response.json()
    except OIDCTokenError:
        raise
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


def _find_signing_key(jwks_dict: dict[str, Any], kid: str | None) -> Any | None:
    """Return the JWKS key matching kid, or any key when kid is absent."""
    from jwt import PyJWKSet

    jwks_set = PyJWKSet.from_dict(jwks_dict)
    return next(
        (k for k in jwks_set.keys if kid is None or k.key_id == kid),
        None,
    )


async def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT Bearer token.

    Tries cached JWKS first; on key-not-found, refreshes once to handle key rotation.
    """
    options: Options = {
        "verify_aud": _OIDC_AUDIENCE is not None,
        "verify_iss": _OIDC_ISSUER is not None,
    }

    for attempt in range(2):
        try:
            jwks_dict = await _get_jwks(force_refresh=(attempt == 1))
            header = jwt.get_unverified_header(token)
            kid = header.get("kid")
            signing_key = _find_signing_key(jwks_dict, kid)

            if signing_key is None:
                if attempt == 0:
                    logger.info("Signing key not found in cached JWKS — refreshing")
                    continue
                raise OIDCTokenError("Signing key not found in JWKS")

            return jwt.decode(
                token,
                signing_key.key,
                algorithms=_OIDC_ALGORITHMS,
                audience=_OIDC_AUDIENCE,
                issuer=_OIDC_ISSUER,
                options=options,
            )
        except ExpiredSignatureError as exc:
            raise OIDCTokenError("Token has expired") from exc
        except PyJWTError as exc:
            raise OIDCTokenError(f"Token validation failed: {exc}") from exc

    raise OIDCTokenError("Token validation failed after JWKS refresh")
