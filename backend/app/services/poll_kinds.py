"""What differs between the kinds of volunteer poll question.

``poll_questions_service`` handles everything a question has in common (texts, order, closing, copying, the
audit trail, who answered what). Each kind is a ``PollKind`` here that knows how its answers are stored, counted,
validated and shown, so the service never branches on the kind. To add a kind: subclass ``PollKind``, register
it in ``KINDS``, and extend ``POLL_QUESTION_KINDS`` (and its check constraint) and ``PollQuestionKind``.

An answer is one value per volunteer and question: a ``{option_id: quantity}`` mapping for ``meals`` and an
``(attending, people)`` tuple for ``yes_no``. A question a volunteer did not answer has no entry.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import ValidationError
from sqlalchemy import Integer, cast, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    EditionPollOption,
    EditionPollQuestion,
    VolunteerPollAnswer,
    VolunteerPollSelection,
)
from app.schemas import AdminPollOrderIn, PollAttendanceItem, VolunteerPollAnswerIn
from app.services.errors import ApiHTTPException

Answer = Any


class PollKind(ABC):
    name: ClassVar[str]
    has_options: ClassVar[bool] = False
    """Whether admins give the question options (``poll_options_service`` only accepts those questions)."""
    has_note: ClassVar[bool] = False
    """Whether the volunteer's dietary note belongs to this kind (it stays editable while one is open)."""

    @abstractmethod
    async def answered_count(self, db: AsyncSession, question: EditionPollQuestion) -> int:
        """How many volunteers answered the question."""

    @abstractmethod
    async def stats(self, db: AsyncSession, edition_id: str) -> dict[str, dict[str, int]]:
        """Per question of this kind in the edition: ``answered_count`` plus the counts the kind adds."""

    @abstractmethod
    async def load_answers(
        self, db: AsyncSession, edition_id: str, volunteer_ids: list[str] | None
    ) -> dict[str, dict[str, Answer]]:
        """``{volunteer_id: {question_id: answer}}`` for the edition, optionally for some volunteers only."""

    @abstractmethod
    async def replace_answer(
        self, db: AsyncSession, volunteer_id: str, question: EditionPollQuestion, answer: Answer | None
    ) -> None:
        """Make ``answer`` the volunteer's only answer to the question; ``None`` or an empty answer clears it."""

    @abstractmethod
    async def delete_question_data(self, db: AsyncSession, question: EditionPollQuestion) -> None:
        """Delete everything the kind stores for the question (answers, and options for a kind that has them)."""

    @abstractmethod
    async def volunteer_answer(
        self, db: AsyncSession, question: EditionPollQuestion, body: VolunteerPollAnswerIn
    ) -> Answer:
        """The answer a volunteer's own request stands for; raises ``ApiHTTPException`` when it does not fit."""

    @abstractmethod
    def admin_answers(
        self,
        body: AdminPollOrderIn,
        questions: dict[str, EditionPollQuestion],
        option_question: dict[str, str],
    ) -> dict[str, Answer]:
        """The answers an admin entry stands for, by question; raises when it names things outside the edition."""

    @abstractmethod
    def audit_details(self, answer: Answer) -> dict[str, Any]:
        """What the audit entry of a volunteer's own save records about the answer."""

    @abstractmethod
    def row_defaults(self) -> dict[str, Any]:
        """The (empty) fields this kind contributes to a volunteer's row in the admin overview."""

    @abstractmethod
    def add_to_row(
        self, row: dict[str, Any], question: EditionPollQuestion, answer: Answer, order: dict[str, int]
    ) -> None:
        """Add an answer to the volunteer's overview row; ``order`` ranks the edition's options for display."""

    @abstractmethod
    def view_fields(self, answer: Answer | None, options: list[EditionPollOption]) -> dict[str, Any]:
        """The answer fields of a volunteer's own view of the question (``options`` are the question's, in order)."""


class MealsKind(PollKind):
    """Choose your meals: a quantity of each option, in any mix."""

    name = "meals"
    has_options = True
    has_note = True

    async def answered_count(self, db: AsyncSession, question: EditionPollQuestion) -> int:
        stmt = (
            select(func.count(func.distinct(VolunteerPollSelection.volunteer_id)))
            .join(EditionPollOption, EditionPollOption.id == VolunteerPollSelection.option_id)
            .where(EditionPollOption.question_id == question.id)
        )
        return int((await db.execute(stmt)).scalar_one())

    async def stats(self, db: AsyncSession, edition_id: str) -> dict[str, dict[str, int]]:
        rows = await db.execute(
            select(EditionPollOption.question_id, func.count(func.distinct(VolunteerPollSelection.volunteer_id)))
            .join(VolunteerPollSelection, VolunteerPollSelection.option_id == EditionPollOption.id)
            .where(EditionPollOption.edition_id == edition_id)
            .group_by(EditionPollOption.question_id)
        )
        return {question_id: {"answered_count": int(answered)} for question_id, answered in rows.all()}

    async def load_answers(
        self, db: AsyncSession, edition_id: str, volunteer_ids: list[str] | None
    ) -> dict[str, dict[str, Answer]]:
        stmt = (
            select(
                VolunteerPollSelection.volunteer_id,
                EditionPollOption.question_id,
                VolunteerPollSelection.option_id,
                VolunteerPollSelection.quantity,
            )
            .join(EditionPollOption, EditionPollOption.id == VolunteerPollSelection.option_id)
            .where(EditionPollOption.edition_id == edition_id)
        )
        if volunteer_ids is not None:
            stmt = stmt.where(VolunteerPollSelection.volunteer_id.in_(volunteer_ids))
        answers: dict[str, dict[str, Answer]] = {}
        for volunteer_id, question_id, option_id, quantity in (await db.execute(stmt)).all():
            answers.setdefault(volunteer_id, {}).setdefault(question_id, {})[option_id] = quantity
        return answers

    async def replace_answer(
        self, db: AsyncSession, volunteer_id: str, question: EditionPollQuestion, answer: Answer | None
    ) -> None:
        option_ids = set(await self._option_ids(db, question))
        await db.execute(
            delete(VolunteerPollSelection).where(
                VolunteerPollSelection.volunteer_id == volunteer_id,
                VolunteerPollSelection.option_id.in_(option_ids or {""}),
            )
        )
        for option_id, quantity in (answer or {}).items():
            db.add(VolunteerPollSelection(volunteer_id=volunteer_id, option_id=option_id, quantity=quantity))

    async def delete_question_data(self, db: AsyncSession, question: EditionPollQuestion) -> None:
        option_ids = select(EditionPollOption.id).where(EditionPollOption.question_id == question.id)
        await db.execute(delete(VolunteerPollSelection).where(VolunteerPollSelection.option_id.in_(option_ids)))
        await db.execute(delete(EditionPollOption).where(EditionPollOption.question_id == question.id))

    async def volunteer_answer(
        self, db: AsyncSession, question: EditionPollQuestion, body: VolunteerPollAnswerIn
    ) -> Answer:
        if body.selections is None or body.attending is not None or body.people is not None:
            raise ApiHTTPException(422, "poll_answer_invalid", "A meals question is answered with selections.")
        if not {selection.option_id for selection in body.selections} <= set(await self._option_ids(db, question)):
            raise ApiHTTPException(
                404, "poll_option_not_found", "One or more poll options are not part of this question."
            )
        return {selection.option_id: selection.quantity for selection in body.selections}

    def admin_answers(
        self,
        body: AdminPollOrderIn,
        questions: dict[str, EditionPollQuestion],
        option_question: dict[str, str],
    ) -> dict[str, Answer]:
        if not {selection.option_id for selection in body.selections} <= set(option_question):
            raise ApiHTTPException(
                404, "poll_option_not_found", "One or more poll options are not part of this edition."
            )
        answers: dict[str, Answer] = {}
        for selection in body.selections:
            answers.setdefault(option_question[selection.option_id], {})[selection.option_id] = selection.quantity
        return answers

    def audit_details(self, answer: Answer) -> dict[str, Any]:
        return {"kind": self.name, "option_count": len(answer), "total_quantity": sum(answer.values())}

    def row_defaults(self) -> dict[str, Any]:
        return {"selections": []}

    def add_to_row(
        self, row: dict[str, Any], question: EditionPollQuestion, answer: Answer, order: dict[str, int]
    ) -> None:
        row["selections"].extend(
            {"option_id": option_id, "quantity": answer[option_id]}
            for option_id in sorted(answer, key=order.__getitem__)
        )

    def view_fields(self, answer: Answer | None, options: list[EditionPollOption]) -> dict[str, Any]:
        picks = answer or {}
        return {"selections": [{"option_id": o.id, "quantity": picks[o.id]} for o in options if o.id in picks]}

    @staticmethod
    async def _option_ids(db: AsyncSession, question: EditionPollQuestion) -> list[str]:
        return list(
            (await db.execute(select(EditionPollOption.id).where(EditionPollOption.question_id == question.id)))
            .scalars()
            .all()
        )


class YesNoKind(PollKind):
    """Will you join: yes (with how many people, the volunteer included) or no."""

    name = "yes_no"

    async def answered_count(self, db: AsyncSession, question: EditionPollQuestion) -> int:
        stmt = (
            select(func.count()).select_from(VolunteerPollAnswer).where(VolunteerPollAnswer.question_id == question.id)
        )
        return int((await db.execute(stmt)).scalar_one())

    async def stats(self, db: AsyncSession, edition_id: str) -> dict[str, dict[str, int]]:
        rows = await db.execute(
            select(
                VolunteerPollAnswer.question_id,
                func.count(),
                func.coalesce(func.sum(cast(VolunteerPollAnswer.attending, Integer)), 0),
                func.coalesce(func.sum(VolunteerPollAnswer.people), 0),
            )
            .join(EditionPollQuestion, EditionPollQuestion.id == VolunteerPollAnswer.question_id)
            .where(EditionPollQuestion.edition_id == edition_id)
            .group_by(VolunteerPollAnswer.question_id)
        )
        return {
            question_id: {
                "answered_count": int(answered),
                "yes_count": int(yes),
                "no_count": int(answered) - int(yes),
                "people_total": int(people),
            }
            for question_id, answered, yes, people in rows.all()
        }

    async def load_answers(
        self, db: AsyncSession, edition_id: str, volunteer_ids: list[str] | None
    ) -> dict[str, dict[str, Answer]]:
        stmt = (
            select(
                VolunteerPollAnswer.volunteer_id,
                VolunteerPollAnswer.question_id,
                VolunteerPollAnswer.attending,
                VolunteerPollAnswer.people,
            )
            .join(EditionPollQuestion, EditionPollQuestion.id == VolunteerPollAnswer.question_id)
            .where(EditionPollQuestion.edition_id == edition_id)
        )
        if volunteer_ids is not None:
            stmt = stmt.where(VolunteerPollAnswer.volunteer_id.in_(volunteer_ids))
        answers: dict[str, dict[str, Answer]] = {}
        for volunteer_id, question_id, attending, people in (await db.execute(stmt)).all():
            answers.setdefault(volunteer_id, {})[question_id] = (attending, people)
        return answers

    async def replace_answer(
        self, db: AsyncSession, volunteer_id: str, question: EditionPollQuestion, answer: Answer | None
    ) -> None:
        await db.execute(
            delete(VolunteerPollAnswer).where(
                VolunteerPollAnswer.volunteer_id == volunteer_id, VolunteerPollAnswer.question_id == question.id
            )
        )
        if answer is not None:
            attending, people = answer
            db.add(
                VolunteerPollAnswer(
                    volunteer_id=volunteer_id, question_id=question.id, attending=attending, people=people
                )
            )

    async def delete_question_data(self, db: AsyncSession, question: EditionPollQuestion) -> None:
        await db.execute(delete(VolunteerPollAnswer).where(VolunteerPollAnswer.question_id == question.id))

    async def volunteer_answer(
        self, db: AsyncSession, question: EditionPollQuestion, body: VolunteerPollAnswerIn
    ) -> Answer:
        if body.attending is None or body.selections is not None:
            raise ApiHTTPException(422, "poll_answer_invalid", "A yes/no question is answered with attending.")
        try:
            item = PollAttendanceItem(
                question_id=question.id,
                attending=body.attending,
                people=1 if body.people is None and body.attending else (body.people or 0),
            )
        except ValidationError as exc:
            raise ApiHTTPException(422, "poll_answer_invalid", "A yes needs between 1 and 10 people.") from exc
        return (item.attending, item.people)

    def admin_answers(
        self,
        body: AdminPollOrderIn,
        questions: dict[str, EditionPollQuestion],
        option_question: dict[str, str],
    ) -> dict[str, Answer]:
        for item in body.attendance:
            question = questions.get(item.question_id)
            if question is None or question.kind != self.name:
                raise ApiHTTPException(
                    404, "poll_question_not_found", "One or more yes/no questions are not part of this edition."
                )
        return {item.question_id: (item.attending, item.people) for item in body.attendance}

    def audit_details(self, answer: Answer) -> dict[str, Any]:
        attending, people = answer
        return {"kind": self.name, "attending": attending, "people": people}

    def row_defaults(self) -> dict[str, Any]:
        return {"attendance": []}

    def add_to_row(
        self, row: dict[str, Any], question: EditionPollQuestion, answer: Answer, order: dict[str, int]
    ) -> None:
        attending, people = answer
        row["attendance"].append({"question_id": question.id, "attending": attending, "people": people})

    def view_fields(self, answer: Answer | None, options: list[EditionPollOption]) -> dict[str, Any]:
        return {"attending": answer[0], "people": answer[1]} if answer else {}


KINDS: dict[str, PollKind] = {kind.name: kind for kind in (YesNoKind(), MealsKind())}


def kind_of(question: EditionPollQuestion) -> PollKind:
    return KINDS[question.kind]
