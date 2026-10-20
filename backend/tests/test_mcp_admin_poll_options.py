"""Tests for the admin (write) volunteer poll MCP tools: questions, meal options and answers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.mcp.admin import poll_options as mcp_poll
from app.models import Edition, Person, Venue
from app.schemas import PollAttendanceItem, PollSelectionItem
from tests.helpers import mcp_session_factory


async def _create_edition(db_session, *, edition_id: str = "edition-1") -> str:
    venue = Venue(id=f"venue-{edition_id}", name="Test Venue")
    db_session.add(venue)
    await db_session.flush()
    edition = Edition(id=edition_id, year=2099, month="march", venue_id=venue.id, active=False)
    db_session.add(edition)
    await db_session.commit()
    return edition.id


async def _meals(factory, edition_id: str, title: str = "Maaltijden") -> dict:
    return await mcp_poll.create_poll_question(factory, "admin-1", edition_id=edition_id, kind="meals", title_nl=title)


async def test_create_list_update_reopen_and_delete_a_question(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)

    dinner = await mcp_poll.create_poll_question(
        factory,
        "admin-1",
        edition_id=edition_id,
        kind="yes_no",
        title_nl="Eten op zondag?",
        title_en="Dinner on Sunday?",
    )
    meals = await _meals(factory, edition_id)
    assert (dinner["kind"], dinner["sort_order"], meals["sort_order"]) == ("yes_no", 0, 1)
    assert [q["title"] for q in await mcp_poll.list_poll_questions(factory, edition_id, "en")] == [
        "Dinner on Sunday?",
        "Maaltijden",
    ]

    updated = await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], title_fr="Dîner dimanche ?")
    assert (updated["title_nl"], updated["title_fr"]) == ("Eten op zondag?", "Dîner dimanche ?")
    past = datetime.now(UTC) - timedelta(hours=1)
    closed = await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], closes_at=past)
    assert closed["closed"] is True
    reopened = await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], reopen=True)
    assert (reopened["closes_at"], reopened["closed"]) == (None, False)

    with pytest.raises(ValueError, match="either"):
        await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], closes_at=past, reopen=True)
    with pytest.raises(ValueError, match="Dutch title"):
        await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], title_nl="")
    with pytest.raises(ValueError, match="Dutch title"):
        await mcp_poll.create_poll_question(factory, "admin-1", edition_id=edition_id, kind="yes_no", title_en="x")
    with pytest.raises(ValueError, match="timezone"):
        await mcp_poll.create_poll_question(
            factory, "admin-1", edition_id=edition_id, kind="yes_no", title_nl="x", closes_at=datetime(2030, 1, 1)
        )
    with pytest.raises(ValueError, match="not found"):
        await mcp_poll.update_poll_question(factory, "admin-1", "nope", title_en="x")

    reordered = await mcp_poll.reorder_poll_questions(
        factory, "admin-1", edition_id=edition_id, ordered_ids=[meals["id"], dinner["id"]]
    )
    assert [q["title"] for q in reordered["questions"]] == ["Maaltijden", "Eten op zondag?"]
    with pytest.raises(ValueError, match="every question"):
        await mcp_poll.reorder_poll_questions(factory, "admin-1", edition_id=edition_id, ordered_ids=[dinner["id"]])

    assert await mcp_poll.delete_poll_question(factory, "admin-1", dinner["id"]) == {
        "deleted": True,
        "id": dinner["id"],
    }
    with pytest.raises(ValueError, match="not found"):
        await mcp_poll.delete_poll_question(factory, "admin-1", dinner["id"])


async def test_meal_options_with_translations_tags_and_order(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    meals = await _meals(factory, edition_id)
    dinner = await mcp_poll.create_poll_question(
        factory, "admin-1", edition_id=edition_id, kind="yes_no", title_nl="Eten?"
    )

    stew = await mcp_poll.create_poll_option(
        factory,
        "admin-1",
        question_id=meals["id"],
        label_nl="Stoofvlees",
        label_en="Beef stew",
        dietary_tags=["lactose_free"],
    )
    soup = await mcp_poll.create_poll_option(factory, "admin-1", question_id=meals["id"], label_nl="Soep")
    assert (stew["question_id"], stew["label_en"], stew["dietary_tags"], soup["sort_order"]) == (
        meals["id"],
        "Beef stew",
        ["lactose_free"],
        1,
    )
    updated = await mcp_poll.update_poll_option(
        factory, "admin-1", soup["id"], label_fr="Soupe", dietary_tags=["vegan"]
    )
    assert (updated["label_fr"], updated["dietary_tags"]) == ("Soupe", ["vegan"])
    assert (await mcp_poll.update_poll_option(factory, "admin-1", soup["id"], label_fr=""))["label_fr"] is None
    assert [o["label"] for o in await mcp_poll.list_poll_options(factory, meals["id"], None, "en")] == [
        "Beef stew",
        "Soep",
    ]
    assert len(await mcp_poll.list_poll_options(factory, edition_id=edition_id)) == 2

    with pytest.raises(ValueError, match="Dutch label"):
        await mcp_poll.update_poll_option(factory, "admin-1", soup["id"], label_nl="")
    with pytest.raises(ValueError, match="Dutch label"):
        await mcp_poll.create_poll_option(factory, "admin-1", question_id=meals["id"], label_en="x")
    with pytest.raises(ValueError, match="Only a meals question"):
        await mcp_poll.create_poll_option(factory, "admin-1", question_id=dinner["id"], label_nl="Soep")
    with pytest.raises(ValueError, match="dietary_tags"):
        await mcp_poll.create_poll_option(
            factory, "admin-1", question_id=meals["id"], label_nl="X", dietary_tags=["vegan", "vegan"]
        )

    reordered = await mcp_poll.reorder_poll_options(
        factory, "admin-1", question_id=meals["id"], ordered_ids=[soup["id"], stew["id"]]
    )
    assert [o["label"] for o in reordered["options"]] == ["Soep", "Stoofvlees"]
    with pytest.raises(ValueError, match="every option"):
        await mcp_poll.reorder_poll_options(factory, "admin-1", question_id=meals["id"], ordered_ids=[soup["id"]])
    assert await mcp_poll.delete_poll_option(factory, "admin-1", soup["id"]) == {"deleted": True, "id": soup["id"]}
    with pytest.raises(ValueError, match="not found"):
        await mcp_poll.delete_poll_option(factory, "admin-1", "nope")


async def test_copy_questions_between_editions_is_idempotent(db_session):
    factory = mcp_session_factory(db_session)
    source = await _create_edition(db_session, edition_id="edition-source")
    target = await _create_edition(db_session, edition_id="edition-target")
    meals = await _meals(factory, source)
    await mcp_poll.create_poll_option(
        factory, "admin-1", question_id=meals["id"], label_nl="Soep", label_fr="Soupe", dietary_tags=["vegan"]
    )

    first = await mcp_poll.copy_poll_questions(factory, "admin-1", from_edition_id=source, to_edition_id=target)
    assert [(q["title"], [o["label_nl"] for o in q["options"]]) for q in first["created"]] == [("Maaltijden", ["Soep"])]
    again = await mcp_poll.copy_poll_questions(factory, "admin-1", from_edition_id=source, to_edition_id=target)
    assert again["created"] == []
    with pytest.raises(ValueError, match="different edition"):
        await mcp_poll.copy_poll_questions(factory, "admin-1", from_edition_id=source, to_edition_id=source)
    with pytest.raises(ValueError, match="not found"):
        await mcp_poll.copy_poll_questions(factory, "admin-1", from_edition_id="nope", to_edition_id=target)


async def test_confirmed_deletes(db_session):
    from app.models import VolunteerPollAnswer, VolunteerPollSelection

    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    meals = await _meals(factory, edition_id)
    option = await mcp_poll.create_poll_option(factory, "admin-1", question_id=meals["id"], label_nl="Soep")
    dinner = await mcp_poll.create_poll_question(
        factory, "admin-1", edition_id=edition_id, kind="yes_no", title_nl="Eten?"
    )
    db_session.add(Person(id="per-1", name="Sofie", roles=["volunteer"]))
    await db_session.flush()
    db_session.add(VolunteerPollSelection(volunteer_id="per-1", option_id=option["id"], quantity=2))
    db_session.add(VolunteerPollAnswer(volunteer_id="per-1", question_id=dinner["id"], attending=True, people=2))
    await db_session.commit()

    with pytest.raises(ValueError, match="confirm"):
        await mcp_poll.delete_poll_option(factory, "admin-1", option["id"])
    with pytest.raises(ValueError, match="confirm"):
        await mcp_poll.delete_poll_question(factory, "admin-1", dinner["id"])

    past = datetime.now(UTC) - timedelta(hours=1)
    await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], closes_at=past)
    with pytest.raises(ValueError, match="closed"):
        await mcp_poll.delete_poll_question(factory, "admin-1", dinner["id"], confirm_answers=True)
    await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], reopen=True)

    assert (await mcp_poll.delete_poll_option(factory, "admin-1", option["id"], confirm_selections=True))["deleted"]
    assert (await mcp_poll.delete_poll_question(factory, "admin-1", dinner["id"], confirm_answers=True))["deleted"]


async def test_admin_enters_answers_also_for_closed_questions(db_session):
    factory = mcp_session_factory(db_session)
    edition_id = await _create_edition(db_session)
    meals = await _meals(factory, edition_id)
    soup = await mcp_poll.create_poll_option(factory, "admin-1", question_id=meals["id"], label_nl="Soep")
    dinner = await mcp_poll.create_poll_question(
        factory, "admin-1", edition_id=edition_id, kind="yes_no", title_nl="Eten?"
    )
    db_session.add(Person(id="per-1", name="Sofie", roles=["volunteer"]))
    db_session.add(Person(id="per-2", name="Visitor", roles=[]))
    await db_session.commit()
    pick = [PollSelectionItem(option_id=soup["id"], quantity=2)]
    attending = [PollAttendanceItem(question_id=dinner["id"], attending=True, people=3)]

    row = await mcp_poll.set_volunteer_poll_order(
        factory,
        "admin-1",
        edition_id=edition_id,
        volunteer_id="per-1",
        selections=pick,
        attendance=attending,
        note="Geen noten",
    )
    assert row["answered_question_ids"] == [meals["id"], dinner["id"]]  # in question order
    assert (row["note"], row["attendance"]) == (
        "Geen noten",
        [{"question_id": dinner["id"], "attending": True, "people": 3}],
    )

    past = datetime.now(UTC) - timedelta(hours=1)
    await mcp_poll.update_poll_question(factory, "admin-1", dinner["id"], closes_at=past)
    with pytest.raises(ValueError, match="confirm_closed"):
        await mcp_poll.set_volunteer_poll_order(
            factory, "admin-1", edition_id=edition_id, volunteer_id="per-1", selections=pick
        )  # drops the closed dinner answer
    cleared = await mcp_poll.set_volunteer_poll_order(
        factory, "admin-1", edition_id=edition_id, volunteer_id="per-1", note="", confirm_closed=True
    )
    assert (cleared["answered_question_ids"], cleared["note"]) == ([], None)
    with pytest.raises(ValueError, match="Volunteer not found"):
        await mcp_poll.set_volunteer_poll_order(
            factory, "admin-1", edition_id=edition_id, volunteer_id="per-2", confirm_closed=True
        )

    orders = await mcp_poll.list_poll_orders(factory, edition_id)
    assert [q["title"] for q in orders["questions"]] == ["Maaltijden", "Eten?"]
    assert orders["volunteer_count"] == 1
