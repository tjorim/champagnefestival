"""Proposal privacy, review races, live-edit precedence and durable retry contracts."""

import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.auth import require_admin
from app.config import settings
from app.main import app
from app.models import AuditEntry, OrganizationChange, OutboxJob
from app.schemas import OrganizationChangeSubmit
from app.services import organization_changes
from app.services.errors import ConflictError
from tests import test_my_organizations
from tests.conftest import ADMIN_HEADERS

manager = test_my_organizations.manager
login = test_my_organizations.login


async def propose(client, row, **values):
    return await client.post(f"/api/me/organizations/{row.id}/changes", json={"submission_id": str(uuid4()), **values})


async def decision(client, change, value, reason=None):
    return await client.post(
        f"/api/organizations/changes/{change['id']}/decision",
        json={"decision": value, "reason": reason},
        headers=ADMIN_HEADERS,
    )


async def test_private_until_accept_and_retry(client, db_session, manager, monkeypatch):
    monkeypatch.setattr(settings, "organization_review_recipient", "review@example.com")
    await login(client, manager)
    row = manager[1][0]
    body = {
        "submission_id": str(uuid4()),
        "website": "https://new.example",
        "description_language": "fr",
        "description_fr": "Bonjour",
        "description_en": "Hello",
    }
    url = f"/api/me/organizations/{row.id}/changes"
    response = await client.post(url, json=body)
    assert response.status_code == 200
    change = response.json()
    assert (await client.post(url, json=body)).json() == change
    assert len((await db_session.scalars(select(OutboxJob))).all()) == 1
    live = (await client.get("/api/organizations", headers=ADMIN_HEADERS)).json()[0]
    assert live["website"] == "" and live["description_fr"] is None
    # Public edition payload is assembled exclusively from the live organization.
    from tests.helpers import _create_event

    row.type = "producer"
    await db_session.commit()
    await _create_event(client)
    linked = await client.put("/api/editions/edition-public", json={"organizations": [row.id]}, headers=ADMIN_HEADERS)
    assert linked.status_code == 200
    public = await client.get("/api/editions/active")
    assert public.status_code == 200
    assert [item["id"] for item in public.json()["producers"]] == [row.id]
    assert "Bonjour" not in public.text and "new.example" not in public.text
    pending = (await client.get("/api/organizations/changes", headers=ADMIN_HEADERS)).json()
    assert pending[0]["current"]["description_fr"] is None
    assert pending[0]["proposed"]["description_fr"] == "Bonjour"
    assert (await decision(client, change, "accepted")).status_code == 200
    assert (await decision(client, change, "accepted")).status_code == 200
    assert (await decision(client, change, "rejected")).status_code == 409
    await db_session.refresh(row)
    assert row.website == body["website"] and row.description_fr == "Bonjour"
    published = await client.get("/api/editions/active")
    assert "Bonjour" in published.text and "new.example" in published.text
    actions = (
        await db_session.scalars(
            select(AuditEntry)
            .where(AuditEntry.action.like("organization_change_%"))
            .order_by(AuditEntry.timestamp, AuditEntry.id)
        )
    ).all()
    assert [entry.action for entry in actions] == ["organization_change_submitted", "organization_change_accepted"]
    assert all(entry.actor for entry in actions)


async def test_replacement_rejection_and_no_notification(client, db_session, manager, monkeypatch):
    monkeypatch.setattr(settings, "organization_review_recipient", "")
    await login(client, manager)
    row = manager[1][0]
    first = (await propose(client, row, website="https://first.example")).json()
    second = (await propose(client, row, website="https://second.example")).json()
    assert (await decision(client, first, "accepted")).status_code == 409
    assert (await decision(client, second, "rejected", "Please correct the link")).status_code == 200
    assert (await decision(client, second, "rejected", "different retry reason")).json()[
        "reason"
    ] == "Please correct the link"
    history = (await client.get(f"/api/me/organizations/{row.id}/changes")).json()
    assert [change["status"] for change in history] == ["rejected", "replaced"]
    assert history[0]["reason"] == "Please correct the link"
    assert row.website == ""
    assert not (await db_session.scalars(select(OutboxJob))).all()


async def test_admin_edit_supersedes_only_matching_fields(client, db_session, manager):
    await login(client, manager)
    row = manager[1][0]
    change = (
        await propose(
            client, row, website="https://proposal.example", description_language="nl", description_nl="Voorstel"
        )
    ).json()
    update = await client.put(
        f"/api/organizations/{row.id}", json={"website": "https://admin.example"}, headers=ADMIN_HEADERS
    )
    assert update.status_code == 200
    history = (await client.get(f"/api/me/organizations/{row.id}/changes")).json()[0]
    assert history["superseded_fields"] == ["website"] and "website" not in history["proposed"]
    assert (await decision(client, change, "accepted")).status_code == 200
    await db_session.refresh(row)
    assert row.website == "https://admin.example" and row.description_nl == "Voorstel"
    second = (await propose(client, row, website="https://other.example")).json()
    await client.put(f"/api/organizations/{row.id}", json={"website": ""}, headers=ADMIN_HEADERS)
    assert (await decision(client, second, "accepted")).status_code == 409
    assert (await client.get(f"/api/me/organizations/{row.id}/changes")).json()[0]["status"] == "superseded"
    audits = (
        await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "organization_change_superseded"))
    ).all()
    assert len(audits) == 2 and all(a.actor for a in audits)


async def test_authorization_and_validation(client, db_session, manager, monkeypatch):
    await login(client, manager)
    row = manager[1][0]
    other = manager[1][2]
    assert (await propose(client, other, website="https://private.example")).status_code == 404
    assert (await client.get(f"/api/me/organizations/{other.id}/changes")).status_code == 404
    assert (await client.get("/api/me/organizations/999999/changes")).status_code == 404
    assert (await propose(client, row, website="javascript:alert(1)")).status_code == 422
    assert (await propose(client, row, name="Forbidden")).status_code == 422
    assert (await propose(client, row, description_fr="Missing original")).status_code == 400
    assert (await propose(client, row, description_nl="a" * 601)).status_code == 422
    change = (await propose(client, row, website="https://safe.example")).json()
    app.dependency_overrides.pop(require_admin)
    import app.auth as auth

    claims = {"sub": "reviewer", "realm_access": {"roles": []}}

    async def decode(_token):
        return claims

    monkeypatch.setattr(auth, "decode_token", decode)
    for role in ["member", "volunteer"]:
        claims["realm_access"]["roles"] = [role]
        assert (await decision(client, change, "accepted")).status_code == 403
        assert (await decision(client, change, "rejected")).status_code == 403
        assert (await client.get("/api/organizations/changes", headers=ADMIN_HEADERS)).status_code == 403
    claims["realm_access"]["roles"] = ["admin"]
    assert (await decision(client, change, "accepted")).status_code == 200
    accepted_audit = await db_session.scalar(
        select(AuditEntry).where(AuditEntry.action == "organization_change_accepted")
    )
    assert accepted_audit is not None and accepted_audit.actor == "reviewer"


async def test_concurrent_decisions(engine, db_session, manager):
    row = manager[1][0]
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        locked = await organization_changes.lock_organization(db, row.id)
        change = await organization_changes.submit(
            db,
            locked,
            OrganizationChangeSubmit(submission_id=uuid4(), website="https://race.example"),
            actor="manager",
            auth_source="visitor",
        )

    async def run(value):
        async with factory() as db:
            try:
                return await organization_changes.decide(db, change["id"], value, None, actor=value)
            except ConflictError:
                return "conflict"

    results = await asyncio.gather(run("accepted"), run("rejected"))
    assert results.count("conflict") == 1
    async with factory() as db:
        recorded = await db.get(OrganizationChange, change["id"])
        assert recorded is not None
        replay = await organization_changes.decide(db, change["id"], recorded.status, None, actor="retry")
        assert replay["status"] == recorded.status
        actions = (
            await db.scalars(
                select(AuditEntry).where(
                    AuditEntry.action.in_(["organization_change_accepted", "organization_change_rejected"])
                )
            )
        ).all()
        assert len(actions) == 1


async def test_notification_uses_configured_recipient(db_session, manager, monkeypatch):
    import app.email as email

    monkeypatch.setattr(settings, "organization_review_recipient", "shared@example.com")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from", "from@example.com")
    row = await organization_changes.lock_organization(db_session, manager[1][0].id)
    change = await organization_changes.submit(
        db_session,
        row,
        OrganizationChangeSubmit(submission_id=uuid4(), website=""),
        actor="manager",
        auth_source="visitor",
    )
    # Delivery loads the durable record from a fresh session in production.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session():
        yield db_session

    monkeypatch.setattr(email, "async_session_factory", session)
    sent = []
    monkeypatch.setattr(email, "_send_message_sync", lambda message: sent.append(message))
    monkeypatch.setattr(settings, "organization_review_recipient", "changed@example.com")
    assert await email.deliver_organization_change_notification(change["id"])
    assert len(sent) == 1 and sent[0]["To"] == "shared@example.com"
    assert "awaiting review" in sent[0]["Subject"]


async def test_original_clear_supersedes_dependent_translation(client, db_session, manager):
    await login(client, manager)
    row = manager[1][0]
    await client.put(
        f"/api/organizations/{row.id}",
        json={"description_language": "nl", "description_nl": "Live"},
        headers=ADMIN_HEADERS,
    )
    change = (await propose(client, row, description_fr="Translation", website="https://proposal.example")).json()
    await client.put(
        f"/api/organizations/{row.id}",
        json={"description_language": None, "description_nl": None},
        headers=ADMIN_HEADERS,
    )
    pending = (await client.get(f"/api/me/organizations/{row.id}/changes")).json()[0]
    assert pending["superseded_fields"] == ["description_fr"]
    assert pending["proposed"] == {"website": "https://proposal.example"}
    assert (await decision(client, change, "accepted")).status_code == 200
    await db_session.refresh(row)
    assert row.description_fr is None and row.website == "https://proposal.example"


async def test_submission_id_conflict_and_replay_after_replacement(client, manager):
    await login(client, manager)
    row = manager[1][0]
    body = {"submission_id": str(uuid4()), "website": "https://first.example"}
    url = f"/api/me/organizations/{row.id}/changes"
    assert (await client.post(url, json=body)).status_code == 200
    assert (await client.post(url, json={**body, "website": "https://different.example"})).status_code == 409
    await propose(client, row, website="https://replacement.example")
    replay = await client.post(url, json=body)
    assert replay.status_code == 200 and replay.json()["status"] == "replaced"
    pending = (await client.get("/api/organizations/changes", headers=ADMIN_HEADERS)).json()
    assert len(pending) == 1 and pending[0]["proposed"]["website"] == "https://replacement.example"


async def test_mcp_review_authorization_and_supersession(db_session, manager, monkeypatch):
    from app.mcp.admin import organizations as mcp_organizations
    from app.mcp_server import ChampagneFestivalMcpBackend
    from tests.helpers import mcp_session_factory

    backend = ChampagneFestivalMcpBackend(mcp_session_factory(db_session))
    monkeypatch.setattr(backend, "_resolve_role", lambda: "volunteer")
    with pytest.raises(PermissionError):
        await backend.list_organization_changes()
    with pytest.raises(PermissionError):
        await backend.decide_organization_change("unknown", "accepted")
    monkeypatch.setattr(backend, "_resolve_role", lambda: "admin")
    monkeypatch.setattr(backend, "_actor", lambda: "mcp-admin")
    row = await organization_changes.lock_organization(db_session, manager[1][0].id)
    change = await organization_changes.submit(
        db_session,
        row,
        OrganizationChangeSubmit(submission_id=uuid4(), website="https://proposal.example"),
        actor="manager",
        auth_source="visitor",
    )
    assert len((await backend.list_organization_changes())["changes"]) == 1
    await mcp_organizations.update_organization(
        mcp_session_factory(db_session), "mcp-admin", row.id, website="https://admin.example"
    )
    with pytest.raises(ValueError, match="superseded"):
        await backend.decide_organization_change(change["id"], "accepted")
    await db_session.rollback()
