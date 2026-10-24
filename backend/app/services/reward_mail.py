"""Automatic "reward ready" member mail (#1407, triggered by the stamp-card reward of #1405).

Sent to the card's person only while they have consent for the automatic ``reward_ready`` category
and member mail is available. Nothing is queued otherwise, so rewards earned while mailing is off
never produce a late "ready" mail afterwards. One attempt, like composed mail.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import member_mail
from app.config import settings
from app.database import async_session_factory
from app.member_mail import (
    MemberMail,
    MemberMailRejected,
    MemberMailSkipped,
    MemberMailUnavailable,
    MemberMailUncertain,
)
from app.models import EmailCategory, OutboxJob, StampCard, StampCardReward
from app.services.email_categories_service import REWARD_READY
from app.services.member_mail_audience import eligible_person
from app.services.member_mail_render import compose_text
from app.services.member_mail_unsubscribe import unsubscribe_url
from app.services.outbox_service import enqueue_job
from app.translations import resolve_text

logger = logging.getLogger(__name__)

REWARD_READY_EMAIL = "reward_ready_email"

_COPY = {
    "nl": (
        "Je beloning ligt klaar",
        "Je stempelkaart is vol. Je beloning ({reward}) ligt klaar om opgehaald te worden.",
    ),
    "fr": (
        "Votre récompense est prête",
        "Votre carte de fidélité est complète. Votre récompense ({reward}) est prête à être récupérée.",
    ),
    "en": ("Your reward is ready", "Your stamp card is full. Your reward ({reward}) is ready to collect."),
}


async def enqueue_reward_ready(db: AsyncSession, reward: StampCardReward, card: StampCard) -> None:
    """Queue the mail in the caller's transaction when the card's person would receive it."""
    if not member_mail.member_mail_available():
        return
    category = await db.get(EmailCategory, REWARD_READY)
    if category is None or await eligible_person(db, card.person_id, category) is None:
        return
    job = await enqueue_job(
        db,
        job_type=REWARD_READY_EMAIL,
        resource_type="reward_ready_delivery",
        resource_id=reward.id,
        deduplication_key=f"reward-ready:{reward.id}",
        actor="system",
    )
    job.max_attempts = 1


async def deliver_reward_ready_email(resource_id: str) -> bool:
    """Outbox handler for ``reward_ready_email`` jobs; *resource_id* is the ``StampCardReward`` id."""
    if not member_mail.member_mail_available():
        raise MemberMailUnavailable("Member mail is not configured.")
    async with async_session_factory() as db:
        job = await db.scalar(
            select(OutboxJob).where(OutboxJob.job_type == REWARD_READY_EMAIL, OutboxJob.resource_id == resource_id)
        )
        if job is not None and job.attempt_count > 1:
            raise MemberMailUncertain("An earlier attempt may have been submitted.")
        reward = await db.get(StampCardReward, resource_id)
        card = await db.get(StampCard, reward.card_id) if reward is not None else None
        category = await db.get(EmailCategory, REWARD_READY)
        if reward is None or card is None or category is None or reward.handed_out_at is not None:
            raise MemberMailSkipped("There is no reward waiting to be collected.")
        person = await eligible_person(db, card.person_id, category)
        if person is None:
            raise MemberMailSkipped("The recipient is no longer eligible.")
        language = person.preferred_language if person.preferred_language in _COPY else "nl"
        subject, body = _COPY[language]
        label = resolve_text(
            {"nl": reward.reward_label_nl, "fr": reward.reward_label_fr, "en": reward.reward_label_en}, language
        )
        link = unsubscribe_url(person.id, category.key)
        try:
            mail = MemberMail(
                delivery_key=f"reward-ready:{reward.id}",
                category_key=category.key,
                recipient=person.email.strip(),
                sender=settings.member_mail_from,
                subject=subject,
                text=compose_text(body.format(reward=label), None, category, language, link),
                unsubscribe_url=link,
            )
        except ValueError:
            raise MemberMailRejected("The mail could not be built.") from None
    await member_mail.submit(mail)
    return True
