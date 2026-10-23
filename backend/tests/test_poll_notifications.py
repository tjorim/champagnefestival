"""Removed answers survive deletion as translated, durable email snapshots."""

import pytest
from sqlalchemy import select

from app.mcp.admin import poll as mcp_poll
from app.models import (
    OutboxJob,
    Person,
    PollDeletionNotification,
    VolunteerPollAnswer,
    VolunteerPollChoice,
    VolunteerPollRating,
    VolunteerPollSelection,
    VolunteerPollText,
)
from tests.helpers import ADMIN_HEADERS, _create_event, mcp_session_factory
from tests.poll_helpers import create_option, create_question


@pytest.mark.anyio
@pytest.mark.parametrize("transport", ["rest", "mcp"])
@pytest.mark.parametrize("kind", ["meals", "yes_no", "single_choice", "free_text", "rating"])
@pytest.mark.parametrize("notify", [True, False])
async def test_question_notification(client, db_session, transport, kind, notify):
    edition = (await _create_event(client))["edition_id"]
    question = await create_question(client, edition, kind, "Vraag", title_fr="Question")
    person = Person(id="notification-person", name="Volunteer", email="volunteer@example.com", preferred_language="fr")
    db_session.add(person)
    await db_session.flush()
    base = {"volunteer_id": person.id, "question_id": question["id"]}
    if kind in ("meals", "single_choice"):
        option = await create_option(client, question["id"], "Soep")
        row = (
            VolunteerPollSelection(volunteer_id=person.id, option_id=option["id"], quantity=3)
            if kind == "meals"
            else VolunteerPollChoice(**base, option_id=option["id"])
        )
        expected = "Soep"  # Missing French translation falls back to Dutch.
    elif kind == "yes_no":
        row = VolunteerPollAnswer(**base, attending=False, people=0)
        expected = "Non (0)"
    elif kind == "free_text":
        row = VolunteerPollText(**base, text="My answer")
        expected = "My answer"
    else:
        row = VolunteerPollRating(**base, rating=4)
        expected = "4"
    db_session.add(row)
    await db_session.commit()
    if transport == "rest":
        response = await client.delete(
            f"/api/poll-questions/{question['id']}",
            params={"confirm_answers": True, "notify": notify},
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 204, response.text
    else:
        await mcp_poll.delete_poll_question(
            mcp_session_factory(db_session), "admin", question["id"], confirm_answers=True, notify=notify
        )
    snapshots = list(await db_session.scalars(select(PollDeletionNotification)))
    jobs = list(await db_session.scalars(select(OutboxJob)))
    assert len(snapshots) == len(jobs) == int(notify)
    if notify:
        assert "Question" in snapshots[0].body
        assert expected in snapshots[0].body
        assert "Votre réponse supprimée" in snapshots[0].body
        assert jobs[0].resource_id == snapshots[0].id


@pytest.mark.anyio
@pytest.mark.parametrize("transport", ["rest", "mcp"])
@pytest.mark.parametrize("notify", [True, False])
async def test_option_notification(client, db_session, transport, notify):
    edition = (await _create_event(client))["edition_id"]
    question = await create_question(client, edition)
    option = await create_option(client, question["id"], "Soep", label_en="Soup")
    db_session.add(Person(id="p", name="Volunteer", email="v@example.com", preferred_language="en"))
    await db_session.flush()
    db_session.add(VolunteerPollSelection(volunteer_id="p", option_id=option["id"], quantity=2))
    await db_session.commit()
    if transport == "rest":
        response = await client.delete(
            f"/api/poll-options/{option['id']}",
            params={"confirm_selections": True, "notify": notify},
            headers=ADMIN_HEADERS,
        )
        assert response.status_code == 204, response.text
        assert (await client.delete(f"/api/poll-options/{option['id']}", headers=ADMIN_HEADERS)).status_code == 404
    else:
        await mcp_poll.delete_poll_option(
            mcp_session_factory(db_session), "admin", option["id"], confirm_selections=True, notify=notify
        )
    snapshots = list(await db_session.scalars(select(PollDeletionNotification)))
    assert len(snapshots) == int(notify)
    if notify:
        assert "Soup × 2" in snapshots[0].body


@pytest.mark.anyio
async def test_unused_question_and_failed_delivery(client, db_session, monkeypatch):
    from app import email
    from app.models import EditionPollQuestion
    from app.services.outbox_service import process_one_job
    from app.services.poll_notifications import POLL_DELETION

    edition = (await _create_event(client))["edition_id"]
    question = await create_question(client, edition)
    assert (await client.delete(f"/api/poll-questions/{question['id']}", headers=ADMIN_HEADERS)).status_code == 204
    assert list(await db_session.scalars(select(OutboxJob))) == []

    question = await create_question(client, edition, "rating")
    db_session.add(Person(id="p", name="Volunteer", email="v@example.com"))
    await db_session.flush()
    db_session.add(VolunteerPollRating(volunteer_id="p", question_id=question["id"], rating=5))
    await db_session.commit()
    response = await client.delete(
        f"/api/poll-questions/{question['id']}", params={"confirm_answers": True}, headers=ADMIN_HEADERS
    )
    assert response.status_code == 204
    monkeypatch.setattr(email, "async_session_factory", mcp_session_factory(db_session))
    monkeypatch.setattr(email.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(email.settings, "smtp_from", "festival@example.com")

    def fail(_message):
        raise OSError("SMTP unavailable")

    monkeypatch.setattr(email, "_send_message_sync", fail)
    assert await process_one_job(
        mcp_session_factory(db_session), {POLL_DELETION: email.deliver_poll_deletion_notification}
    )
    assert await db_session.get(EditionPollQuestion, question["id"]) is None
    job = (await db_session.scalars(select(OutboxJob))).one()
    assert job.state == "pending"
    assert job.attempt_count == 1
    snapshot = (await db_session.scalars(select(PollDeletionNotification))).one()
    assert "Je verwijderde antwoord" in snapshot.body
