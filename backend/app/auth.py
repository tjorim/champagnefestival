"""Admin authentication dependency (OIDC Bearer JWT)."""

from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.oidc_config import OIDCTokenError, decode_token

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)
_ADMIN_USERNAMES: frozenset[str] = frozenset(u.strip() for u in settings.admin_usernames.split(",") if u.strip())


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency — rejects requests without a valid admin Bearer JWT.

    Validates the OIDC access token and checks that the username (preferred_username
    or email-local-part claim) is in the ADMIN_USERNAMES allowlist.
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

    username = (claims.get("preferred_username") or "").strip()
    if not username:
        email = (claims.get("email") or "").strip()
        username = email.split("@")[0] if email else ""

    if not username or username not in _ADMIN_USERNAMES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )
