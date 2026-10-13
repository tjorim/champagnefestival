"""Role history: when each role was held, and the retired-role index derived from it."""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.models import Person
from app.services import role_history as rh
from tests.test_people import ADMIN_HEADERS


def _person(**kwargs) -> Person:
    return Person(id="per_test", name="Test", roles=[], retired_roles={}, role_history={}, **kwargs)


TODAY = date.today().isoformat()


def test_granting_a_role_opens_a_stretch_and_is_idempotent():
    person = _person()
    rh.sync_roles(person, ["member"])
    assert person.role_history == {"member": [{"started_on": TODAY, "ended_on": None}]}
    rh.grant_role(person, "member")
    assert len(person.role_history["member"]) == 1


def test_retiring_closes_the_stretch_and_reactivating_opens_a_new_one():
    person = _person()
    rh.grant_role(person, "volunteer", started_on=date(2024, 3, 21))
    person.roles = ["volunteer"]

    assert rh.retire_role(person, "volunteer") is True
    assert person.retired_roles == {"volunteer": TODAY}
    assert person.role_history["volunteer"] == [{"started_on": "2024-03-21", "ended_on": TODAY}]
    assert rh.retire_role(person, "volunteer") is False

    assert rh.reactivate_role(person, "volunteer") is True
    assert person.retired_roles == {}
    assert person.role_history["volunteer"] == [
        {"started_on": "2024-03-21", "ended_on": TODAY},
        {"started_on": TODAY, "ended_on": None},
    ]
    assert rh.reactivate_role(person, "volunteer") is False


def test_a_legacy_role_without_history_retires_with_an_unknown_start():
    person = _person()
    person.roles = ["member"]
    assert rh.role_since(person, "member") is None
    assert rh.retire_role(person, "member") is True
    assert person.role_history["member"] == [{"started_on": None, "ended_on": TODAY}]


def test_removing_a_role_closes_its_stretch_and_forgets_the_retirement():
    person = _person()
    rh.sync_roles(person, ["member", "volunteer"])
    rh.retire_role(person, "member")
    rh.sync_roles(person, ["volunteer"])
    assert person.retired_roles == {}
    assert person.role_history["member"][-1]["ended_on"] is not None
    # Adding it again starts a fresh, active stretch.
    rh.sync_roles(person, ["member", "volunteer"])
    assert person.role_history["member"][-1] == {"started_on": TODAY, "ended_on": None}
    assert "member" not in person.retired_roles


def test_set_role_start_edits_the_latest_stretch_and_rejects_a_start_after_its_end():
    person = _person()
    person.roles = ["member"]
    rh.set_role_start(person, "member", date(2023, 1, 1))
    assert rh.role_since(person, "member") == "2023-01-01"
    rh.retire_role(person, "member")
    rh.set_role_start(person, "member", date(2022, 5, 5))
    assert person.role_history["member"][-1] == {"started_on": "2022-05-05", "ended_on": TODAY}
    with pytest.raises(HTTPException) as error:
        rh.set_role_start(person, "member", date.today() + timedelta(days=1))
    assert error.value.status_code == 422


@pytest.mark.anyio
async def test_member_since_and_history_through_the_api(client):
    created = await client.post(
        "/api/members",
        json={"name": "Since Sam", "email": "since.sam@example.com", "member_since": "2021-04-02"},
        headers=ADMIN_HEADERS,
    )
    assert created.status_code == 201
    member_id = created.json()["id"]
    assert created.json()["role_history"] == {"member": [{"started_on": "2021-04-02", "ended_on": None}]}

    await client.post(f"/api/members/{member_id}/deactivate", headers=ADMIN_HEADERS)
    await client.post(f"/api/members/{member_id}/reactivate", headers=ADMIN_HEADERS)
    person = (await client.get(f"/api/people/{member_id}", headers=ADMIN_HEADERS)).json()
    assert person["role_history"]["member"] == [
        {"started_on": "2021-04-02", "ended_on": TODAY},
        {"started_on": TODAY, "ended_on": None},
    ]
    assert person["retired_roles"] == {}

    updated = await client.put(f"/api/members/{member_id}", json={"member_since": "2020-01-01"}, headers=ADMIN_HEADERS)
    assert updated.status_code == 200
    assert updated.json()["role_history"]["member"][-1]["started_on"] == "2020-01-01"

    # member_since belongs to the member endpoints; the generic people endpoints refuse it.
    refused = await client.put(f"/api/people/{member_id}", json={"member_since": "2020-01-01"}, headers=ADMIN_HEADERS)
    assert refused.status_code == 422
    refused = await client.post(
        "/api/people", json={"name": "Nope", "member_since": "2020-01-01"}, headers=ADMIN_HEADERS
    )
    assert refused.status_code == 422


@pytest.mark.anyio
async def test_a_volunteer_starts_on_their_first_help_day(client):
    created = await client.post(
        "/api/volunteers",
        json={
            "name": "First Day",
            "national_register_number": "85010188888",
            "eid_document_number": "BEI111222",
            "help_periods": [
                {"first_help_day": "2025-03-22", "last_help_day": "2025-03-23"},
                {"first_help_day": "2024-03-16", "last_help_day": "2024-03-17"},
            ],
        },
        headers=ADMIN_HEADERS,
    )
    assert created.status_code == 201
    assert created.json()["role_history"] == {"volunteer": [{"started_on": "2024-03-16", "ended_on": None}]}
