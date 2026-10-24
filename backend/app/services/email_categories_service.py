"""Admin-managed email categories and the role rule that gates them (#1408).

A category is a stable key plus translated name and description, the roles that may use it and
whether application code sends it automatically. Consent records live in
``app.services.email_consent_service``. Category text edits and role changes never add a sending
capability: ``automatic`` is seeded, not editable.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import ComposedMessage, EmailCategory, EmailConsent, Person
from app.schemas import EmailCategoryCreate, EmailCategoryTexts, EmailCategoryUpdate
from app.services.errors import ConflictError, NotFoundError, ValidationFailedError

TEXT_FIELDS = ("name_nl", "name_fr", "name_en", "description_nl", "description_fr", "description_en")

NEW_EDITIONS = "new_editions"
"""The category the registration form's updates option feeds."""
REWARD_READY = "reward_ready"
"""The category of the automatic mail sent when a stamp card reward is ready."""

PROTECTED_KEYS = {
    NEW_EDITIONS: "the registration form offers it.",
    REWARD_READY: "the automatic reward mail is sent to it.",
}
"""Keys application code depends on; they can be edited but not deleted."""

DEFAULT_EMAIL_CATEGORIES: list[dict[str, Any]] = [
    {
        "key": "club_news",
        "name_nl": "Clubnieuws",
        "name_fr": "Actualités du club",
        "name_en": "Club news",
        "description_nl": "Nieuws en uitnodigingen voor leden van Champagnelovers, zoals de maandelijkse capsule-ruilbeurs.",
        "description_fr": "Actualités et invitations pour les membres de Champagnelovers, comme l’échange mensuel de capsules.",
        "description_en": "News and invitations for Champagnelovers members, such as the monthly capsule exchange.",
        "allowed_roles": ["member"],
        "automatic": False,
        "sort_order": 10,
    },
    {
        "key": NEW_EDITIONS,
        "name_nl": "Nieuwe festivaleditie",
        "name_fr": "Nouvelle édition du festival",
        "name_en": "New festival editions",
        "description_nl": "Een bericht wanneer de inschrijvingen voor een nieuwe editie van het Champagnefestival openen.",
        "description_fr": "Un message lorsque les inscriptions pour une nouvelle édition du Champagnefestival ouvrent.",
        "description_en": "A message when registrations open for a new edition of the Champagne Festival.",
        "allowed_roles": [],
        "automatic": False,
        "sort_order": 20,
    },
    {
        "key": "volunteer_news",
        "name_nl": "Nieuws voor vrijwilligers",
        "name_fr": "Actualités pour les bénévoles",
        "name_en": "Volunteer news",
        "description_nl": "Praktische informatie en oproepen voor de vrijwilligers van het festival.",
        "description_fr": "Informations pratiques et appels pour les bénévoles du festival.",
        "description_en": "Practical information and calls for the festival’s volunteers.",
        "allowed_roles": ["volunteer"],
        "automatic": False,
        "sort_order": 30,
    },
    {
        "key": REWARD_READY,
        "name_nl": "Beloning klaar",
        "name_fr": "Récompense prête",
        "name_en": "Reward ready",
        "description_nl": "Een bericht zodra een beloning van je stempelkaart klaarligt.",
        "description_fr": "Un message dès qu’une récompense de votre carte de fidélité est prête.",
        "description_en": "A message as soon as a reward from your stamp card is ready.",
        "allowed_roles": ["member"],
        "automatic": True,
        "sort_order": 40,
    },
]
"""The categories every installation starts with. Migration 013 seeds the same rows (a migration must
not import application code); a test keeps the two in step. Test databases are seeded from this list."""


def active_roles(person: Person) -> set[str]:
    """Roles the person currently holds: not retired, and none at all once anonymised."""
    if person.anonymised:
        return set()
    return {role for role in person.roles or [] if role not in (person.retired_roles or {})}


def person_allows(person: Person, category: EmailCategory) -> bool:
    """Whether the person may use the category now: a role it needs is held and not retired.

    Checked when consent is given and again when mail is sent, so a retired role stops the category
    while the consent record stays.
    """
    if person.anonymised:
        return False
    allowed = category.allowed_roles or []
    return not allowed or bool(active_roles(person) & set(allowed))


def category_to_dict(category: EmailCategory, locale: str | None = None) -> dict:
    return {
        "key": category.key,
        "name": category.localized_name(locale),
        "description": category.localized_description(locale),
        **{name: getattr(category, name) for name in TEXT_FIELDS},
        "allowed_roles": list(category.allowed_roles or []),
        "automatic": category.automatic,
        "sort_order": category.sort_order,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }


async def list_categories(db: AsyncSession, *, locale: str | None = None) -> list[dict]:
    result = await db.execute(select(EmailCategory).order_by(EmailCategory.sort_order, EmailCategory.key))
    return [category_to_dict(category, locale) for category in result.scalars().all()]


async def _get_locked(db: AsyncSession, key: str) -> EmailCategory:
    category = (
        await db.execute(select(EmailCategory).where(EmailCategory.key == key).with_for_update())
    ).scalar_one_or_none()
    if category is None:
        raise NotFoundError(f"Email category '{key}' not found.", code="email_category_not_found")
    return category


def _unique_roles(roles: list[str]) -> list[str]:
    return list(dict.fromkeys(roles))


async def create_category(
    db: AsyncSession, *, actor: str, body: EmailCategoryCreate, request_id: str | None = None
) -> dict:
    if await db.get(EmailCategory, body.key) is not None:
        raise ConflictError(f"Email category '{body.key}' already exists.", code="email_category_exists")
    category = EmailCategory(
        key=body.key,
        allowed_roles=_unique_roles(body.allowed_roles),
        automatic=False,
        sort_order=body.sort_order,
        **body.model_dump(include=set(TEXT_FIELDS)),
    )
    db.add(category)
    await write_audit_entry(
        db,
        actor=actor,
        action="email_category_created",
        resource_type="email_category",
        resource_id=category.key,
        request_id=request_id,
        details={"allowed_roles": category.allowed_roles},
    )
    await db.commit()
    await db.refresh(category)
    return category_to_dict(category)


async def update_category(
    db: AsyncSession, *, actor: str, key: str, body: EmailCategoryUpdate, request_id: str | None = None
) -> dict:
    category = await _get_locked(db, key)
    # Validate the merged texts before mutating: a partial update may change a single translation.
    texts = {name: getattr(category, name) for name in TEXT_FIELDS}
    texts.update(body.model_dump(include=set(TEXT_FIELDS), exclude_unset=True))
    try:
        validated = EmailCategoryTexts.model_validate(texts).validate_dutch()
    except ValueError as exc:
        raise ValidationFailedError(str(exc)) from exc
    for name in TEXT_FIELDS:
        setattr(category, name, getattr(validated, name))
    if body.allowed_roles is not None:
        category.allowed_roles = _unique_roles(body.allowed_roles)
    if body.sort_order is not None:
        category.sort_order = body.sort_order
    await write_audit_entry(
        db,
        actor=actor,
        action="email_category_updated",
        resource_type="email_category",
        resource_id=key,
        request_id=request_id,
        details={"fields_changed": sorted(body.model_fields_set)},
    )
    await db.commit()
    await db.refresh(category)
    return category_to_dict(category)


async def delete_category(db: AsyncSession, *, actor: str, key: str, request_id: str | None = None) -> None:
    category = await _get_locked(db, key)
    if key in PROTECTED_KEYS:
        raise ConflictError(
            f"Cannot delete email category '{key}': {PROTECTED_KEYS[key]}", code="email_category_protected"
        )
    in_use = (
        await db.execute(select(func.count()).select_from(EmailConsent).where(EmailConsent.category_key == key))
    ).scalar_one()
    if in_use:
        raise ConflictError(
            f"Cannot delete email category '{key}': {in_use} consent record(s) refer to it. "
            "Its history is kept; remove the roles that may use it instead.",
            code="email_category_in_use",
        )
    composed = (
        await db.execute(
            select(func.count()).select_from(ComposedMessage).where(ComposedMessage.email_category_key == key)
        )
    ).scalar_one()
    if composed:
        raise ConflictError(
            f"Cannot delete email category '{key}': {composed} composed message(s) refer to it.",
            code="email_category_in_use",
        )
    await db.delete(category)
    await write_audit_entry(
        db,
        actor=actor,
        action="email_category_deleted",
        resource_type="email_category",
        resource_id=key,
        request_id=request_id,
        details={},
    )
    await db.commit()
