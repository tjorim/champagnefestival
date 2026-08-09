"""Managed integration-client credential endpoints (admin only).

Create/list/revoke/rotate database-backed automation credentials for MCP —
see issue #807 and ``app.services.integration_clients_service``. Business
logic (including audit-entry construction) is shared with
``app.mcp.admin.integration_clients``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import IntegrationClientCreate, IntegrationClientCreatedOut, IntegrationClientOut
from app.services import integration_clients_service as ics
from app.services.errors import ServiceError, to_http_exception

router = APIRouter(
    prefix="/api/integration-clients",
    tags=["integration-clients"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=IntegrationClientCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_integration_client(
    body: IntegrationClientCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        client_dict, raw_key = await ics.create_integration_client(
            db,
            actor=actor,
            creator_role="admin",  # require_admin already gated this request
            name=body.name,
            allowed_role=body.allowed_role,
            rate_limit_per_minute=body.rate_limit_per_minute,
            request_id=getattr(request.state, "request_id", None),
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    return {**client_dict, "key": raw_key}


@router.get("", response_model=list[IntegrationClientOut])
async def list_integration_clients(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await ics.list_integration_clients(db)


@router.post("/{client_id}/revoke", response_model=IntegrationClientOut)
async def revoke_integration_client(
    client_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        return await ics.revoke_integration_client(
            db, actor=actor, client_id=client_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.post("/{client_id}/rotate", response_model=IntegrationClientCreatedOut)
async def rotate_integration_client(
    client_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    try:
        client_dict, raw_key = await ics.rotate_integration_client(
            db, actor=actor, client_id=client_id, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    return {**client_dict, "key": raw_key}
