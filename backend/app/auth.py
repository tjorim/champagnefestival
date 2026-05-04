"""Admin authentication dependency (OIDC Bearer JWT)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.oidc_config import OIDCTokenError, decode_token

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)
_bearer_scheme_optional = HTTPBearer(auto_error=False)


async def _decode_or_401(credentials: HTTPAuthorizationCredentials) -> dict[str, Any]:
    """Decode a Bearer JWT and return its claims, raising HTTP 401 on failure."""
    token = credentials.credentials
    try:
        return await decode_token(token)
    except OIDCTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency — rejects requests without a valid admin Bearer JWT.

    Validates the OIDC access token and checks that the token contains the
    ``admin`` realm role in the ``realm_access.roles`` claim.
    """
    claims = await _decode_or_401(credentials)
    roles = claims.get("realm_access", {}).get("roles", [])

    if "admin" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )


async def require_volunteer(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency — accepts tokens with the ``volunteer`` or ``admin`` realm role.

    Validates the OIDC access token and checks that the token contains at least
    one of ``volunteer`` or ``admin`` in the ``realm_access.roles`` claim.
    """
    claims = await _decode_or_401(credentials)
    roles = claims.get("realm_access", {}).get("roles", [])

    if not ({"volunteer", "admin"} & set(roles)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )


async def get_current_claims(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """FastAPI dependency — returns JWT claims for any valid Bearer token.

    Does not enforce any role; use this for self-service (``/api/me/*``) endpoints
    that only require the caller to be authenticated.
    """
    return await _decode_or_401(credentials)
