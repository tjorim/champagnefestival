"""The volunteer poll: questions, options, answers and the orders derived from it."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from app.models import MAX_POLL_PEOPLE, MAX_POLL_QUANTITY
from app.schemas.base import RequestModel, ResponseModel
from app.schemas.types import ResourceId, ResourceKey, Text200, Text500


class PollQuestionTexts(RequestModel):
    """A poll question's title and description per language: Dutch is required for the title (and for the
    description once it has any text), French and English are optional translations, and volunteers fall
    back to Dutch. A blank text is stored as `None`."""

    title_nl: Text200 | None = None
    title_fr: Text200 | None = None
    title_en: Text200 | None = None
    description_nl: Text500 | None = None
    description_fr: Text500 | None = None
    description_en: Text500 | None = None

    @field_validator(
        "title_nl", "title_fr", "title_en", "description_nl", "description_fr", "description_en", mode="before"
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.title_nl:
            raise ValueError("A poll question requires a non-empty Dutch title.")
        if any((self.description_fr, self.description_en)) and not self.description_nl:
            raise ValueError("A description requires non-empty Dutch text.")
        return self


class PollOptionLabels(RequestModel):
    """A poll option's label per language: Dutch is required, French and English are optional
    translations, and volunteers fall back to Dutch. A blank text is stored as `None`."""

    label_nl: Text200 | None = None
    label_fr: Text200 | None = None
    label_en: Text200 | None = None

    @field_validator("label_nl", "label_fr", "label_en", mode="before")
    @classmethod
    def normalize_label(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    def validate_dutch(self) -> Self:
        if not self.label_nl:
            raise ValueError("A poll option requires a non-empty Dutch label.")
        return self


DietaryTag = Literal["vegetarian", "vegan", "gluten_free", "lactose_free", "contains_nuts"]
"""What a meal suits or contains; the labels are translated in the admin UI and the volunteer page."""


PollQuestionKind = Literal["yes_no", "meals", "single_choice", "free_text", "rating"]
"""Attendance, meal quantities, one configured choice, free text, or a fixed 1–5 rating."""


def _timezone_required(value: datetime | None) -> datetime | None:
    if value and value.utcoffset() is None:
        raise ValueError("closes_at must include a timezone")
    return value


class PollQuestionCreate(PollQuestionTexts):
    event_id: ResourceId | None = None
    edition_id: ResourceKey
    kind: PollQuestionKind
    closes_at: datetime | None = None

    _closes_at_timezone = field_validator("closes_at")(_timezone_required)

    @model_validator(mode="after")
    def check_texts(self) -> Self:
        return self.validate_dutch()


class PollQuestionUpdate(PollQuestionTexts):
    event_id: ResourceId | None = None
    """Partial update: an empty string clears a translation; `closes_at` sets the closing time (a past time
    closes the question now) and an explicit `null` reopens it. The kind cannot change."""

    closes_at: datetime | None = None

    _closes_at_timezone = field_validator("closes_at")(_timezone_required)


class PollQuestionReorder(RequestModel):
    """Every question of an edition, in the order volunteers should see them."""

    edition_id: ResourceKey
    ordered_ids: list[str] = Field(min_length=1, max_length=100)


class PollQuestionCopy(RequestModel):
    """Copy the questions (and their options) of one edition into another; a question whose kind and Dutch
    title already exist there is skipped."""

    from_edition_id: ResourceKey
    to_edition_id: ResourceKey

    @model_validator(mode="after")
    def different_editions(self) -> Self:
        if self.from_edition_id == self.to_edition_id:
            raise ValueError("Choose a different edition to copy from.")
        return self


def _unique_dietary_tags(value: list[DietaryTag] | None) -> list[DietaryTag] | None:
    if value is not None and len(set(value)) != len(value):
        raise ValueError("dietary_tags must not contain duplicates")
    return value


class PollOptionCreate(PollOptionLabels):
    question_id: ResourceId
    dietary_tags: list[DietaryTag] = Field(default_factory=list, max_length=10)

    _unique_tags = field_validator("dietary_tags")(_unique_dietary_tags)

    @model_validator(mode="after")
    def check_label(self) -> Self:
        return self.validate_dutch()


class PollOptionUpdate(PollOptionLabels):
    """Partial update: an empty string clears a translation; `dietary_tags` replaces the whole list."""

    dietary_tags: list[DietaryTag] | None = Field(default=None, max_length=10)

    _unique_tags = field_validator("dietary_tags")(_unique_dietary_tags)


class PollOptionReorder(RequestModel):
    """Every option of an option-bearing question, in the order volunteers should see them."""

    question_id: ResourceId
    ordered_ids: list[str] = Field(min_length=1, max_length=200)


class PollOptionOut(ResponseModel):
    """An option as the admin sees it, with how much volunteers asked for in total."""

    id: str
    question_id: str
    edition_id: str
    label: str
    """Resolved for the requested `locale` (Dutch when none)."""
    label_nl: str
    label_fr: str | None = None
    label_en: str | None = None
    dietary_tags: list[DietaryTag] = Field(default_factory=list)
    sort_order: int = 0
    total_quantity: int = 0
    """Sum of every volunteer's quantity — what to order from the caterer."""
    volunteer_count: int = 0
    created_at: datetime
    updated_at: datetime


class PollQuestionOut(ResponseModel):
    event_id: str | None = None
    """A question as the admin sees it: every translation, the closing state, its options (meals/single choice) and what
    volunteers answered so far."""

    id: str
    edition_id: str
    kind: PollQuestionKind
    title: str
    """Resolved for the requested `locale` (Dutch when none)."""
    title_nl: str
    title_fr: str | None = None
    title_en: str | None = None
    description: str = ""
    description_nl: str | None = None
    description_fr: str | None = None
    description_en: str | None = None
    sort_order: int = 0
    closes_at: datetime | None = None
    closed: bool = False
    options: list[PollOptionOut] = Field(default_factory=list)
    answered_count: int = 0
    """Volunteers who answered: a pick for a meals question, a yes or no for a yes/no question."""
    yes_count: int = 0
    no_count: int = 0
    people_total: int = 0
    """The number of people the "yes" answers stand for (yes/no questions)."""
    created_at: datetime
    updated_at: datetime


class PollSelectionItem(RequestModel):
    option_id: ResourceId
    quantity: int = Field(ge=1, le=MAX_POLL_QUANTITY)


class PollAttendanceItem(RequestModel):
    """One volunteer's answer to a yes/no question: `people` counts everyone a "yes" stands for
    (the volunteer included) and is 0 for a "no"."""

    question_id: ResourceId
    attending: bool
    people: int = Field(default=1, ge=0, le=MAX_POLL_PEOPLE)

    @model_validator(mode="after")
    def people_match_the_answer(self) -> Self:
        if self.attending and self.people < 1:
            raise ValueError("A yes needs at least one person.")
        if not self.attending:
            self.people = 0
        return self


class PollChoiceItem(RequestModel):
    question_id: ResourceId
    option_id: ResourceId


class PollTextItem(RequestModel):
    question_id: ResourceId
    text: Text500

    @field_validator("text")
    @classmethod
    def nonempty_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text must not be blank.")
        return value.strip()


class PollRatingItem(RequestModel):
    question_id: ResourceId
    rating: int = Field(ge=1, le=5, strict=True)


class PollOrderOptionOut(ResponseModel):
    id: str
    label: str
    dietary_tags: list[DietaryTag] = Field(default_factory=list)


class PollOrderQuestionOut(ResponseModel):
    id: str
    kind: PollQuestionKind
    title: str
    closed: bool = False
    options: list[PollOrderOptionOut] = Field(default_factory=list)
    answered_count: int = 0
    yes_count: int = 0
    no_count: int = 0
    people_total: int = 0


class PollVolunteerOrderOut(ResponseModel):
    volunteer_id: str
    name: str
    note: str | None
    answered_question_ids: list[str]
    selections: list[PollSelectionItem]
    attendance: list[PollAttendanceItem]
    choices: list[PollChoiceItem] = Field(default_factory=list)
    texts: list[PollTextItem] = Field(default_factory=list)
    ratings: list[PollRatingItem] = Field(default_factory=list)


class PollOrdersOut(ResponseModel):
    """Who answered what: every active volunteer (also those who have not answered yet) and anyone else
    holding an answer, next to the questions in display order."""

    edition_id: str
    questions: list[PollOrderQuestionOut]
    volunteers: list[PollVolunteerOrderOut]
    volunteer_count: int


class AdminPollOrderIn(RequestModel):
    """An admin entering or correcting a volunteer's answers (for example from an email): a full replace of
    their meal picks (`selections`), yes/no answers (`attendance`), `choices`, `texts` and `ratings` for the edition.
    `note` omitted keeps their dietary note, an empty string clears it. `confirm_closed` must be true when
    the change touches a question that has closed."""

    selections: list[PollSelectionItem] = Field(default_factory=list, max_length=100)
    attendance: list[PollAttendanceItem] = Field(default_factory=list, max_length=100)
    choices: list[PollChoiceItem] = Field(default_factory=list, max_length=100)
    texts: list[PollTextItem] = Field(default_factory=list, max_length=100)
    ratings: list[PollRatingItem] = Field(default_factory=list, max_length=100)
    note: Text500 | None = None
    confirm_closed: bool = False

    @model_validator(mode="after")
    def reject_duplicates(self) -> Self:
        option_ids = [selection.option_id for selection in self.selections]
        question_ids = [
            item.question_id for items in (self.attendance, self.choices, self.texts, self.ratings) for item in items
        ]
        if len(option_ids) != len(set(option_ids)) or len(question_ids) != len(set(question_ids)):
            raise ValueError("Each option and each question can be listed only once.")
        return self


class VolunteerPollAnswerIn(RequestModel):
    """A volunteer's answer to one question: `selections` (quantity per option, replacing their picks for
    that question) for meals, `attending` (and `people`, default 1) for yes/no, `option_id` for single choice,
    `text` (at most 500 characters) for free text, or `rating` (integer 1–5). Explicit null clears a scalar answer."""

    option_id: ResourceId | None = None
    text: Text500 | None = None
    rating: int | None = Field(default=None, ge=1, le=5, strict=True)
    selections: list[PollSelectionItem] | None = Field(default=None, max_length=100)
    attending: bool | None = None
    people: int | None = Field(default=None, ge=0, le=MAX_POLL_PEOPLE)

    @model_validator(mode="after")
    def reject_duplicate_options(self) -> Self:
        ids = [selection.option_id for selection in self.selections or []]
        if len(ids) != len(set(ids)):
            raise ValueError("Each option can be listed only once.")
        return self


class VolunteerPollNoteIn(RequestModel):
    """The volunteer's dietary note for the edition's meals; an empty string clears it."""

    note: Text500


class VolunteerPollOptionOut(ResponseModel):
    id: str
    label: str
    """Resolved for the requested `locale` (Dutch when that language has no label)."""
    dietary_tags: list[DietaryTag] = Field(default_factory=list)


class VolunteerPollQuestionOut(ResponseModel):
    event_id: str | None = None
    id: str
    kind: PollQuestionKind
    title: str
    description: str = ""
    closes_at: datetime | None = None
    closed: bool = False
    options: list[VolunteerPollOptionOut] = Field(default_factory=list)
    selections: list[PollSelectionItem] = Field(default_factory=list)
    attending: bool | None = None
    """The answer to a yes/no question; `None` while unanswered."""
    people: int = 0
    option_id: str | None = None
    text: str | None = None
    rating: int | None = None


class VolunteerPollOut(ResponseModel):
    """What a volunteer sees: the active festival edition's questions (empty if none) with their own
    answers, and their dietary note."""

    edition_id: str | None
    questions: list[VolunteerPollQuestionOut]
    note: str | None = None
