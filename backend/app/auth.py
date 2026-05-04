"""Admin authentication dependency (OIDC Bearer JWT)."""

from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.oidc_config import OIDCTokenError, decode_token

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency — rejects requests without a valid admin Bearer JWT.

    Validates the OIDC access token and checks that the token contains the
    ``admin`` realm role in the ``realm_access.roles`` claim.
    """
    token = credentials.credentials
    try:
        claims = await decode_token(token)
    except OIDCTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    roles = claims.get("realm_access", {}).get("roles", [])

    if "admin" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )
