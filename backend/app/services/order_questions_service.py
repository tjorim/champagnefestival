"""Event-scoped optional order questions. Priced choices remain products.

Configuration is serialized with checkout under the event lock. Used definitions
are immutable; deactivation hides them from new orders without losing history.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import EventOrderOption, EventOrderQuestion, RegistrationOrderAnswer
from app.schemas import OrderAnswerIn, OrderQuestionList, VolunteerPollAnswerIn
from app.services import product_inventory as inventory
from app.services.errors import ApiHTTPException
from app.services.poll_kinds import KINDS, scalar_answer_fields
from app.services.public_render_cache import notify_render_cache_invalidate


async def configure(
    db: AsyncSession, event_id: str, body: OrderQuestionList, *, actor: str, request_id: str | None
) -> list[dict]:
    event = await inventory.lock_event(db, event_id)
    existing = {q.id: q for q in event.order_questions}
    used = set(
        (
            await db.execute(
                select(RegistrationOrderAnswer.question_id)
                .join(EventOrderQuestion, EventOrderQuestion.id == RegistrationOrderAnswer.question_id)
                .where(EventOrderQuestion.event_id == event_id)
                .distinct()
            )
        ).scalars()
    )
    incoming = {q.id for q in body.questions}
    for position, item in enumerate(body.questions):
        handler = KINDS[item.kind]
        if not handler.has_options and item.options:
            raise ApiHTTPException(422, "poll_answer_invalid", "This kind does not have options.")
        question = existing.get(item.id)
        if question is None:
            if await db.get(EventOrderQuestion, item.id) is not None:
                raise ApiHTTPException(409, "order_question_invalid", "Question ID belongs to another event.")
            question = EventOrderQuestion(
                id=item.id, event_id=event_id, options=[], kind=item.kind, title_nl=item.title_nl
            )
            event.order_questions.append(question)
        if question.id in used:
            old = question.as_dict()
            new = item.model_dump()
            old.pop("active")
            new.pop("active")
            if old != new:
                raise ApiHTTPException(
                    409,
                    "order_question_in_use",
                    "Used question definitions cannot change; deactivate and add a new question.",
                )
        else:
            for option in item.options:
                owned = await db.get(EventOrderOption, option.id)
                if owned is not None and owned.question_id != question.id:
                    raise ApiHTTPException(409, "order_question_invalid", "Option ID belongs to another question.")
            for field in (
                "kind",
                "title_nl",
                "title_fr",
                "title_en",
                "description_nl",
                "description_fr",
                "description_en",
            ):
                setattr(question, field, getattr(item, field))
            question.options.clear()
            await db.flush()
            question.options = [
                EventOrderOption(
                    id=o.id,
                    question_id=question.id,
                    label_nl=o.label_nl,
                    label_fr=o.label_fr,
                    label_en=o.label_en,
                    sort_order=index,
                )
                for index, o in enumerate(item.options)
            ]
        question.active = item.active
        question.sort_order = position
    for question_id, question in existing.items():
        if question_id not in incoming:
            if question_id in used:
                question.active = False
            else:
                await db.delete(question)
    await write_audit_entry(
        db,
        actor=actor,
        action="order_questions_set",
        resource_type="event",
        resource_id=event_id,
        request_id=request_id,
        details={"question_count": len(body.questions)},
    )
    await notify_render_cache_invalidate(db)
    await db.commit()
    await db.refresh(event, ["order_questions"])
    return [q.as_dict() for q in event.order_questions]


async def validate_answers(
    db: AsyncSession, event_id: str, answers: list[OrderAnswerIn] | None, *, admin: bool = False
) -> list[RegistrationOrderAnswer]:
    ids = [a.question_id for a in answers or []]
    if len(ids) != len(set(ids)):
        raise ApiHTTPException(422, "poll_answer_invalid", "Each question can appear only once.")
    questions = {
        q.id: q
        for q in (await db.execute(select(EventOrderQuestion).where(EventOrderQuestion.event_id == event_id))).scalars()
    }
    rows = []
    for answer in answers or []:
        question = questions.get(answer.question_id)
        if question is None or (not admin and not question.active):
            raise ApiHTTPException(422, "order_question_unavailable", "The question is not available for this event.")
        body = VolunteerPollAnswerIn.model_validate(answer.model_dump(exclude={"question_id"}, exclude_unset=True))
        fields = scalar_answer_fields(question.kind, body)
        if all(value is None for value in fields.values()):
            continue
        if KINDS[question.kind].has_options and fields.get("option_id") not in {o.id for o in question.options}:
            raise ApiHTTPException(422, "poll_option_not_found", "The option is not part of this question.")
        rows.append(RegistrationOrderAnswer(question_id=question.id, kind=question.kind, question=question, **fields))
    return rows
