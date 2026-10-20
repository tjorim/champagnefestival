"""Snapshot removed poll answers in the deletion transaction for deferred email delivery."""

from typing import Any, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EditionPollOption, EditionPollQuestion, Person, PollDeletionNotification
from app.services.outbox_service import enqueue_job
from app.services.poll_kinds import kind_of
from app.utils import make_id

POLL_DELETION = "poll_deletion_notification"
COPY = {
    "nl": (
        "Champagnefestival: vrijwilligersvraag gewijzigd",
        "De volgende vraag of optie is verwijderd",
        "Je verwijderde antwoord",
        "Ja",
        "Nee",
    ),
    "fr": (
        "Champagnefestival : question bénévole modifiée",
        "La question ou option suivante a été supprimée",
        "Votre réponse supprimée",
        "Oui",
        "Non",
    ),
    "en": (
        "Champagnefestival: volunteer question changed",
        "The following question or option was removed",
        "Your removed answer",
        "Yes",
        "No",
    ),
}


def translated(row: EditionPollOption | EditionPollQuestion, field: str, language: str) -> str:
    return getattr(row, f"{field}_{language}") or getattr(row, f"{field}_nl")


async def queue_removed_answers(
    db: AsyncSession,
    question: EditionPollQuestion,
    *,
    actor: str,
    request_id: str | None = None,
    option: EditionPollOption | None = None,
) -> None:
    answers = await kind_of(question).load_answers(db, question.edition_id, None)
    options = {
        row.id: row
        for row in (await db.scalars(select(EditionPollOption).where(EditionPollOption.question_id == question.id)))
    }
    for volunteer_id, values in answers.items():
        if question.id not in values:
            continue
        answer: Any = values[question.id]
        if option is not None:
            if question.kind == "meals":
                if option.id not in answer:
                    continue
                answer = {option.id: answer[option.id]}
            elif answer != option.id:
                continue
        person = await db.get(Person, volunteer_id)
        if person is None or not person.email:
            continue
        language = person.preferred_language if person.preferred_language in COPY else "nl"
        subject, removed, answer_label, yes, no = COPY[language]
        if question.kind == "meals":
            display = ", ".join(
                f"{translated(options[key], 'label', language)} × {quantity}" for key, quantity in answer.items()
            )
        elif question.kind == "single_choice":
            display = translated(options[cast(str, answer)], "label", language)
        elif question.kind == "yes_no":
            display = f"{yes if cast(tuple[bool, int], answer)[0] else no} ({cast(tuple[bool, int], answer)[1]})"
        else:
            display = str(answer)
        name = translated(question, "title", language)
        if option is not None:
            name += ": " + translated(option, "label", language)
        notification = PollDeletionNotification(
            id=make_id("pnot"),
            recipient=person.email,
            subject=subject,
            body=f"{removed}: {name}.\n{answer_label}: {display}\n",
        )
        db.add(notification)
        resource_id = option.id if option is not None else question.id
        await enqueue_job(
            db,
            job_type=POLL_DELETION,
            resource_type="poll_deletion_notification",
            resource_id=notification.id,
            deduplication_key=f"poll-deletion:{resource_id}:{volunteer_id}",
            actor=actor,
            request_id=request_id,
        )
