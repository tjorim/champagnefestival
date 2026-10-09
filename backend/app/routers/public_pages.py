"""GET / and GET /privacy — live backend rendering (#992).

Both routes are read-only and perform no persisted mutations.

Reads nothing from the request except an optional ``?lng=`` locale — the
same query parameter the SPA already uses, kept as part of the cache key on
both sides per decision 2.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import cast

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import FaqItem
from app.schemas import FaqLocale
from app.services import editions_service, jsonld_service, policies_service
from app.services.errors import NotFoundError
from app.services.frontend_i18n_snippets import Locale
from app.services.policy_markdown import render_markdown
from app.services.public_render import (
    inject_marker,
    json_ld_script,
    render_home_content,
    render_privacy_content,
    rewrite_head_meta,
)
from app.services.public_render_cache import public_render_cache
from app.utils import faq_item_to_public_dict

logger = logging.getLogger(__name__)

router = APIRouter(tags=["public-pages"])


class _ShellCache:
    """The built `index.html`, re-read under the same TTL as the render
    cache and keyed on the file's mtime (a
    frontend deploy replaces this file and its hashed asset names while the
    backend keeps running, so caching it at process start would serve
    `<script>` tags pointing at assets that no longer exist)."""

    def __init__(self) -> None:
        self._content: str | None = None
        self._mtime: float | None = None

    def read(self, path: Path) -> str | None:
        try:
            stat = path.stat()
        except OSError:
            return None
        if self._content is not None and self._mtime == stat.st_mtime:
            return self._content
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            return None
        self._content = content
        self._mtime = stat.st_mtime
        return content


_shell_cache = _ShellCache()


def _read_shell() -> str | None:
    """``None`` when the frontend build isn't mounted/present — callers
    return a 404 rather than crash."""
    shell_path = Path(settings.frontend_dist_path) / "index.html"
    return _shell_cache.read(shell_path)


def _resolve_locale(raw: str | None) -> FaqLocale:
    return raw if raw in ("nl", "en", "fr") else "nl"


async def _load_active_faq_items(db: AsyncSession, *, locale: FaqLocale) -> list[dict]:
    result = await db.execute(select(FaqItem).where(FaqItem.active.is_(True)).order_by(FaqItem.sort_order))
    return [faq_item_to_public_dict(f, locale) for f in result.scalars().all()]


async def _render_home(db: AsyncSession, *, locale: FaqLocale) -> str:
    shell = _read_shell()
    if shell is None:
        raise NotFoundError("Frontend build not found.")

    edition = await editions_service.find_active_edition(db)
    faq_items = await _load_active_faq_items(db, locale=locale)

    events: list[dict] = []
    json_ld = None
    # The site's own tagline, not edition-dependent — matches the static
    # shell's pre-existing default description, so a quiet period between
    # editions never regresses to a bare site name.
    description = jsonld_service.WELCOME_SUBTITLE[locale]
    if edition is not None:
        payload = await editions_service.edition_payload(db, edition, active_only=True, public=True, locale=locale)
        events = payload["events"]
        json_ld = jsonld_service.build_event_json_ld(payload, base_url=settings.public_url, locale=locale)

    html_out = rewrite_head_meta(
        shell,
        title="Champagnefestival",
        description=description,
        url=settings.public_url,
        locale=locale,
    )
    head_fragment = json_ld_script(json_ld) if json_ld is not None else ""
    content = render_home_content(faq_items=faq_items, events=events, locale=locale)
    html_out = inject_marker(html_out, "ssr:head", head_fragment)
    return inject_marker(html_out, "ssr:content", content)


async def _render_privacy(db: AsyncSession, *, locale: FaqLocale) -> str:
    shell = _read_shell()
    if shell is None:
        raise NotFoundError("Frontend build not found.")

    policy, version = await policies_service.get_published(db, policy_key="privacy")
    title, content_source, content_locale = policies_service.resolve_published(policy, version, locale)
    if not content_source.strip():
        raise NotFoundError("Policy 'privacy' has no published content.")
    html_body = render_markdown(content_source)

    html_out = rewrite_head_meta(
        shell,
        title=f"{title} — Champagnefestival",
        description=title,
        url=f"{settings.public_url}/privacy",
        locale=cast(Locale, content_locale),
    )
    content = render_privacy_content(title=title, html_body=html_body)
    return inject_marker(inject_marker(html_out, "ssr:head", ""), "ssr:content", content)


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def get_home_page(lng: str | None = Query(default=None), db: AsyncSession = Depends(get_db)) -> Response:
    locale = _resolve_locale(lng)
    try:
        html_out = await public_render_cache.get_or_render(f"/:{locale}", lambda: _render_home(db, locale=locale))
    except NotFoundError:
        return PlainTextResponse("Not Found", status_code=404)
    # Setting response.headers on an injected Response *parameter* only takes
    # effect when the route returns a plain value FastAPI serializes itself —
    # a route that returns its own Response object (as this one does) must
    # set headers on that object directly, or they're silently dropped.
    return HTMLResponse(html_out, headers={"Cache-Control": "public, max-age=60"})


@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def get_privacy_page(lng: str | None = Query(default=None), db: AsyncSession = Depends(get_db)) -> Response:
    locale = _resolve_locale(lng)
    try:
        html_out = await public_render_cache.get_or_render(
            f"/privacy:{locale}", lambda: _render_privacy(db, locale=locale)
        )
    except NotFoundError:
        return PlainTextResponse("Not Found", status_code=404)
    return HTMLResponse(html_out, headers={"Cache-Control": "public, max-age=60"})
