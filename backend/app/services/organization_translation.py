"""Explicit, ephemeral description drafts from the configured self-hosted service."""

import asyncio
from typing import Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.ratelimit import check_rate_limit
from app.schemas import RequestModel

Language = Literal["nl", "fr", "en"]


class TranslationRequest(RequestModel):
    text: str = Field(min_length=1, max_length=600)
    source: Language
    target: Language


class TranslationDraft(BaseModel):
    text: str


class TranslationCapabilities(BaseModel):
    languages: list[Language]


# Reject bursts instead of creating an unbounded queue on the single-CPU service.
_worker = asyncio.Lock()


def capabilities() -> TranslationCapabilities:
    languages: list[Language] = []
    if settings.translation_service_url:
        languages = [
            language for language in ("nl", "fr", "en") if language in settings.translation_languages.split(",")
        ]
    return TranslationCapabilities(languages=languages)


async def suggest(body: TranslationRequest, identity: str) -> TranslationDraft:
    languages = capabilities().languages
    if not languages:
        raise HTTPException(503, "Description translation is not configured.")
    if body.source == body.target or body.source not in languages or body.target not in languages:
        raise HTTPException(422, "Unsupported translation language pair.")
    if not body.text.strip():
        raise HTTPException(422, "A non-empty description is required.")
    # Identity-wide enforcement is stricter than a per-session bucket: refreshing
    # tokens or signing in again cannot replenish the allowance.
    if not check_rate_limit(identity, scope="organization-translation", max_requests=5, window_seconds=600):
        raise HTTPException(429, "Too many translation requests. Try again later.", headers={"Retry-After": "600"})
    if _worker.locked():
        raise HTTPException(503, "Translation is busy. Try again later.")
    async with _worker:
        try:
            async with httpx.AsyncClient(timeout=90.0, trust_env=False) as client:
                response = await client.post(
                    f"{settings.translation_service_url.rstrip('/')}/translate",
                    json={"q": body.text, "source": body.source, "target": body.target, "format": "text"},
                )
                response.raise_for_status()
                text = response.json().get("translatedText")
                if not isinstance(text, str) or not text.strip() or len(text) > 600:
                    raise ValueError("Invalid draft")
                return TranslationDraft(text=text)
        except httpx.TimeoutException:
            raise HTTPException(504, "Translation timed out. Try again later.") from None
        except httpx.HTTPError, ValueError, AttributeError:
            # Never expose or log service errors, since they can contain the text.
            raise HTTPException(503, "Translation is unavailable. Try again later.") from None
