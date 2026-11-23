"""Per-event order questions, their options and the answers stored with a registration."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.vocabularies import OrderQuestionKind
from app.db.base import Base
from app.models.base import _optional_dutch_check
from app.models.vocabulary import vocabulary_check

if TYPE_CHECKING:
    from app.schemas import OrderAnswerOut, OrderQuestionOut


class EventOrderQuestion(Base):
    """Optional information collected once per visitor order, separately from priced products."""

    __tablename__ = "event_order_questions"
    __table_args__ = (
        vocabulary_check("ck_order_question_kind", "kind", OrderQuestionKind),
        CheckConstraint("length(trim(title_nl)) > 0", name="ck_order_question_title"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_order_question_description"),
        UniqueConstraint("id", "kind", name="uq_order_question_kind"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(64), ForeignKey("events.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    options: Mapped[list[EventOrderOption]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="EventOrderOption.sort_order, EventOrderOption.id"
    )

    def to_out(self) -> OrderQuestionOut:
        from app.schemas import OrderQuestionOut

        return OrderQuestionOut.model_validate(self, from_attributes=True)

    def as_dict(self) -> dict:
        return self.to_out().model_dump()


class EventOrderOption(Base):
    __tablename__ = "event_order_options"
    __table_args__ = (
        UniqueConstraint("id", "question_id", name="uq_order_option_question"),
        CheckConstraint("length(trim(label_nl)) > 0", name="ck_order_option_label"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("event_order_questions.id", ondelete="CASCADE"), index=True
    )
    label_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    label_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    label_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RegistrationOrderAnswer(Base):
    __tablename__ = "registration_order_answers"
    __table_args__ = (
        ForeignKeyConstraint(
            ["question_id", "kind"], ["event_order_questions.id", "event_order_questions.kind"], ondelete="RESTRICT"
        ),
        ForeignKeyConstraint(
            ["option_id", "question_id"],
            ["event_order_options.id", "event_order_options.question_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "(kind = 'single_choice' AND option_id IS NOT NULL AND text IS NULL AND rating IS NULL) OR (kind = 'free_text' AND option_id IS NULL AND text IS NOT NULL AND length(trim(text)) BETWEEN 1 AND 500 AND rating IS NULL) OR (kind = 'rating' AND option_id IS NULL AND text IS NULL AND rating IS NOT NULL AND rating BETWEEN 1 AND 5)",
            name="ck_order_answer_value",
        ),
    )
    registration_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("registrations.id", ondelete="CASCADE"), primary_key=True
    )
    question_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    option_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    question: Mapped[EventOrderQuestion] = relationship(foreign_keys=[question_id, kind], lazy="joined")

    def to_out(self) -> OrderAnswerOut:
        from app.schemas import OrderAnswerOut

        return OrderAnswerOut.model_validate(self, from_attributes=True)

    def as_dict(self) -> dict:
        return self.to_out().model_dump()
