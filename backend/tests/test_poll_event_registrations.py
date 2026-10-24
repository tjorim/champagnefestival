"""Linked volunteer attendance polls maintain one transactional event booking."""

import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Person, Registration, VolunteerPollAnswer
from app.schemas import VolunteerPollAnswerIn
from app.services.poll_questions_service import answer_poll_question
from tests.helpers import _create_event, _post_registration, requires_postgres
from tests.poll_helpers import Volunteers, create_question


async def setup(client, volunteer_client_as, db_session):
    event = await _create_event(client)
    response = await client.put(f"/api/events/{event['id']}", json={"volunteers_only": True})
    assert response.status_code == 200, response.text
    question = await create_question(client, event["edition_id"], "yes_no", "Eet je mee?", event_id=event["id"])
    volunteers = Volunteers(volunteer_client_as, db_session)
    await volunteers.register("poll-event-volunteer")
    person = await db_session.scalar(select(Person).where(Person.oidc_subject == "poll-event-volunteer"))
    assert person is not None
    return event, question, volunteers, person


async def answer(volunteers, question, attending, people=1):
    return await volunteers.call(
        "poll-event-volunteer",
        "put",
        f"/api/me/volunteer/poll/questions/{question['id']}",
        json={"attending": attending, "people": people if attending else 0},
    )


async def booking(db_session, question):
    return (
        await db_session.scalars(
            select(Registration)
            .where(Registration.poll_question_id == question["id"])
            .execution_options(populate_existing=True)
        )
    ).one()


@pytest.mark.anyio
async def test_yes_no_party_size_retry_and_admin_correction(client, volunteer_client_as, db_session):
    event, question, volunteers, person = await setup(client, volunteer_client_as, db_session)
    assert (await answer(volunteers, question, True, 2)).status_code == 200
    registration = await booking(db_session, question)
    registration_id = registration.id
    assert registration.user_id is not None
    token = registration.check_in_token
    assert (registration.person_id, registration.event_id, registration.guest_count, registration.status) == (
        person.id,
        event["id"],
        2,
        "confirmed",
    )
    assert (await answer(volunteers, question, True, 2)).status_code == 200
    assert await db_session.scalar(select(func.count()).select_from(Registration)) == 1
    assert (await answer(volunteers, question, True, 3)).status_code == 200
    assert (await booking(db_session, question)).guest_count == 3
    assert (await answer(volunteers, question, False)).status_code == 200
    registration = await booking(db_session, question)
    assert registration.status == "cancelled"
    assert registration.check_in_token != token
    assert (await answer(volunteers, question, True)).status_code == 200
    registration = await booking(db_session, question)
    assert registration.id == registration_id and registration.status == "confirmed"
    assert (await client.put(f"/api/registrations/{registration_id}", json={"guest_count": 4})).json()[
        "code"
    ] == "poll_registration_managed"
    assert (await client.delete(f"/api/registrations/{registration_id}")).json()["code"] == "poll_registration_managed"
    corrected = await client.put(
        f"/api/poll-questions/orders/{person.id}",
        params={"edition_id": event["edition_id"]},
        json={"attendance": [{"question_id": question["id"], "attending": True, "people": 4}]},
    )
    assert corrected.status_code == 200, corrected.text
    assert (await booking(db_session, question)).guest_count == 4


@pytest.mark.anyio
async def test_check_in_prevents_answer_change_and_poll_deletion(client, volunteer_client_as, db_session):
    _, question, volunteers, _ = await setup(client, volunteer_client_as, db_session)
    await answer(volunteers, question, True)
    registration = await booking(db_session, question)
    assert (await client.put(f"/api/registrations/{registration.id}", json={"checked_in": True})).status_code == 200
    refused = await answer(volunteers, question, False)
    assert refused.status_code == 409
    assert refused.json()["code"] == "poll_registration_locked"
    assert (
        await db_session.scalar(
            select(VolunteerPollAnswer.attending).where(VolunteerPollAnswer.question_id == question["id"])
        )
    ) is True
    refused = await client.delete(f"/api/poll-questions/{question['id']}?confirm_answers=true&notify=false")
    assert refused.status_code == 409
    assert (await booking(db_session, question)).status == "confirmed"


@pytest.mark.anyio
async def test_delete_poll_cancels_and_preserves_booking(client, volunteer_client_as, db_session):
    _, question, volunteers, _ = await setup(client, volunteer_client_as, db_session)
    await answer(volunteers, question, True)
    registration_id = (await booking(db_session, question)).id
    response = await client.delete(f"/api/poll-questions/{question['id']}?confirm_answers=true&notify=false")
    assert response.status_code == 204, response.text
    registration = await db_session.get(Registration, registration_id, populate_existing=True)
    assert registration is not None
    assert registration.poll_question_id is None
    assert registration.status == "cancelled"


@pytest.mark.anyio
async def test_link_validation_and_public_registration_gate(client, volunteer_client_as, db_session):
    event, question, volunteers, _ = await setup(client, volunteer_client_as, db_session)
    assert (await _post_registration(client, event=event)).json()["code"] == "volunteer_event_poll_required"
    assert (await client.put(f"/api/events/{event['id']}", json={"volunteers_only": False})).json()[
        "code"
    ] == "event_linked_to_poll"
    duplicate = await client.post(
        "/api/poll-questions",
        json={"edition_id": event["edition_id"], "kind": "yes_no", "title_nl": "Nog eens", "event_id": event["id"]},
    )
    assert duplicate.json()["code"] == "poll_event_in_use"
    wrong_kind = await client.post(
        "/api/poll-questions",
        json={"edition_id": event["edition_id"], "kind": "meals", "title_nl": "Maaltijden", "event_id": event["id"]},
    )
    assert wrong_kind.json()["code"] == "poll_event_invalid"
    await answer(volunteers, question, True)
    assert (await client.put(f"/api/poll-questions/{question['id']}", json={"event_id": None})).json()[
        "code"
    ] == "poll_event_link_locked"


@pytest.mark.anyio
async def test_retired_volunteer_cannot_create_booking(client, volunteer_client_as, db_session):
    _, question, volunteers, person = await setup(client, volunteer_client_as, db_session)
    person.retired_roles = {"volunteer": "2026-10-24"}
    await db_session.commit()
    response = await answer(volunteers, question, True)
    assert response.status_code == 403
    assert response.json()["code"] == "volunteer_required"
    assert await db_session.scalar(select(func.count()).select_from(Registration)) == 0
    assert await db_session.scalar(select(func.count()).select_from(VolunteerPollAnswer)) == 0


@pytest.mark.anyio
@requires_postgres("the answer and registration locks must serialize real concurrent requests")
async def test_concurrent_answers_create_one_registration(client, volunteer_client_as, db_session, engine):
    _, question, _, person = await setup(client, volunteer_client_as, db_session)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def save():
        async with factory() as db:
            await answer_poll_question(
                db,
                volunteer_id=person.id,
                question_id=question["id"],
                body=VolunteerPollAnswerIn(attending=True, people=2),
                locale="nl",
                actor="poll-event-volunteer",
            )

    await asyncio.wait_for(asyncio.gather(save(), save()), timeout=15)
    assert await db_session.scalar(select(func.count()).select_from(Registration)) == 1
    assert (await booking(db_session, question)).guest_count == 2


@pytest.mark.anyio
async def test_booking_failure_rolls_back_answer_and_booking(
    client, volunteer_client_as, db_session, monkeypatch, engine
):
    from app.services import registrations_service
    from app.services.errors import ApiHTTPException

    _, question, volunteers, _ = await setup(client, volunteer_client_as, db_session)
    original = registrations_service.admin_create_registration

    async def fail_after_create(*args, **kwargs):
        await original(*args, **kwargs)
        raise ApiHTTPException(409, "poll_event_unavailable", "Injected failure after booking creation")

    monkeypatch.setattr(registrations_service, "admin_create_registration", fail_after_create)
    response = await answer(volunteers, question, True, 2)
    assert response.status_code == 409, response.text
    # The fixture reuses a session, unlike production's per-request dependency.
    # An independent connection must see no commit, then mimic request close.
    async with async_sessionmaker(engine)() as observer:
        assert await observer.scalar(select(func.count()).select_from(Registration)) == 0
        assert await observer.scalar(select(func.count()).select_from(VolunteerPollAnswer)) == 0
    await db_session.rollback()
    monkeypatch.setattr(registrations_service, "admin_create_registration", original)
    assert (await answer(volunteers, question, True, 2)).status_code == 200
    assert (await booking(db_session, question)).guest_count == 2


@pytest.mark.anyio
async def test_linked_poll_copy_does_not_reuse_event_and_mcp_can_unlink(client, volunteer_client_as, db_session):
    from app.mcp.admin import poll
    from tests.helpers import mcp_session_factory

    event, question, _, _ = await setup(client, volunteer_client_as, db_session)
    other = await _create_event(client, edition_id="other", edition_active=False)
    response = await client.post(
        "/api/poll-questions/copy", json={"from_edition_id": event["edition_id"], "to_edition_id": other["edition_id"]}
    )
    assert response.status_code == 201, response.text
    assert response.json()[0]["event_id"] is None
    result = await poll.update_poll_question(mcp_session_factory(db_session), "admin", question["id"], clear_event=True)
    assert result["event_id"] is None
    result = await poll.update_poll_question(
        mcp_session_factory(db_session), "admin", question["id"], event_id=event["id"]
    )
    assert result["event_id"] == event["id"]


@pytest.mark.anyio
async def test_paid_registration_refuses_attendance_change(client, volunteer_client_as, db_session):
    _, question, volunteers, _ = await setup(client, volunteer_client_as, db_session)
    await answer(volunteers, question, True)
    registration = await booking(db_session, question)
    response = await client.post(
        f"/api/registrations/{registration.id}/transactions", json={"amount": "10.00", "effective_date": "2026-10-24"}
    )
    assert response.status_code == 201, response.text
    refused = await answer(volunteers, question, False)
    assert refused.json()["code"] == "poll_registration_locked"
    assert (await booking(db_session, question)).status == "confirmed"
