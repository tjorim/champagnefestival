"""Stamp card integration and transaction regressions."""

import asyncio

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Registration, Stamp, StampCard, StampCardReward
from app.services import stamp_cards_service as service
from tests.helpers import _create_event, _post_registration, requires_postgres

TYPE = {"name_nl": "Ruilbeurs", "box_count": 2, "reward_label_nl": "Een fles", "reward_label_fr": "Une bouteille"}


async def setup_card(client, boxes=2):
    response = await client.post("/api/stamp-cards/types", json={**TYPE, "box_count": boxes})
    assert response.status_code == 201, response.text
    card_type = response.json()
    response = await client.put("/api/settings", json={"stamp_card_type_id": card_type["id"]})
    assert response.status_code == 200, response.text
    event = await _create_event(client, edition_type="capsule_exchange")
    first = await _post_registration(client, event=event)
    assert first.status_code == 201, first.text
    return card_type, event, first.json()


async def check(client, registration, value=True):
    return await client.put(f"/api/registrations/{registration['id']}", json={"checked_in": value})


@pytest.mark.anyio
async def test_qr_and_update_stamp_reward_and_reversal(client):
    card_type, event, first = await setup_card(client)
    detail = (await client.get(f"/api/registrations/{first['id']}")).json()
    qr = await client.post(f"/api/check-in/{first['id']}", json={"token": detail["check_in_token"]})
    assert qr.status_code == 200, qr.text
    assert qr.json()["stamp_progress"]["stamps"] == 1
    again = await client.post(f"/api/check-in/{first['id']}", json={"token": detail["check_in_token"]})
    assert again.json()["stamp_progress"]["stamps"] == 1
    # Public matching resolves this second attendance to the same person.
    second = (await _post_registration(client, event=event)).json()
    result = await check(client, second)
    assert result.status_code == 200, result.text
    assert result.json()["stamp_progress"]["reward_earned"]
    cards = (await client.get(f"/api/stamp-cards/people/{first['person_id']}")).json()
    assert len(cards) == 1
    reward = cards[0]["reward"]
    url = f"/api/stamp-cards/rewards/{reward['id']}"
    handed = await client.put(url, json={"handed_out": True})
    assert handed.status_code == 200
    assert (await client.put(url, json={"handed_out": True})).json()["handed_out_at"] == handed.json()["handed_out_at"]
    refused = await check(client, first, False)
    assert refused.status_code == 409
    assert refused.json()["code"] == "stamp_reward_handed_out"
    assert (await client.get(f"/api/registrations/{first['id']}")).json()["checked_in"]
    assert (await client.put(url, json={"handed_out": False})).status_code == 200
    undone = await check(client, first, False)
    assert undone.status_code == 200, undone.text
    assert undone.json()["stamp_progress"]["stamps"] == 1
    assert not undone.json()["stamp_progress"]["reward_earned"]
    cards = (await client.get(f"/api/stamp-cards/people/{first['person_id']}")).json()
    assert cards[0]["reward"] is None
    # Type edits affect the next card only.
    assert (
        await client.put(
            f"/api/stamp-cards/types/{card_type['id']}", json={**TYPE, "box_count": 3, "reward_label_nl": "Nieuw"}
        )
    ).status_code == 200
    assert (await check(client, first)).status_code == 200
    cards = (await client.get(f"/api/stamp-cards/people/{first['person_id']}")).json()
    await client.put(f"/api/stamp-cards/rewards/{cards[0]['reward']['id']}", json={"handed_out": True})
    third = (await _post_registration(client, event=event)).json()
    assert (await check(client, third)).json()["stamp_progress"]["box_count"] == 3
    cards = (await client.get(f"/api/stamp-cards/people/{first['person_id']}")).json()
    assert cards[0]["box_count"] == 2
    assert cards[0]["reward"]["reward_label_nl"] == "Een fles"


@pytest.mark.anyio
async def test_missing_type_rolls_back_check_in(client):
    event = await _create_event(client, edition_type="capsule_exchange")
    registration = (await _post_registration(client, event=event)).json()
    result = await check(client, registration)
    assert result.status_code == 409
    assert result.json()["code"] == "stamp_card_type_not_configured"
    assert not (await client.get(f"/api/registrations/{registration['id']}")).json()["checked_in"]


@pytest.mark.anyio
async def test_stamp_admin_auth(unauth_client):
    assert (await unauth_client.get("/api/stamp-cards/types")).status_code == 401


@pytest.mark.anyio
async def test_stamp_validation(client):
    for body in ({**TYPE, "box_count": 0}, {**TYPE, "name_nl": ""}):
        assert (await client.post("/api/stamp-cards/types", json=body)).status_code == 422
    assert (await client.put("/api/settings", json={"stamp_card_type_id": "missing"})).status_code == 409


@pytest.mark.anyio
@requires_postgres("row locks serialize concurrent attendance for one member")
async def test_concurrent_check_ins(client, engine, db_session):
    _, event, first = await setup_card(client, boxes=2)
    second = (await _post_registration(client, event=event)).json()
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def attend(registration_id):
        async with factory() as db:
            registration = await db.scalar(
                select(Registration).where(Registration.id == registration_id).with_for_update()
            )
            assert registration is not None
            await service.sync_check_in(db, registration, True)
            registration.checked_in = True
            await db.commit()

    await asyncio.gather(attend(first["id"]), attend(second["id"]), attend(first["id"]))
    assert await db_session.scalar(select(func.count()).select_from(Stamp)) == 2
    assert await db_session.scalar(select(func.count()).select_from(StampCard)) == 1
    assert await db_session.scalar(select(func.count()).select_from(StampCardReward)) == 1


@pytest.mark.anyio
async def test_next_card_waits_for_hand_out_and_prevents_older_reversal(client):
    _, event, first = await setup_card(client, boxes=1)
    assert (await check(client, first)).json()["stamp_progress"]["reward_earned"]
    cards_url = f"/api/stamp-cards/people/{first['person_id']}"
    cards = (await client.get(cards_url)).json()
    reward_url = f"/api/stamp-cards/rewards/{cards[0]['reward']['id']}"
    next_type = (await client.post("/api/stamp-cards/types", json={**TYPE, "box_count": 3})).json()
    await client.put("/api/settings", json={"stamp_card_type_id": next_type["id"]})
    second = (await _post_registration(client, event=event)).json()
    refused = await check(client, second)
    assert refused.status_code == 409
    assert refused.json()["code"] == "stamp_reward_pending"
    detail = (await client.get(f"/api/registrations/{second['id']}")).json()
    assert not detail["checked_in"]
    qr = await client.post(f"/api/check-in/{second['id']}", json={"token": detail["check_in_token"]})
    assert qr.status_code == 409
    assert qr.json()["code"] == "stamp_reward_pending"
    assert (await client.get(cards_url)).json() == cards
    # Before hand-out, reversing attendance reopens this same card.
    assert (await check(client, first, False)).json()["stamp_progress"]["stamps"] == 0
    assert len((await client.get(cards_url)).json()) == 1
    await check(client, first)
    cards = (await client.get(cards_url)).json()
    reward_url = f"/api/stamp-cards/rewards/{cards[0]['reward']['id']}"
    assert (await client.put(reward_url, json={"handed_out": True})).status_code == 200
    assert (await check(client, second)).json()["stamp_progress"]["box_count"] == 3
    refused = await client.put(reward_url, json={"handed_out": False})
    assert refused.status_code == 409
    assert refused.json()["code"] == "stamp_card_has_successor"
    assert (await check(client, first, False)).json()["code"] == "stamp_reward_handed_out"
    cards = (await client.get(cards_url)).json()
    assert len(cards) == 2
    assert cards[0]["completed_at"] and cards[0]["reward"]["handed_out_at"]
    assert cards[1]["completed_at"] is None


@pytest.mark.anyio
async def test_stamp_history_survives_anonymisation(client):
    _, _, first = await setup_card(client, boxes=1)
    await check(client, first)
    person_id = first["person_id"]
    original = (await client.get(f"/api/stamp-cards/people/{person_id}")).json()
    response = await client.post(f"/api/people/{person_id}/anonymise")
    assert response.status_code == 200, response.text
    assert (await client.get(f"/api/stamp-cards/people/{person_id}")).json() == original
    response = await client.delete(f"/api/people/{person_id}")
    assert response.status_code == 409
    assert response.json()["code"] == "person_has_stamp_cards"


@pytest.mark.anyio
async def test_stamp_guards_registration_delete_and_reassignment(client):
    _, _, first = await setup_card(client)
    await check(client, first)
    response = await client.delete(f"/api/registrations/{first['id']}")
    assert response.status_code == 409
    assert response.json()["code"] == "registration_has_stamp"
    other = (await client.post("/api/people", json={"name": "Other"})).json()
    response = await client.put(f"/api/registrations/{first['id']}", json={"person_id": other["id"]})
    assert response.status_code == 409
    assert response.json()["code"] == "registration_has_stamp"


@pytest.mark.anyio
async def test_mcp_check_in_and_reward_share_services(client, db_session, monkeypatch):
    from app.mcp_server import ChampagneFestivalMcpBackend
    from tests.helpers import mcp_session_factory

    backend = ChampagneFestivalMcpBackend(mcp_session_factory(db_session))
    monkeypatch.setattr(backend, "_require_admin", lambda: None)
    monkeypatch.setattr(backend, "_actor", lambda: "admin-test")
    card_type = await backend.save_stamp_card_type(name_nl="Kaart", box_count=1, reward_label_nl="Beloning")
    await backend.select_stamp_card_type(card_type["id"])
    event = await _create_event(client, edition_type="capsule_exchange")
    first = (await _post_registration(client, event=event)).json()
    result = await backend.check_in(first["id"])
    assert result["stamp_progress"]["reward_earned"]
    cards = await backend.get_person_stamp_cards(first["person_id"])
    reward = await backend.set_stamp_reward_handed_out(cards[0]["reward"]["id"], True)
    assert reward["handed_out_by"] == "admin-test"
    assert (await backend.list_stamp_card_types())[0]["id"] == card_type["id"]
    await backend.set_stamp_reward_handed_out(reward["id"], False)
    result = await backend.update_registration(first["id"], checked_in=False)
    assert result["stamp_progress"]["stamps"] == 0


@pytest.mark.anyio
async def test_non_capsule_attendance_is_not_stamped(client):
    first = (await _post_registration(client)).json()
    response = await check(client, first)
    assert response.status_code == 200
    assert response.json()["stamp_progress"] is None
    assert (await client.get(f"/api/stamp-cards/people/{first['person_id']}")).json() == []


@pytest.mark.anyio
async def test_stamp_merge_preserves_card_snapshots(client):
    _, _, first = await setup_card(client, boxes=1)
    await check(client, first)
    canonical = (await client.post("/api/people", json={"name": "Canonical"})).json()
    original = (await client.get(f"/api/stamp-cards/people/{first['person_id']}")).json()
    response = await client.post(f"/api/people/{canonical['id']}/merge/{first['person_id']}")
    assert response.status_code == 200, response.text
    cards = (await client.get(f"/api/stamp-cards/people/{canonical['id']}")).json()
    assert cards == [{**original[0], "person_id": canonical["id"]}]
    assert (await client.get(f"/api/registrations/{first['id']}")).json()["person_id"] == canonical["id"]


def test_stamp_openapi_contract():
    from app.main import app

    schema = app.openapi()
    assert schema["paths"]["/api/stamp-cards/types"]["post"]["responses"]["201"]["content"]["application/json"][
        "schema"
    ]["$ref"].endswith("/StampCardTypeOut")
    assert "stamp_progress" in schema["components"]["schemas"]["CheckInOut"]["properties"]
    assert "stamp_progress" in schema["components"]["schemas"]["RegistrationOut"]["properties"]


@pytest.mark.anyio
async def test_reward_due_filter_counts_and_export(client):
    _, _, registration = await setup_card(client, boxes=1)
    assert (await check(client, registration)).status_code == 200
    person_id = registration["person_id"]
    people = (await client.get("/api/people?reward_due=true&limit=1")).json()
    assert people["total"] == 1
    assert people["items"][0]["id"] == person_id
    assert people["items"][0]["reward_due"] is True
    assert (await client.get("/api/people/counts?reward_due=true")).json()["total"] == 1
    assert (await client.get("/api/people?reward_due=false")).json()["total"] == 0
    assert people["items"][0]["name"] in (await client.get("/api/people/export?reward_due=true")).text
    cards = (await client.get(f"/api/stamp-cards/people/{person_id}")).json()
    await client.put(f"/api/stamp-cards/rewards/{cards[0]['reward']['id']}", json={"handed_out": True})
    assert (await client.get("/api/people?reward_due=true")).json()["total"] == 0
    assert (await client.get("/api/people/counts?reward_due=true")).json()["total"] == 0
    assert (await client.get("/api/people?reward_due=false")).json()["items"][0]["reward_due"] is False


@pytest.mark.anyio
async def test_manual_volunteer_check_in_returns_stamp_feedback_and_is_repeatable(client):
    _, _, registration = await setup_card(client, boxes=1)
    url = f"/api/volunteer/registrations/{registration['id']}/check-in"
    first = await client.post(url, json={"issue_strap": False})
    assert first.status_code == 200, first.text
    assert first.json()["stamp_progress"]["reward_earned"] is True
    again = await client.post(url, json={"issue_strap": False})
    assert again.status_code == 200, again.text
    assert again.json()["already_checked_in"] is True
    assert again.json()["stamp_progress"] == first.json()["stamp_progress"]


@pytest.mark.anyio
async def test_manual_volunteer_missing_type_rolls_back(client):
    event = await _create_event(client, edition_type="capsule_exchange")
    registration = (await _post_registration(client, event=event)).json()
    response = await client.post(f"/api/volunteer/registrations/{registration['id']}/check-in", json={})
    assert response.status_code == 409
    assert response.json()["code"] == "stamp_card_type_not_configured"
    assert not (await client.get(f"/api/registrations/{registration['id']}")).json()["checked_in"]
