"""Shared helpers for the volunteer poll tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.auth import require_admin
from app.database import get_db
from app.main import app
from tests.helpers import ADMIN_HEADERS

NISS_A = "91010112319"
EID_A = "123456789002"
NISS_B = "91010112418"
EID_B = "123456789103"

PAST = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
FUTURE = (datetime.now(UTC) + timedelta(days=1)).isoformat()


async def create_question(client, edition_id: str, kind: str = "meals", title_nl: str = "Maaltijden", **extra) -> dict:
    r = await client.post(
        "/api/poll-questions",
        json={"edition_id": edition_id, "kind": kind, "title_nl": title_nl, **extra},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def create_option(client, question_id: str, label_nl: str, **extra) -> dict:
    r = await client.post(
        "/api/poll-options", json={"question_id": question_id, "label_nl": label_nl, **extra}, headers=ADMIN_HEADERS
    )
    assert r.status_code == 201, r.text
    return r.json()


async def questions(client, edition_id: str, **params) -> list[dict]:
    r = await client.get("/api/poll-questions", params={"edition_id": edition_id, **params}, headers=ADMIN_HEADERS)
    assert r.status_code == 200, r.text
    return r.json()


async def register(vclient, *, name="Sofie De Smet", niss=NISS_A, eid=EID_A):
    return await vclient.post(
        "/api/me/volunteer/register",
        json={"name": name, "national_register_number": niss, "eid_document_number": eid},
    )


def picks(*pairs: tuple[dict, int]) -> dict:
    return {"selections": [{"option_id": option["id"], "quantity": quantity} for option, quantity in pairs]}


class Volunteers:
    """Volunteer requests made one at a time: ``volunteer_client_as`` rejects admin calls while it is open
    and clears every dependency override when it closes, so the admin overrides are restored after each."""

    def __init__(self, volunteer_client_as, db_session):
        self.factory = volunteer_client_as
        self.db_session = db_session

    async def call(self, subject: str, method: str, url: str, **kwargs):
        async with self.factory(subject) as vclient:
            response = await getattr(vclient, method)(url, **kwargs)
        self._restore_admin()
        return response

    async def register(self, subject: str, **kwargs):
        async with self.factory(subject) as vclient:
            response = await register(vclient, **kwargs)
        self._restore_admin()
        assert response.status_code == 200, response.text

    def _restore_admin(self):
        async def override_get_db():
            yield self.db_session

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[require_admin] = lambda: None
