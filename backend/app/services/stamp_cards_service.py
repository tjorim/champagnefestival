"""Transactional stamp cards. Callers own commits for check-in transitions."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import (
    AppSettings,
    Edition,
    Event,
    Person,
    Registration,
    Stamp,
    StampCard,
    StampCardReward,
    StampCardType,
)
from app.schemas import StampCardTypeWrite
from app.services import reward_mail
from app.services.errors import ApiHTTPException

LABELS = ("reward_label_nl", "reward_label_fr", "reward_label_en")


def as_dict(row) -> dict:
    return {column.key: getattr(row, column.key) for column in row.__table__.columns}


async def require_active_type(db: AsyncSession, type_id: str) -> StampCardType:
    row = await db.get(StampCardType, type_id)
    if row is None or not row.active:
        raise ApiHTTPException(409, "stamp_card_type_unavailable", "Select an active stamp card type.")
    return row


async def lock_person(db: AsyncSession, person_id: str) -> None:
    await db.execute(select(Person.id).where(Person.id == person_id).with_for_update())


async def progress(db: AsyncSession, card: StampCard) -> dict:
    count = await db.scalar(select(func.count()).select_from(Stamp).where(Stamp.card_id == card.id))
    return {
        "card_id": card.id,
        "stamps": count,
        "box_count": card.box_count,
        "reward_earned": card.completed_at is not None,
    }


async def sync_check_in(db: AsyncSession, registration: Registration, checked_in: bool) -> dict | None:
    # The registration lock precedes this person lock on both write paths.
    await lock_person(db, registration.person_id)
    stamp = await db.scalar(select(Stamp).where(Stamp.registration_id == registration.id))
    if stamp:
        card = await db.get(StampCard, stamp.card_id)
        assert card is not None
        if checked_in:
            return await progress(db, card)
        reward = await db.scalar(select(StampCardReward).where(StampCardReward.card_id == card.id))
        if reward and reward.handed_out_at:
            raise ApiHTTPException(
                409, "stamp_reward_handed_out", "Undo reward hand-out before unchecking this registration."
            )
        await db.delete(stamp)
        if reward:
            await db.delete(reward)
        await db.flush()
        card.completed_at = None
        await db.flush()
        return await progress(db, card)
    if not checked_in:
        return None
    edition_type = await db.scalar(
        select(Edition.edition_type)
        .join(Event, Event.edition_id == Edition.id)
        .where(Event.id == registration.event_id)
    )
    if edition_type != "capsule_exchange":
        return None
    settings = await db.get(AppSettings, "app_settings")
    card = await db.scalar(
        select(StampCard)
        .where(StampCard.person_id == registration.person_id, StampCard.completed_at.is_(None))
        .order_by(StampCard.opened_at, StampCard.id)
        .limit(1)
    )
    if card is None:
        pending_reward = await db.scalar(
            select(StampCardReward.id)
            .join(StampCard, StampCard.id == StampCardReward.card_id)
            .where(StampCard.person_id == registration.person_id, StampCardReward.handed_out_at.is_(None))
            .limit(1)
        )
        if pending_reward is not None:
            raise ApiHTTPException(
                409, "stamp_reward_pending", "Hand out the current card's reward before opening another card."
            )
        if settings is None or settings.stamp_card_type_id is None:
            raise ApiHTTPException(
                409, "stamp_card_type_not_configured", "Configure a stamp card type before capsule-exchange check-in."
            )
        card_type = await require_active_type(db, settings.stamp_card_type_id)
        card = StampCard(
            id=uuid4().hex,
            person_id=registration.person_id,
            type_id=card_type.id,
            box_count=card_type.box_count,
            **{key: getattr(card_type, key) for key in LABELS},
        )
        db.add(card)
        await db.flush()
    db.add(Stamp(id=uuid4().hex, card_id=card.id, registration_id=registration.id))
    await db.flush()
    result = await progress(db, card)
    if result["stamps"] == card.box_count:
        card.completed_at = datetime.now(UTC)
        reward = StampCardReward(id=uuid4().hex, card_id=card.id, **{key: getattr(card, key) for key in LABELS})
        db.add(reward)
        await db.flush()
        await reward_mail.enqueue_reward_ready(db, reward, card)
        result["reward_earned"] = True
    return result


async def list_types(db: AsyncSession) -> list[dict]:
    return [as_dict(row) for row in (await db.scalars(select(StampCardType).order_by(StampCardType.id))).all()]


async def save_type(db: AsyncSession, *, actor: str, body: StampCardTypeWrite, type_id: str | None = None) -> dict:
    row = await db.get(StampCardType, type_id) if type_id else StampCardType(id=uuid4().hex)
    if row is None:
        raise ApiHTTPException(404, "stamp_card_type_not_found", "Stamp card type not found.")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    db.add(row)
    await write_audit_entry(
        db, actor=actor, action="stamp_card_type_saved", resource_type="stamp_card_type", resource_id=row.id
    )
    await db.commit()
    await db.refresh(row)
    return as_dict(row)


async def list_cards(db: AsyncSession, person_id: str) -> list[dict]:
    result = []
    for card in (
        await db.scalars(
            select(StampCard).where(StampCard.person_id == person_id).order_by(StampCard.opened_at, StampCard.id)
        )
    ).all():
        reward = await db.scalar(select(StampCardReward).where(StampCardReward.card_id == card.id))
        stamps = (
            await db.scalars(select(Stamp).where(Stamp.card_id == card.id).order_by(Stamp.created_at, Stamp.id))
        ).all()
        result.append(
            {
                **as_dict(card),
                "stamps": [as_dict(stamp) for stamp in stamps],
                "reward": as_dict(reward) if reward else None,
            }
        )
    return result


async def set_reward(db: AsyncSession, *, reward_id: str, handed_out: bool, actor: str) -> dict:
    person_id = await db.scalar(
        select(StampCard.person_id)
        .join(StampCardReward, StampCardReward.card_id == StampCard.id)
        .where(StampCardReward.id == reward_id)
    )
    if person_id is None:
        raise ApiHTTPException(404, "stamp_reward_not_found", "Stamp reward not found.")
    await lock_person(db, person_id)
    reward = await db.scalar(
        select(StampCardReward).where(StampCardReward.id == reward_id).execution_options(populate_existing=True)
    )
    if reward is None:
        raise ApiHTTPException(404, "stamp_reward_not_found", "Stamp reward not found.")
    if not handed_out and reward.handed_out_at is not None:
        card = await db.get(StampCard, reward.card_id)
        assert card is not None
        successor = await db.scalar(
            select(StampCard.id).where(StampCard.person_id == person_id, StampCard.opened_at > card.opened_at).limit(1)
        )
        if successor is not None:
            raise ApiHTTPException(
                409, "stamp_card_has_successor", "Cannot undo hand-out after a newer card has opened."
            )
    if handed_out != (reward.handed_out_at is not None):
        reward.handed_out_at = datetime.now(UTC) if handed_out else None
        reward.handed_out_by = actor if handed_out else None
        await write_audit_entry(
            db,
            actor=actor,
            action="stamp_reward_handed_out" if handed_out else "stamp_reward_hand_out_undone",
            resource_type="stamp_card_reward",
            resource_id=reward.id,
        )
    await db.commit()
    await db.refresh(reward)
    return as_dict(reward)


async def guard_registration_history(db: AsyncSession, registration_id: str) -> None:
    if await db.scalar(select(Stamp.id).where(Stamp.registration_id == registration_id)):
        raise ApiHTTPException(
            409, "registration_has_stamp", "Uncheck this registration before deleting or reassigning it."
        )
