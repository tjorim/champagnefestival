"""Attendance-poll bookings; the enclosing answer transaction owns the commit."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EditionPollQuestion, Person, Registration
from app.schemas import RegistrationAdminCreate, RegistrationUpdate
from app.services import product_inventory as inventory
from app.services import registrations_service
from app.services.errors import ApiHTTPException
from app.services.users_service import get_or_create_user


async def validate_link(db: AsyncSession, question_id: str, kind: str, event_id: str | None) -> None:
    if event_id is None:
        return
    event = await inventory.lock_event(db, event_id)
    if kind != "yes_no" or not event.volunteers_only:
        raise ApiHTTPException(
            422, "poll_event_invalid", "Only attendance questions can link to volunteer-only events."
        )
    other = await db.scalar(
        select(EditionPollQuestion.id).where(
            EditionPollQuestion.event_id == event_id, EditionPollQuestion.id != question_id
        )
    )
    if other:
        raise ApiHTTPException(409, "poll_event_in_use", "This event already has an attendance poll.")


async def lock_scope(db: AsyncSession, questions: list[EditionPollQuestion], volunteer_id: str | None) -> None:
    # Match registration writers: events, registrations, then person. Questions
    # are already locked by the caller, so links cannot change under an answer.
    for event_id in sorted({q.event_id for q in questions if q.event_id}):
        await inventory.lock_event(db, event_id)
    ids = [q.id for q in questions if q.event_id]
    person_ids = {volunteer_id} if volunteer_id else set()
    if ids:
        registrations = select(Registration.id, Registration.person_id).where(Registration.poll_question_id.in_(ids))
        if volunteer_id is not None:
            registrations = registrations.where(Registration.person_id == volunteer_id)
        rows = (await db.execute(registrations.order_by(Registration.id).with_for_update())).all()
        person_ids.update(row.person_id for row in rows)
    if person_ids:
        await db.execute(
            select(Person.id).where(Person.id.in_(sorted(person_ids))).order_by(Person.id).with_for_update()
        )


async def sync_answer(
    db: AsyncSession,
    question: EditionPollQuestion,
    volunteer_id: str,
    answer: tuple[bool, int] | None,
    *,
    actor: str,
    request_id: str | None = None,
) -> None:
    if question.event_id is None:
        return
    event = await inventory.lock_event(db, question.event_id)
    person = await db.get(Person, volunteer_id)
    attending, people = answer if answer is not None else (False, 0)
    registration = await db.scalar(
        select(Registration)
        .where(Registration.poll_question_id == question.id, Registration.person_id == volunteer_id)
        .execution_options(populate_existing=True)
    )
    if attending:
        if (
            person is None
            or person.anonymised
            or "volunteer" not in person.roles
            or "volunteer" in person.retired_roles
        ):
            raise ApiHTTPException(403, "volunteer_required", "A current volunteer is required for this event.")
        if not event.volunteers_only or not event.active:
            raise ApiHTTPException(409, "poll_event_unavailable", "The linked volunteer event is unavailable.")
        if event.members_only and ("member" not in person.roles or "member" in person.retired_roles):
            raise ApiHTTPException(403, "membership_required", "A current membership is also required for this event.")
    if registration is None:
        if not attending:
            return
        # Avoid quietly creating a second booking beside an admin-entered one.
        if await db.scalar(
            select(Registration.id)
            .where(
                Registration.person_id == volunteer_id,
                Registration.event_id == event.id,
                Registration.status != "cancelled",
            )
            .limit(1)
        ):
            raise ApiHTTPException(
                409,
                "poll_registration_exists",
                "An existing event booking must be resolved before answering this poll.",
            )
        result = await registrations_service.admin_create_registration(
            db,
            body=RegistrationAdminCreate(
                event_id=event.id, person_id=volunteer_id, guest_count=people, status="confirmed"
            ),
            actor=actor,
            request_id=request_id,
            commit=False,
            poll_question_id=question.id,
        )
        registration = await db.get(Registration, result["id"])
        assert registration is not None
        if person is not None and person.oidc_subject:
            registration.user_id = (await get_or_create_user(db, person.oidc_subject, commit=False)).id
        return
    status = "confirmed" if attending else "cancelled"
    guest_count = people if attending else registration.guest_count
    if registration.status == status and registration.guest_count == guest_count:
        return
    if registration.checked_in or registration.amount_paid != 0:
        raise ApiHTTPException(
            409, "poll_registration_locked", "Resolve check-in or recorded payment before changing this attendance."
        )
    await registrations_service.apply_registration_update(
        db,
        registration,
        RegistrationUpdate(status=status, guest_count=guest_count),
        actor=actor,
        request_id=request_id,
        commit=False,
        from_poll=True,
    )
