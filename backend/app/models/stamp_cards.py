"""Stamp cards, stamps and rewards."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import _utcnow


class StampCardType(Base):
    __tablename__ = "stamp_card_types"
    __table_args__ = (
        CheckConstraint("box_count > 0", name="ck_stamp_card_type_boxes"),
        CheckConstraint(
            "length(trim(name_nl)) > 0 AND length(trim(reward_label_nl)) > 0", name="ck_stamp_card_type_nl"
        ),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name_nl: Mapped[str] = mapped_column(String(200))
    name_fr: Mapped[str | None] = mapped_column(String(200))
    name_en: Mapped[str | None] = mapped_column(String(200))
    box_count: Mapped[int] = mapped_column(Integer)
    reward_label_nl: Mapped[str] = mapped_column(String(200))
    reward_label_fr: Mapped[str | None] = mapped_column(String(200))
    reward_label_en: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class StampCard(Base):
    __tablename__ = "stamp_cards"
    __table_args__ = (CheckConstraint("box_count > 0", name="ck_stamp_card_boxes"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="RESTRICT"), index=True)
    type_id: Mapped[str] = mapped_column(ForeignKey("stamp_card_types.id", ondelete="RESTRICT"))
    box_count: Mapped[int] = mapped_column(Integer)
    reward_label_nl: Mapped[str] = mapped_column(String(200))
    reward_label_fr: Mapped[str | None] = mapped_column(String(200))
    reward_label_en: Mapped[str | None] = mapped_column(String(200))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Stamp(Base):
    __tablename__ = "stamps"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("stamp_cards.id", ondelete="RESTRICT"), index=True)
    registration_id: Mapped[str] = mapped_column(ForeignKey("registrations.id", ondelete="RESTRICT"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class StampCardReward(Base):
    __tablename__ = "stamp_card_rewards"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("stamp_cards.id", ondelete="RESTRICT"), unique=True)
    reward_label_nl: Mapped[str] = mapped_column(String(200))
    reward_label_fr: Mapped[str | None] = mapped_column(String(200))
    reward_label_en: Mapped[str | None] = mapped_column(String(200))
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    handed_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handed_out_by: Mapped[str | None] = mapped_column(String(200))
