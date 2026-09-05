"""Versioned legal/policy document endpoints: admin draft/publish workflow plus public output.

Business logic lives in ``app.services.policies_service``; this router is a thin
adapter that translates ``ServiceError`` into ``HTTPException`` (see #944).
"""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_admin
from app.database import get_db
from app.schemas import (
    FaqLocale,
    PolicyDraftCreate,
    PolicyDraftUpdate,
    PolicyOut,
    PolicyPublicOut,
    PolicyRenderOut,
    PolicyRenderRequest,
    PolicyVersionOut,
)
from app.services import policies_service as service
from app.services.errors import NotFoundError, ServiceError, to_http_exception
from app.services.policy_markdown import render_markdown

router = APIRouter(prefix="/api/policies", tags=["policies"])


async def _call(operation):
    try:
        return await operation
    except ServiceError as exc:
        raise to_http_exception(exc) from exc


@router.get("/{policy_key}/current", response_model=PolicyPublicOut)
async def get_current(
    policy_key: str,
    locale: FaqLocale = Query(default="nl"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public: the latest published version, rendered for `locale`.

    404s rather than falling back to another locale when this locale is not
    (yet) required/present — see #944's locale-publication rules.
    """
    policy, version = await _call(service.get_published(db, policy_key=policy_key))
    content = getattr(version, f"content_{locale}")
    if not (content or "").strip():
        raise to_http_exception(NotFoundError(f"Policy '{policy_key}' has no published content for locale '{locale}'."))
    return {
        "key": policy.key,
        "title": getattr(policy, f"title_{locale}") or policy.title_nl,
        "locale": locale,
        "html": render_markdown(content),
        "version_number": version.version_number,
        "published_at": version.published_at,
    }


@router.post("/render", response_model=PolicyRenderOut, dependencies=[Depends(require_admin)])
async def render_preview(body: PolicyRenderRequest) -> dict:
    """Admin: render not-yet-saved Markdown with the exact same renderer/sanitizer
    used for public output, for live preview while editing a draft."""
    return {"html": render_markdown(body.markdown)}


@router.get("", response_model=list[PolicyOut], dependencies=[Depends(require_admin)])
async def list_policies(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await service.list_policies(db)


@router.get("/{policy_key}", response_model=PolicyOut, dependencies=[Depends(require_admin)])
async def get_policy(policy_key: str, db: AsyncSession = Depends(get_db)) -> dict:
    return await _call(service.get_policy(db, policy_key=policy_key))


@router.post(
    "/{policy_key}/draft",
    response_model=PolicyVersionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_draft(
    policy_key: str,
    body: PolicyDraftCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await _call(
        service.create_draft(
            db, actor=actor, policy_key=policy_key, body=body, request_id=getattr(request.state, "request_id", None)
        )
    )


@router.put("/{policy_key}/draft", response_model=PolicyVersionOut, dependencies=[Depends(require_admin)])
async def update_draft(
    policy_key: str,
    body: PolicyDraftUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await _call(
        service.update_draft(
            db, actor=actor, policy_key=policy_key, body=body, request_id=getattr(request.state, "request_id", None)
        )
    )


@router.delete("/{policy_key}/draft", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
async def discard_draft(
    policy_key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> None:
    await _call(
        service.discard_draft(
            db, actor=actor, policy_key=policy_key, request_id=getattr(request.state, "request_id", None)
        )
    )


@router.post("/{policy_key}/draft/publish", response_model=PolicyVersionOut, dependencies=[Depends(require_admin)])
async def publish_draft(
    policy_key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(get_actor_id),
) -> dict:
    return await _call(
        service.publish_draft(
            db, actor=actor, policy_key=policy_key, request_id=getattr(request.state, "request_id", None)
        )
    )
