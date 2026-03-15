"""Admin bearer-token authentication dependency."""

import secrets

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    """FastAPI dependency — raises 401 if the admin token is missing or wrong."""
    if not settings.admin_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin access is not configured on this server.",
        )
    if credentials is None or not secrets.compare_digest(credentials.credentials, settings.admin_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
