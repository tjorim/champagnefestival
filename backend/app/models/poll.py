"""The volunteer poll: questions, options and answers."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.translations import resolve_text
from app.core.vocabularies import PollQuestionKind
from app.db.base import Base
from app.models.base import _optional_dutch_check, _utcnow
from app.models.vocabulary import vocabulary_check

"""Attendance, meal quantities, one configured choice, free text and fixed 1–5 ratings."""


MAX_POLL_PEOPLE = 10
"""The most people one "yes" can stand for (the volunteer plus guests)."""


class EditionPollQuestion(Base):
    """One question put to the volunteers of an edition.

    ``yes_no`` asks whether they join something and with how many people
    (`VolunteerPollAnswer`); ``meals`` offers `EditionPollOption`s of which they pick a quantity each
    (`VolunteerPollSelection`). Every question has its own translated title (Dutch required), an
    optional description, a place in the list and an optional closing time after which volunteers can
    no longer change their answer.
    """

    __tablename__ = "edition_poll_questions"
    __table_args__ = (
        CheckConstraint("event_id IS NULL OR kind = 'yes_no'", name="ck_poll_event_attendance"),
        vocabulary_check("ck_edition_poll_questions_kind", "kind", PollQuestionKind),
        CheckConstraint("(length(trim(title_nl)) > 0) IS TRUE", name="ck_edition_poll_questions_title_nl"),
        CheckConstraint(_optional_dutch_check("description"), name="ck_edition_poll_questions_description_nl"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("events.id", ondelete="RESTRICT"), unique=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    title_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description_nl: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_fr: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    """When volunteers can no longer change their answer, or ``None`` while it stays open."""
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    def localized_title(self, locale: str | None) -> str:
        return resolve_text({"nl": self.title_nl, "fr": self.title_fr, "en": self.title_en}, locale)

    def localized_description(self, locale: str | None) -> str:
        return resolve_text({"nl": self.description_nl, "fr": self.description_fr, "en": self.description_en}, locale)


class EditionPollOption(Base):
    """An option offered to volunteers for a meals or single-choice question.
    The choices are catering-dependent and change every edition, so they are
    admin-configured content rather than a fixed list, mirroring how `Product`
    holds one event's orderable items. It belongs to an option-bearing question
    (`EditionPollQuestion`); a volunteer simply picks how many of each they want
    (`VolunteerPollSelection.quantity`).

    The label is translated like other content (Dutch required, French and English
    optional), so volunteers see it in their own language. `dietary_tags` flags what
    the dish suits or contains; the admin orders the list with `sort_order`.
    """

    __tablename__ = "edition_poll_options"
    __table_args__ = (
        CheckConstraint("(length(trim(label_nl)) > 0) IS TRUE", name="ck_edition_poll_options_label_nl"),
        UniqueConstraint("id", "question_id", name="uq_poll_option_question"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    """The question this option belongs to; ``edition_id`` is that question's edition."""
    label_nl: Mapped[str] = mapped_column(String(200), nullable=False)
    label_fr: Mapped[str | None] = mapped_column(String(200), nullable=True)
    label_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    """Shown to volunteers only (never public)."""
    dietary_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Values from ``app.schemas.DietaryTag``, e.g. ``["vegetarian", "gluten_free"]``."""
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    @property
    def label(self) -> str:
        """The Dutch label: what admin lists and audit entries show."""
        return self.label_nl

    def localized_label(self, locale: str | None) -> str:
        return resolve_text({"nl": self.label_nl, "fr": self.label_fr, "en": self.label_en}, locale)


MAX_POLL_QUANTITY = 20
"""The most of one option a single volunteer can ask for."""


class VolunteerPollSelection(Base):
    """How many of one `EditionPollOption` a volunteer wants. A row exists only
    for a quantity of at least one; choosing none deletes the row."""

    __tablename__ = "volunteer_poll_selections"
    __table_args__ = (
        CheckConstraint(f"quantity BETWEEN 1 AND {MAX_POLL_QUANTITY}", name="ck_volunteer_poll_selections_quantity"),
    )

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    option_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_options.id", ondelete="CASCADE"), primary_key=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class VolunteerPollAnswer(Base):
    """A volunteer's answer to a ``yes_no`` `EditionPollQuestion`: whether they join and, when they do,
    with how many people (themselves included). No row means not answered yet."""

    __tablename__ = "volunteer_poll_answers"
    __table_args__ = (
        CheckConstraint(
            f"(attending AND people BETWEEN 1 AND {MAX_POLL_PEOPLE}) OR (NOT attending AND people = 0)",
            name="ck_volunteer_poll_answers_people",
        ),
    )

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    attending: Mapped[bool] = mapped_column(Boolean, nullable=False)
    people: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class VolunteerPollChoice(Base):
    """One typed answer per volunteer and question; absence means unanswered."""

    __tablename__ = "volunteer_poll_choices"
    __table_args__ = (
        ForeignKeyConstraint(
            ["option_id", "question_id"],
            ["edition_poll_options.id", "edition_poll_options.question_id"],
            ondelete="CASCADE",
        ),
    )

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    option_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)


class VolunteerPollText(Base):
    """One typed answer per volunteer and question; absence means unanswered."""

    __tablename__ = "volunteer_poll_texts"
    __table_args__ = (CheckConstraint("length(trim(text)) BETWEEN 1 AND 500", name="ck_poll_texts_value"),)

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    text: Mapped[str] = mapped_column(String(500), nullable=False)


class VolunteerPollRating(Base):
    """One typed answer per volunteer and question; absence means unanswered."""

    __tablename__ = "volunteer_poll_ratings"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="ck_poll_ratings_value"),)

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("edition_poll_questions.id", ondelete="CASCADE"), primary_key=True
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)


class VolunteerMealNote(Base):
    """A volunteer's free-text dietary note (allergies, preferences) for one edition's ``meals`` questions."""

    __tablename__ = "volunteer_meal_notes"

    volunteer_id: Mapped[str] = mapped_column(String(64), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    edition_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("editions.id", ondelete="CASCADE"), primary_key=True
    )
    note: Mapped[str] = mapped_column(String(500), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class PollDeletionNotification(Base):
    """Immutable email snapshot; survives deletion of the question and its answers."""

    __tablename__ = "poll_deletion_notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    recipient: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
