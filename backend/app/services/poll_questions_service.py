"""The volunteer poll: questions per edition, who answered what, admin entry and the volunteer's own answers.

Questions support attendance, meals, single choice, free text and ratings. Each has its own optional closing time.
Everything specific to a kind lives in ``app.services.poll_kinds``; this module never branches on it.

Used by ``app.routers.poll_questions`` and ``app.routers.volunteer_self`` (REST) and
``app.mcp.admin.poll`` (MCP). Raises ``HTTPException`` directly; the MCP adapter translates it
into ``MCPToolError`` at its own boundary (``app.mcp.utils.as_value_error``).
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import EditionPollOption, EditionPollQuestion, Person, Registration, VolunteerMealNote
from app.schemas import (
    AdminPollOrderIn,
    PollQuestionCopy,
    PollQuestionCreate,
    PollQuestionReorder,
    PollQuestionTexts,
    PollQuestionUpdate,
    VolunteerPollAnswerIn,
)
from app.services import poll_event_registrations, poll_options_service
from app.services.editions_service import find_active_edition
from app.services.errors import ApiHTTPException
from app.services.events_service import ensure_edition_exists
from app.services.people_listing import role_active
from app.services.poll_common import (
    OPTION_ORDER,
    QUESTION_ORDER,
    ensure_open,
    get_question_or_404,
    is_closed,
    lock_edition,
)
from app.services.poll_kinds import KINDS, kind_of
from app.services.poll_notifications import queue_removed_answers
from app.utils import make_id, roles_contains

TEXT_FIELDS = ("title_nl", "title_fr", "title_en", "description_nl", "description_fr", "description_en")


# --- Admin: questions ----------------------------------------------------------------------------


async def _stats(db: AsyncSession, edition_id: str) -> dict[str, dict[str, int]]:
    """Per question: how many volunteers answered, plus the counts its kind adds (yes/no: yes, no, people)."""
    stats: dict[str, dict[str, int]] = {}
    for kind in KINDS.values():
        stats.update(await kind.stats(db, edition_id))
    return stats


def _question_dict(
    question: EditionPollQuestion, locale: str | None, options: list[dict], stats: dict[str, int] | None
) -> dict:
    return {
        "id": question.id,
        "edition_id": question.edition_id,
        "event_id": question.event_id,
        "kind": question.kind,
        "title": question.localized_title(locale),
        "title_nl": question.title_nl,
        "title_fr": question.title_fr,
        "title_en": question.title_en,
        "description": question.localized_description(locale),
        "description_nl": question.description_nl,
        "description_fr": question.description_fr,
        "description_en": question.description_en,
        "sort_order": question.sort_order,
        "closes_at": question.closes_at,
        "closed": is_closed(question),
        "options": options,
        "answered_count": (stats or {}).get("answered_count", 0),
        "yes_count": (stats or {}).get("yes_count", 0),
        "no_count": (stats or {}).get("no_count", 0),
        "people_total": (stats or {}).get("people_total", 0),
        "created_at": question.created_at,
        "updated_at": question.updated_at,
    }


async def _questions(db: AsyncSession, edition_id: str) -> list[EditionPollQuestion]:
    return list(
        (
            await db.execute(
                select(EditionPollQuestion)
                .where(EditionPollQuestion.edition_id == edition_id)
                .order_by(*QUESTION_ORDER)
            )
        )
        .scalars()
        .all()
    )


async def list_poll_questions(db: AsyncSession, edition_id: str, locale: str | None = None) -> list[dict]:
    """The edition's questions in display order, each with its options (meals) and what volunteers answered."""
    await ensure_edition_exists(db, edition_id)
    options = await poll_options_service.list_poll_options(db, edition_id=edition_id, locale=locale)
    by_question: dict[str, list[dict]] = {}
    for option in options:
        by_question.setdefault(option["question_id"], []).append(option)
    stats = await _stats(db, edition_id)
    return [
        _question_dict(question, locale, by_question.get(question.id, []), stats.get(question.id))
        for question in await _questions(db, edition_id)
    ]


async def _one(db: AsyncSession, question_id: str, locale: str | None = None) -> dict:
    question = await get_question_or_404(db, question_id)
    return next(
        entry for entry in await list_poll_questions(db, question.edition_id, locale) if entry["id"] == question_id
    )


async def _next_sort_order(db: AsyncSession, edition_id: str) -> int:
    highest = (
        await db.execute(
            select(func.max(EditionPollQuestion.sort_order)).where(EditionPollQuestion.edition_id == edition_id)
        )
    ).scalar_one()
    return 0 if highest is None else highest + 1


async def create_poll_question(
    db: AsyncSession, body: PollQuestionCreate, *, actor: str, request_id: str | None = None
) -> dict:
    await lock_edition(db, body.edition_id)
    question = EditionPollQuestion(
        id=make_id("pollq"),
        edition_id=body.edition_id,
        event_id=body.event_id,
        kind=body.kind,
        sort_order=await _next_sort_order(db, body.edition_id),
        closes_at=body.closes_at,
        **{name: getattr(body, name) for name in TEXT_FIELDS},
    )
    await poll_event_registrations.validate_link(db, question.id, question.kind, question.event_id)
    db.add(question)
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_question_created",
        resource_type="edition_poll_question",
        resource_id=question.id,
        request_id=request_id,
        details={"edition_id": question.edition_id, "kind": question.kind, "title": question.title_nl},
    )
    await db.commit()
    return await _one(db, question.id)


async def update_poll_question(
    db: AsyncSession, question_id: str, body: PollQuestionUpdate, *, actor: str, request_id: str | None = None
) -> dict:
    question = await get_question_or_404(db, question_id, lock=True)
    if "event_id" in body.model_fields_set and body.event_id != question.event_id:
        if await kind_of(question).answered_count(db, question) or await db.scalar(
            select(Registration.id).where(Registration.poll_question_id == question.id).limit(1)
        ):
            raise ApiHTTPException(
                409, "poll_event_link_locked", "The event link cannot change after answers or registrations exist."
            )
        await poll_event_registrations.validate_link(db, question.id, question.kind, body.event_id)
        question.event_id = body.event_id
    # Validate the merged texts before mutating: a partial update may change a single translation.
    fields_set = body.model_fields_set
    texts = {name: getattr(question, name) for name in TEXT_FIELDS}
    texts.update(body.model_dump(include=set(TEXT_FIELDS), exclude_unset=True))
    try:
        validated = PollQuestionTexts.model_validate(texts).validate_dutch()
    except (ValueError, ValidationError) as exc:
        raise ApiHTTPException(
            422, "poll_question_invalid", "A poll question requires a non-empty Dutch title."
        ) from exc
    for name in TEXT_FIELDS:
        setattr(question, name, getattr(validated, name))
    if "closes_at" in fields_set:
        question.closes_at = body.closes_at
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_question_updated",
        resource_type="edition_poll_question",
        resource_id=question.id,
        request_id=request_id,
        details={
            "title": question.title_nl,
            "fields_changed": sorted(fields_set),
            "closes_at": question.closes_at.isoformat() if question.closes_at else None,
        },
    )
    await db.commit()
    return await _one(db, question.id)


async def delete_poll_question(
    db: AsyncSession,
    question_id: str,
    *,
    actor: str,
    request_id: str | None = None,
    confirm_answers: bool = False,
    notify: bool = True,
) -> None:
    """Delete a question with its options and answers. When volunteers answered it, the caller must confirm
    that their answers are removed, and a closed question refuses the deletion outright: its answers are final."""
    question = await get_question_or_404(db, question_id, lock=True)
    answered = await kind_of(question).answered_count(db, question)
    if answered:
        if is_closed(question):
            raise ApiHTTPException(
                409,
                "poll_question_closed",
                "The question has closed and volunteers answered it; reopen it before deleting.",
            )
        if not confirm_answers:
            raise ApiHTTPException(
                409,
                "poll_question_in_use",
                f"{answered} volunteer(s) answered this question; confirm to remove their answers.",
            )
    registrations = list(
        (await db.scalars(select(Registration).where(Registration.poll_question_id == question.id))).all()
    )
    if question.event_id:
        await poll_event_registrations.lock_scope(db, [question], None)
        for registration in registrations:
            await db.refresh(registration)
            await poll_event_registrations.sync_answer(
                db, question, registration.person_id, None, actor=actor, request_id=request_id
            )
            registration.poll_question_id = None
        await db.flush()
    if notify:
        await queue_removed_answers(db, question, actor=actor, request_id=request_id)
    await kind_of(question).delete_question_data(db, question)
    await db.delete(question)
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_question_deleted",
        resource_type="edition_poll_question",
        resource_id=question_id,
        request_id=request_id,
        details={"title": question.title_nl, "kind": question.kind, "removed_answers": answered},
    )
    await db.commit()


async def reorder_poll_questions(
    db: AsyncSession, body: PollQuestionReorder, *, actor: str, request_id: str | None = None
) -> list[dict]:
    """Assign every question of the edition its position; ``ordered_ids`` names each exactly once."""
    await lock_edition(db, body.edition_id)
    questions = await _questions(db, body.edition_id)
    if len(set(body.ordered_ids)) != len(body.ordered_ids) or set(body.ordered_ids) != {q.id for q in questions}:
        raise ApiHTTPException(
            400, "poll_question_invalid_order", "ordered_ids must contain every question of the edition exactly once."
        )
    by_id = {question.id: question for question in questions}
    for position, question_id in enumerate(body.ordered_ids):
        by_id[question_id].sort_order = position
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_questions_reordered",
        resource_type="edition_poll_question",
        resource_id=body.edition_id,
        request_id=request_id,
        details={"ordered_ids": body.ordered_ids},
    )
    await db.commit()
    return await list_poll_questions(db, body.edition_id)


async def copy_poll_questions(
    db: AsyncSession, body: PollQuestionCopy, *, actor: str, request_id: str | None = None
) -> list[dict]:
    """Copy the questions of one edition into another, with their options (never answers or closing times),
    after the ones already there. A question whose kind and Dutch title exist in the target is skipped, so
    repeating a copy adds nothing. Returns the questions created."""
    await ensure_edition_exists(db, body.from_edition_id)
    await lock_edition(db, body.to_edition_id)
    existing = {(question.kind, question.title_nl.casefold()) for question in await _questions(db, body.to_edition_id)}
    position = await _next_sort_order(db, body.to_edition_id)
    created: list[EditionPollQuestion] = []
    skipped = 0
    for original in await _questions(db, body.from_edition_id):
        if (original.kind, original.title_nl.casefold()) in existing:
            skipped += 1
            continue
        existing.add((original.kind, original.title_nl.casefold()))
        copy = EditionPollQuestion(
            id=make_id("pollq"),
            edition_id=body.to_edition_id,
            kind=original.kind,
            sort_order=position,
            **{name: getattr(original, name) for name in TEXT_FIELDS},
        )
        position += 1
        db.add(copy)
        created.append(copy)
        source_options = (
            (
                await db.execute(
                    select(EditionPollOption)
                    .where(EditionPollOption.question_id == original.id)
                    .order_by(*OPTION_ORDER)
                )
            )
            .scalars()
            .all()
        )
        for option in source_options:
            db.add(
                EditionPollOption(
                    id=make_id("poll"),
                    edition_id=body.to_edition_id,
                    question_id=copy.id,
                    label_nl=option.label_nl,
                    label_fr=option.label_fr,
                    label_en=option.label_en,
                    dietary_tags=list(option.dietary_tags or []),
                    sort_order=option.sort_order,
                )
            )
    await write_audit_entry(
        db,
        actor=actor,
        action="poll_questions_copied",
        resource_type="edition_poll_question",
        resource_id=body.to_edition_id,
        request_id=request_id,
        details={"from_edition_id": body.from_edition_id, "created": len(created), "skipped": skipped},
    )
    await db.commit()
    created_ids = {question.id for question in created}
    return [entry for entry in await list_poll_questions(db, body.to_edition_id) if entry["id"] in created_ids]


# --- Admin: who answered what ----------------------------------------------------------------------


async def _current_answers(
    db: AsyncSession, edition_id: str, volunteer_ids: list[str] | None = None
) -> dict[str, dict[str, Any]]:
    """Every answer in the edition as ``{volunteer_id: {question_id: answer}}`` (see ``poll_kinds``)."""
    answers: dict[str, dict[str, Any]] = {}
    for kind in KINDS.values():
        for volunteer_id, by_question in (await kind.load_answers(db, edition_id, volunteer_ids)).items():
            answers.setdefault(volunteer_id, {}).update(by_question)
    return answers


async def _orders(
    db: AsyncSession, edition_id: str, locale: str | None, only_volunteer: str | None = None
) -> dict[str, Any]:
    await ensure_edition_exists(db, edition_id)
    questions = await _questions(db, edition_id)
    options = list(
        (
            await db.execute(
                select(EditionPollOption)
                .join(EditionPollQuestion, EditionPollQuestion.id == EditionPollOption.question_id)
                .where(EditionPollOption.edition_id == edition_id)
                .order_by(*QUESTION_ORDER, *OPTION_ORDER)
            )
        )
        .scalars()
        .all()
    )
    option_position = {option.id: index for index, option in enumerate(options)}
    answers = await _current_answers(db, edition_id, [only_volunteer] if only_volunteer else None)
    if only_volunteer:
        people_stmt = select(Person).where(Person.id == only_volunteer)
    else:
        people_stmt = (
            select(Person)
            .where(
                Person.anonymised.is_(False),
                or_(roles_contains("volunteer") & role_active("volunteer"), Person.id.in_(sorted(answers))),
            )
            .order_by(func.lower(Person.name), Person.id)
        )
    people = list((await db.execute(people_stmt)).scalars().all())
    note_stmt = select(VolunteerMealNote.volunteer_id, VolunteerMealNote.note).where(
        VolunteerMealNote.edition_id == edition_id
    )
    notes = {row.volunteer_id: row.note for row in (await db.execute(note_stmt)).all()}
    stats = await _stats(db, edition_id)
    rows = []
    for person in people:
        own = answers.get(person.id, {})
        row: dict[str, Any] = {
            "volunteer_id": person.id,
            "name": person.name,
            "note": notes.get(person.id),
            "answered_question_ids": [q.id for q in questions if q.id in own],
        }
        for kind in KINDS.values():
            row.update(kind.row_defaults())
        for question in questions:
            if question.id in own:
                kind_of(question).add_to_row(row, question, own[question.id], option_position)
        rows.append(row)
    options_by_question: dict[str, list[dict]] = {}
    for option in options:
        options_by_question.setdefault(option.question_id, []).append(
            {"id": option.id, "label": option.localized_label(locale), "dietary_tags": list(option.dietary_tags or [])}
        )
    return {
        "edition_id": edition_id,
        "questions": [
            {
                "id": q.id,
                "kind": q.kind,
                "event_id": q.event_id,
                "title": q.localized_title(locale),
                "closed": is_closed(q),
                "options": options_by_question.get(q.id, []),
                "answered_count": stats.get(q.id, {}).get("answered_count", 0),
                "yes_count": stats.get(q.id, {}).get("yes_count", 0),
                "no_count": stats.get(q.id, {}).get("no_count", 0),
                "people_total": stats.get(q.id, {}).get("people_total", 0),
            }
            for q in questions
        ],
        "volunteers": rows,
        "volunteer_count": len(rows),
    }


async def list_poll_orders(db: AsyncSession, edition_id: str, locale: str | None = None) -> dict[str, Any]:
    """Who answered what in an edition: every active volunteer (also those who have not answered) and
    anyone else holding an answer, with their dietary note."""
    return await _orders(db, edition_id, locale)


async def _apply_note(db: AsyncSession, volunteer_id: str, edition_id: str, note: str | None) -> None:
    """Set the volunteer's dietary note for the edition; ``None`` keeps it, an empty string clears it."""
    if note is None:
        return
    text = note.strip()
    existing = await db.get(VolunteerMealNote, (volunteer_id, edition_id))
    if not text:
        if existing is not None:
            await db.delete(existing)
    elif existing is None:
        db.add(VolunteerMealNote(volunteer_id=volunteer_id, edition_id=edition_id, note=text))
    else:
        existing.note = text


async def set_volunteer_poll_order(
    db: AsyncSession,
    edition_id: str,
    volunteer_id: str,
    body: AdminPollOrderIn,
    *,
    actor: str,
    request_id: str | None = None,
) -> dict:
    """An admin enters or corrects a volunteer's answers for an edition, also after questions closed: a
    change to a closed question needs ``confirm_closed``, so a closed question is never changed by accident.
    Replaces the volunteer's picks and yes/no answers for the edition like their own saves do, and is audited
    with the admin as actor and the volunteer as subject."""
    await ensure_edition_exists(db, edition_id)
    questions = {question.id: question for question in await _questions(db, edition_id)}
    if questions:
        await db.execute(
            select(EditionPollQuestion.id)
            .where(EditionPollQuestion.id.in_(sorted(questions)))
            .order_by(EditionPollQuestion.id)
            .with_for_update()
        )
        # Refresh links after acquiring the locks.
        for question in questions.values():
            await db.refresh(question)
    await poll_event_registrations.lock_scope(db, list(questions.values()), volunteer_id)
    person = await db.get(Person, volunteer_id)
    if person is None or person.anonymised or "volunteer" not in (person.roles or []):
        raise ApiHTTPException(404, "volunteer_not_found", "Volunteer not found.")
    option_question = dict(
        (
            await db.execute(
                select(EditionPollOption.id, EditionPollOption.question_id).where(
                    EditionPollOption.edition_id == edition_id
                )
            )
        ).all()
    )
    new_answers: dict[str, Any] = {}
    for kind in KINDS.values():
        new_answers.update(kind.admin_answers(body, questions, option_question))

    old_answers = (await _current_answers(db, edition_id, [volunteer_id])).get(volunteer_id, {})
    closed_changes = [
        question.id
        for question in questions.values()
        if is_closed(question) and old_answers.get(question.id) != new_answers.get(question.id)
    ]
    if closed_changes and not body.confirm_closed:
        raise ApiHTTPException(
            409,
            "poll_question_closed",
            "A question has closed; set confirm_closed to change this volunteer's answer anyway.",
        )

    for question in questions.values():
        if question.event_id:
            await poll_event_registrations.sync_answer(
                db, question, volunteer_id, new_answers.get(question.id), actor=actor, request_id=request_id
            )
        await kind_of(question).replace_answer(db, volunteer_id, question, new_answers.get(question.id))
    await _apply_note(db, volunteer_id, edition_id, body.note)
    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_poll_answers_set_by_admin",
        resource_type="person",
        resource_id=volunteer_id,
        request_id=request_id,
        details={
            "edition_id": edition_id,
            "option_count": len(body.selections),
            "total_quantity": sum(s.quantity for s in body.selections),
            "attendance_count": len(body.attendance),
            "choice_count": len(body.choices),
            "text_count": len(body.texts),
            "rating_count": len(body.ratings),
            "note_changed": body.note is not None,
            "closed_questions_changed": closed_changes,
        },
    )
    await db.commit()
    orders = await _orders(db, edition_id, None, only_volunteer=volunteer_id)
    return orders["volunteers"][0]


# --- The volunteer's own side ----------------------------------------------------------------------


async def volunteer_poll_view(db: AsyncSession, volunteer_id: str | None, locale: str) -> dict:
    """The active festival edition's questions in `locale` with this volunteer's own answers and note."""
    edition = await find_active_edition(db, edition_type="festival")
    if edition is None:
        return {"edition_id": None, "questions": [], "note": None}
    questions = await _questions(db, edition.id)
    options = (
        (
            await db.execute(
                select(EditionPollOption).where(EditionPollOption.edition_id == edition.id).order_by(*OPTION_ORDER)
            )
        )
        .scalars()
        .all()
    )
    answers: dict[str, Any] = {}
    note = None
    if volunteer_id is not None:
        answers = (await _current_answers(db, edition.id, [volunteer_id])).get(volunteer_id, {})
        note = (
            await db.execute(
                select(VolunteerMealNote.note).where(
                    VolunteerMealNote.volunteer_id == volunteer_id, VolunteerMealNote.edition_id == edition.id
                )
            )
        ).scalar_one_or_none()
    views = []
    for question in questions:
        own_options = [o for o in options if o.question_id == question.id]
        views.append(
            {
                "id": question.id,
                "kind": question.kind,
                "event_id": question.event_id,
                "title": question.localized_title(locale),
                "description": question.localized_description(locale),
                "closes_at": question.closes_at,
                "closed": is_closed(question),
                "options": [
                    {
                        "id": o.id,
                        "label": o.localized_label(locale),
                        "dietary_tags": list(o.dietary_tags or []),
                    }
                    for o in own_options
                ],
                **kind_of(question).view_fields(answers.get(question.id), own_options),
            }
        )
    return {"edition_id": edition.id, "questions": views, "note": note}


async def answer_poll_question(
    db: AsyncSession,
    *,
    volunteer_id: str,
    question_id: str,
    body: VolunteerPollAnswerIn,
    locale: str,
    actor: str,
    request_id: str | None = None,
) -> dict:
    """Save the volunteer's own answer to one question of the active festival edition. Safe to repeat: it
    replaces only rows keyed by this volunteer and question, so it never touches another volunteer's answers.
    Locks the question, linked event/registration, then person so a double-submit serializes."""
    question = await get_question_or_404(db, question_id, lock=True)
    await poll_event_registrations.lock_scope(db, [question], volunteer_id)
    edition = await find_active_edition(db, edition_type="festival")
    if edition is None or question.edition_id != edition.id:
        raise ApiHTTPException(404, "poll_question_not_found", "Poll question not found.")
    ensure_open(question)
    kind = kind_of(question)
    answer = await kind.volunteer_answer(db, question, body)
    if question.event_id:
        await poll_event_registrations.sync_answer(
            db, question, volunteer_id, answer, actor=actor, request_id=request_id
        )
    await kind.replace_answer(db, volunteer_id, question, answer)
    details = kind.audit_details(answer)
    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_poll_answer_saved",
        resource_type="person",
        resource_id=volunteer_id,
        request_id=request_id,
        details={"question_id": question.id, **details},
    )
    await db.commit()
    return await volunteer_poll_view(db, volunteer_id, locale)


async def save_poll_note(
    db: AsyncSession,
    *,
    volunteer_id: str,
    note: str,
    locale: str,
    actor: str,
    request_id: str | None = None,
) -> dict:
    """Save the volunteer's dietary note for the active festival edition's meals (empty clears it). It stays
    editable while at least one meals question is open."""
    await db.execute(select(Person.id).where(Person.id == volunteer_id).with_for_update())
    edition = await find_active_edition(db, edition_type="festival")
    if edition is None:
        raise ApiHTTPException(404, "poll_question_not_found", "There is no poll to leave a note on.")
    noted = [q for q in await _questions(db, edition.id) if kind_of(q).has_note]
    if not noted:
        raise ApiHTTPException(404, "poll_question_not_found", "There is no meals question to leave a note on.")
    if all(is_closed(q) for q in noted):
        raise ApiHTTPException(409, "poll_question_closed", "The meal questions have closed.")
    await _apply_note(db, volunteer_id, edition.id, note)
    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_poll_note_saved",
        resource_type="person",
        resource_id=volunteer_id,
        request_id=request_id,
        details={"edition_id": edition.id, "cleared": not note.strip()},
    )
    await db.commit()
    return await volunteer_poll_view(db, volunteer_id, locale)
