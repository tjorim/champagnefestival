"""Transactional versioned-policy management: draft, publish, and rollback.

Publication rules (see #944):

- Drafts are freely editable; published versions are never mutated again.
- Publishing is atomic: the draft becomes ``published`` and the previous
  ``published`` row becomes ``superseded`` in the same transaction, guarded by
  a row lock on the parent ``Policy`` so two concurrent publish requests for
  the same policy serialize rather than racing (the loser sees a clean
  `ConflictError`/`NotFoundError` instead of a corrupted double-publish).
- A policy's ``required_locales`` is the explicit locale contract: publish is
  refused unless every required locale has non-blank content.
- Rollback is not a separate code path — it creates a new draft seeded from an
  older version's content, which is then published like any other draft. That
  gives the restored content a new version number, actor, and timestamp
  instead of resurrecting the old immutable row.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import Policy, PolicyVersion
from app.schemas import PolicyDraftCreate, PolicyDraftUpdate
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError
from app.utils import make_id

_LOCALE_FIELDS = ("content_nl", "content_en", "content_fr")


def _version_to_dict(item: PolicyVersion) -> dict:
    return {
        "id": item.id,
        "policy_key": item.policy_key,
        "version_number": item.version_number,
        "status": item.status,
        "content_nl": item.content_nl,
        "content_en": item.content_en,
        "content_fr": item.content_fr,
        "change_summary": item.change_summary,
        "created_at": item.created_at,
        "created_by": item.created_by,
        "updated_at": item.updated_at,
        "published_at": item.published_at,
        "published_by": item.published_by,
    }


def _policy_to_dict(policy: Policy, versions: list[PolicyVersion]) -> dict:
    return {
        "key": policy.key,
        "title_nl": policy.title_nl,
        "title_en": policy.title_en,
        "title_fr": policy.title_fr,
        "required_locales": policy.required_locales.split(","),
        "versions": [_version_to_dict(v) for v in sorted(versions, key=lambda v: v.version_number, reverse=True)],
    }


async def _get_policy_locked(db: AsyncSession, policy_key: str) -> Policy:
    policy = (await db.execute(select(Policy).where(Policy.key == policy_key).with_for_update())).scalar_one_or_none()
    if policy is None:
        raise NotFoundError(f"Policy '{policy_key}' not found.")
    return policy


async def list_policies(db: AsyncSession) -> list[dict]:
    policies = (await db.execute(select(Policy))).scalars().all()
    out = []
    for policy in policies:
        versions = (await db.execute(select(PolicyVersion).where(PolicyVersion.policy_key == policy.key))).scalars()
        out.append(_policy_to_dict(policy, list(versions)))
    return out


async def get_policy(db: AsyncSession, *, policy_key: str) -> dict:
    policy = await db.get(Policy, policy_key)
    if policy is None:
        raise NotFoundError(f"Policy '{policy_key}' not found.")
    versions = (await db.execute(select(PolicyVersion).where(PolicyVersion.policy_key == policy_key))).scalars()
    return _policy_to_dict(policy, list(versions))


async def get_published(db: AsyncSession, *, policy_key: str) -> tuple[Policy, PolicyVersion]:
    policy = await db.get(Policy, policy_key)
    if policy is None:
        raise NotFoundError(f"Policy '{policy_key}' not found.")
    version = (
        await db.execute(
            select(PolicyVersion).where(PolicyVersion.policy_key == policy_key, PolicyVersion.status == "published")
        )
    ).scalar_one_or_none()
    if version is None:
        raise NotFoundError(f"Policy '{policy_key}' has no published version.")
    return policy, version


async def create_draft(
    db: AsyncSession, *, actor: str, policy_key: str, body: PolicyDraftCreate, request_id: str | None
) -> dict:
    policy = await _get_policy_locked(db, policy_key)
    existing_draft = (
        await db.execute(
            select(PolicyVersion.id).where(PolicyVersion.policy_key == policy_key, PolicyVersion.status == "draft")
        )
    ).scalar_one_or_none()
    if existing_draft is not None:
        raise ConflictError(f"Policy '{policy_key}' already has an open draft.")

    source = None
    if body.source_version_number is not None:
        source = (
            await db.execute(
                select(PolicyVersion).where(
                    PolicyVersion.policy_key == policy_key,
                    PolicyVersion.version_number == body.source_version_number,
                )
            )
        ).scalar_one_or_none()
        if source is None:
            raise NotFoundError(f"Policy '{policy_key}' has no version {body.source_version_number}.")
    else:
        source = (
            await db.execute(
                select(PolicyVersion).where(PolicyVersion.policy_key == policy_key, PolicyVersion.status == "published")
            )
        ).scalar_one_or_none()

    highest = (
        await db.execute(
            select(PolicyVersion.version_number)
            .where(PolicyVersion.policy_key == policy_key)
            .order_by(PolicyVersion.version_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    change_summary = None
    if source is not None and body.source_version_number is not None:
        change_summary = f"Rolled back to version {source.version_number}."

    draft = PolicyVersion(
        id=make_id("polv"),
        policy_key=policy.key,
        version_number=1 if highest is None else highest + 1,
        status="draft",
        content_nl=source.content_nl if source else None,
        content_en=source.content_en if source else None,
        content_fr=source.content_fr if source else None,
        change_summary=change_summary,
        created_by=actor,
    )
    db.add(draft)
    await write_audit_entry(
        db,
        actor=actor,
        action="policy_draft_created",
        resource_type="policy_version",
        resource_id=draft.id,
        request_id=request_id,
        details={"policy_key": policy_key, "source_version_number": source.version_number if source else None},
    )
    await db.commit()
    await db.refresh(draft)
    return _version_to_dict(draft)


async def _get_draft_locked(db: AsyncSession, policy_key: str) -> PolicyVersion:
    draft = (
        await db.execute(
            select(PolicyVersion)
            .where(PolicyVersion.policy_key == policy_key, PolicyVersion.status == "draft")
            .with_for_update()
        )
    ).scalar_one_or_none()
    if draft is None:
        raise NotFoundError(f"Policy '{policy_key}' has no open draft.")
    return draft


async def update_draft(
    db: AsyncSession, *, actor: str, policy_key: str, body: PolicyDraftUpdate, request_id: str | None
) -> dict:
    draft = await _get_draft_locked(db, policy_key)
    for name, value in body.model_dump(include=body.model_fields_set).items():
        setattr(draft, name, value)
    await write_audit_entry(
        db,
        actor=actor,
        action="policy_draft_updated",
        resource_type="policy_version",
        resource_id=draft.id,
        request_id=request_id,
        details={"policy_key": policy_key},
    )
    await db.commit()
    await db.refresh(draft)
    return _version_to_dict(draft)


async def discard_draft(db: AsyncSession, *, actor: str, policy_key: str, request_id: str | None) -> None:
    draft = await _get_draft_locked(db, policy_key)
    draft_id = draft.id
    await db.delete(draft)
    await write_audit_entry(
        db,
        actor=actor,
        action="policy_draft_discarded",
        resource_type="policy_version",
        resource_id=draft_id,
        request_id=request_id,
        details={"policy_key": policy_key},
    )
    await db.commit()


async def publish_draft(db: AsyncSession, *, actor: str, policy_key: str, request_id: str | None) -> dict:
    # Locking the parent Policy row serializes concurrent publish attempts for
    # the same policy: the second request blocks here until the first commits
    # (or rolls back), so it always re-reads a consistent draft/published pair
    # rather than racing to supersede the same published row twice.
    policy = await _get_policy_locked(db, policy_key)
    draft = await _get_draft_locked(db, policy_key)

    required = policy.required_locales.split(",")
    missing = [locale for locale in required if not (getattr(draft, f"content_{locale}") or "").strip()]
    if missing:
        raise ValidationFailedError(
            f"Policy '{policy_key}' cannot be published: missing required locale(s) {', '.join(missing)}."
        )

    current_published = (
        await db.execute(
            select(PolicyVersion)
            .where(PolicyVersion.policy_key == policy_key, PolicyVersion.status == "published")
            .with_for_update()
        )
    ).scalar_one_or_none()
    superseded_version_number = None
    if current_published is not None:
        current_published.status = "superseded"
        superseded_version_number = current_published.version_number

    now = datetime.now(UTC)
    draft.status = "published"
    draft.published_at = now
    draft.published_by = actor

    await write_audit_entry(
        db,
        actor=actor,
        action="policy_published",
        resource_type="policy_version",
        resource_id=draft.id,
        request_id=request_id,
        details={
            "policy_key": policy_key,
            "version_number": draft.version_number,
            "superseded_version_number": superseded_version_number,
        },
    )
    await db.commit()
    await db.refresh(draft)
    return _version_to_dict(draft)
