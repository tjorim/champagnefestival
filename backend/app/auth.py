"""Admin authentication dependency (OIDC Bearer JWT)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.oidc_config import OIDCTokenError, decode_token

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)
_optional_bearer_scheme = HTTPBearer(auto_error=False)


class AuthType(StrEnum):
    KEYCLOAK_USER = "keycloak_user"
    KEYCLOAK_SERVICE = "keycloak_service"
    DELEGATED = "delegated"


@dataclass(frozen=True)
class AuthorizationPrincipal:
    """Provider-neutral identity and authorization context."""

    subject: str
    user_id: str | None
    client_id: str | None
    auth_type: AuthType
    roles: frozenset[str] = frozenset()
    scopes: frozenset[str] = frozenset()


def _is_keycloak_service_account(claims: dict[str, Any]) -> bool:
    username = claims.get("preferred_username")
    return isinstance(username, str) and username.startswith("service-account-")


def _principal_from_claims(claims: dict[str, Any]) -> AuthorizationPrincipal:
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    if _is_keycloak_service_account(claims):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keycloak service accounts cannot use the user REST API",
        )
    client_id = claims.get("azp")
    scope = claims.get("scope")
    return AuthorizationPrincipal(
        subject=subject,
        user_id=None,
        client_id=client_id if isinstance(client_id, str) else None,
        auth_type=AuthType.KEYCLOAK_USER,
        roles=frozenset(role for role in _extract_roles(claims) if isinstance(role, str)),
        scopes=frozenset(scope.split()) if isinstance(scope, str) else frozenset(),
    )


def _set_request_principal(request: Request, claims: dict[str, Any]) -> AuthorizationPrincipal:
    principal = _principal_from_claims(claims)
    request.state.principal = principal
    request.state.user_id = principal.subject
    request.state.auth_type = principal.auth_type
    return principal


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


def _extract_roles(claims: dict[str, Any]) -> list[str]:
    """Extract the ``realm_access.roles`` list from token claims defensively.

    Returns an empty list if ``realm_access`` is absent, ``None``, not a dict,
    or its ``roles`` value is not a list.
    """
    realm_access = claims.get("realm_access")
    if not isinstance(realm_access, dict):
        return []
    roles = realm_access.get("roles", [])
    return roles if isinstance(roles, list) else []


async def require_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency — rejects requests without a valid admin Bearer JWT.

    Validates the OIDC access token and checks that the token contains the
    ``admin`` realm role in the ``realm_access.roles`` claim.
    """
    claims = await _decode_or_401(credentials)
    roles = _extract_roles(claims)

    if "admin" not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )

    _set_request_principal(request, claims)


async def require_volunteer(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> None:
    """FastAPI dependency — accepts tokens with the ``volunteer`` or ``admin`` realm role.

    Validates the OIDC access token and checks that the token contains at least
    one of ``volunteer`` or ``admin`` in the ``realm_access.roles`` claim.
    """
    claims = await _decode_or_401(credentials)
    roles = _extract_roles(claims)

    if not ({"volunteer", "admin"} & set(roles)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )

    _set_request_principal(request, claims)


async def get_current_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """FastAPI dependency — returns JWT claims for any valid Bearer token.

    Does not enforce any role; use this for self-service (``/api/me/*``) endpoints
    that only require the caller to be authenticated.
    """
    claims = await _decode_or_401(credentials)
    _set_request_principal(request, claims)
    return claims


async def get_optional_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer_scheme),
) -> dict[str, Any] | None:
    """Return claims for a supplied Bearer token, or ``None`` when absent."""
    if credentials is None:
        return None
    claims = await _decode_or_401(credentials)
    _set_request_principal(request, claims)
    return claims


def get_actor_id(request: Request) -> str:
    """FastAPI dependency — returns the OIDC ``sub`` from request state for audit logging.

    Reads from ``request.state.user_id`` populated by ``require_admin`` /
    ``require_volunteer``, avoiding a second JWT decode. Returns ``'anonymous'``
    when no authenticated user is present.
    """
    user_id = getattr(request.state, "user_id", None)
    return str(user_id) if user_id is not None else "anonymous"
