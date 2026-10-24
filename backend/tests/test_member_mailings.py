"""Member mailings (#1407): the composer email channel, suppression and one-click unsubscribe.

The sending service is not chosen, so a fake provider stands in; the shipped configuration refuses
the channel (see ``test_email_channel_refused_while_member_mail_is_unavailable``).
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app import member_mail
from app.composer_delivery import deliver_composer_email, deliver_composer_message_dispatch
from app.config import settings
from app.database import async_session_factory
from app.member_mail import (
    MemberMail,
    MemberMailRejected,
    MemberMailResult,
    MemberMailSkipped,
    MemberMailUnavailable,
    MemberMailUncertain,
)
from app.models import AuditEntry, EmailConsent, EmailSuppression, OutboxJob
from app.services import email_suppression_service, member_mail_unsubscribe
from app.services.outbox_service import process_one_job
from tests.helpers import ADMIN_HEADERS, _add_consent

SIGNING_KEY = "k" * 40


class FakeProvider:
    def __init__(self) -> None:
        self.sent: list[MemberMail] = []
        self.status = "accepted"
        self.error: Exception | None = None

    async def send(self, mail: MemberMail) -> MemberMailResult:
        self.sent.append(mail)
        if self.error is not None:
            raise self.error
        return MemberMailResult(status=self.status)  # ty: ignore[invalid-argument-type]


@pytest.fixture
def provider(monkeypatch) -> FakeProvider:
    fake = FakeProvider()
    monkeypatch.setattr(settings, "member_mail_from", "club@mail.example.org")
    monkeypatch.setattr(settings, "member_mail_signing_key", SIGNING_KEY)
    monkeypatch.setattr(settings, "frontend_url", "https://festival.example.org")
    monkeypatch.setattr(member_mail, "member_mail_available", lambda config=settings: True)
    monkeypatch.setattr(member_mail, "get_member_mail_provider", lambda config=settings: fake)
    return fake


async def _person(client, name: str, email: str | None, roles=("member",), **extra) -> str:
    body = {"name": name, "roles": list(roles), **extra}
    if email:
        body["email"] = email
    r = await client.post("/api/people", json=body, headers=ADMIN_HEADERS)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _draft(**overrides) -> dict:
    body = {
        "title_nl": "Capsule-ruilbeurs",
        "title_en": "Capsule exchange",
        "body_nl": "Zaterdag is de ruilbeurs.",
        "body_en": "The exchange is on Saturday.",
        "channels": ["email"],
        "email_category_key": "club_news",
    }
    body.update(overrides)
    return body


async def _send(client, **overrides) -> str:
    created = await client.post("/api/composer", json=_draft(**overrides), headers=ADMIN_HEADERS)
    assert created.status_code == 201, created.text
    message_id = created.json()["id"]
    scheduled = await client.post(
        f"/api/composer/{message_id}/schedule",
        json={"expected_email_audience": created.json()["estimated_email_audience"]},
        headers=ADMIN_HEADERS,
    )
    assert scheduled.status_code == 200, scheduled.text
    assert await deliver_composer_message_dispatch(message_id) is True
    return message_id


async def _noop(_resource_id: str) -> bool:
    return True


async def _deliver_all(db_session, message_id: str) -> dict[str, str]:
    """Run the recipient jobs like the worker does; returns person id -> job state."""
    for job in (await db_session.scalars(select(OutboxJob).where(OutboxJob.state == "pending"))).all():
        job.scheduled_at = job.created_at  # staggered jobs are due later; make them due
    await db_session.commit()
    handlers = {
        # _send() already ran the dispatch handler directly; this only drains its own job.
        "composer_message_dispatch": _noop,
        "composer_message_email": deliver_composer_email,
    }
    while await process_one_job(async_session_factory, handlers):
        pass
    db_session.expire_all()
    rows = (
        await db_session.scalars(
            select(OutboxJob).where(
                OutboxJob.job_type == "composer_message_email", OutboxJob.resource_id.startswith(f"{message_id}:")
            )
        )
    ).all()
    return {job.resource_id.split(":", 1)[1]: job.state for job in rows}


# --- the channel is fail-closed ----------------------------------------------------------------------------


async def test_email_channel_refused_while_member_mail_is_unavailable(client):
    created = await client.post("/api/composer", json=_draft(), headers=ADMIN_HEADERS)
    assert created.status_code == 201
    r = await client.post(f"/api/composer/{created.json()['id']}/schedule", json={}, headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert r.json()["code"] == "member_mail_unavailable"


async def test_email_send_needs_the_confirmed_recipient_count(client, provider, db_session):
    await _add_consent(db_session, await _person(client, "Ann", "ann@example.org"), "club_news")
    message_id = (await client.post("/api/composer", json=_draft(), headers=ADMIN_HEADERS)).json()["id"]
    url = f"/api/composer/{message_id}/schedule"

    missing = await client.post(url, json={}, headers=ADMIN_HEADERS)
    assert (missing.status_code, missing.json()["code"]) == (400, "email_audience_confirmation_required")
    stale = await client.post(url, json={"expected_email_audience": 5}, headers=ADMIN_HEADERS)
    assert (stale.status_code, stale.json()["code"]) == (409, "email_audience_changed")
    assert (await client.get(f"/api/composer/{message_id}", headers=ADMIN_HEADERS)).json()["state"] == "draft"
    ok = await client.post(url, json={"expected_email_audience": 1}, headers=ADMIN_HEADERS)
    assert ok.status_code == 200


async def test_email_channel_needs_a_category_and_only_then(client):
    missing = await client.post("/api/composer", json=_draft(email_category_key=None), headers=ADMIN_HEADERS)
    assert missing.status_code == 422
    stray = await client.post(
        "/api/composer", json=_draft(channels=["announcement"], email_category_key="club_news"), headers=ADMIN_HEADERS
    )
    assert stray.status_code == 422


async def test_automatic_and_unknown_categories_cannot_be_composed(client):
    automatic = await client.post(
        "/api/composer", json=_draft(email_category_key="reward_ready"), headers=ADMIN_HEADERS
    )
    assert automatic.status_code == 400
    assert automatic.json()["code"] == "email_category_automatic"
    unknown = await client.post("/api/composer", json=_draft(email_category_key="nope"), headers=ADMIN_HEADERS)
    assert unknown.status_code == 404
    assert unknown.json()["code"] == "email_category_not_found"


async def test_dispatch_waits_when_member_mail_stops_being_available(client, provider, monkeypatch, db_session):
    created = await client.post("/api/composer", json=_draft(channels=["announcement", "email"]), headers=ADMIN_HEADERS)
    message_id = created.json()["id"]
    await client.post(
        f"/api/composer/{message_id}/schedule", json={"expected_email_audience": 0}, headers=ADMIN_HEADERS
    )
    monkeypatch.setattr(member_mail, "member_mail_available", lambda config=settings: False)

    assert await deliver_composer_message_dispatch(message_id) is False

    refreshed = await client.get(f"/api/composer/{message_id}", headers=ADMIN_HEADERS)
    assert refreshed.json()["state"] == "scheduled"
    assert refreshed.json()["announcement_id"] is None


# --- audience ----------------------------------------------------------------------------------------------


async def test_audience_is_consented_eligible_unsuppressed_and_one_per_address(client, provider, db_session):
    ann = await _person(client, "Ann", "ann@example.org")
    bob = await _person(client, "Bob", "bob@example.org")
    await _person(client, "No consent", "nc@example.org")
    wrong_role = await _person(client, "Visitor", "visitor@example.org", roles=("volunteer",))
    no_address = await _person(client, "Nomail", None)
    suppressed = await _person(client, "Bounced", "bounced@example.org")
    withdrawn = await _person(client, "Withdrawn", "withdrawn@example.org")
    for person_id in (ann, bob, wrong_role, no_address, suppressed):
        await _add_consent(db_session, person_id, "club_news")
    from datetime import UTC, datetime

    await _add_consent(db_session, withdrawn, "club_news", revoked_at=datetime.now(UTC), revoked_source="self_service")
    await email_suppression_service.suppress(db_session, "Bounced@Example.org", "hard_bounce")
    await db_session.commit()

    created = await client.post("/api/composer", json=_draft(), headers=ADMIN_HEADERS)
    assert created.json()["estimated_email_audience"] == 2

    message_id = await _send(client)
    message = (await client.get(f"/api/composer/{message_id}", headers=ADMIN_HEADERS)).json()
    assert sorted(message["email_audience_snapshot"]) == sorted([ann, bob])


async def test_people_sharing_an_address_are_mailed_once(client, provider, db_session):
    member = await _person(client, "Ann", "ann@example.org")
    volunteer = await _person(client, "Twin", "ANN@example.org", roles=("volunteer",))
    await _add_consent(db_session, member, "new_editions")
    await _add_consent(db_session, volunteer, "new_editions")
    message_id = await _send(client, email_category_key="new_editions")
    message = (await client.get(f"/api/composer/{message_id}", headers=ADMIN_HEADERS)).json()
    assert message["email_audience_snapshot"] == [member]


async def test_suppress_is_convergent_and_keeps_only_a_hash(db_session):
    await email_suppression_service.suppress(db_session, " Foo@Example.org ", "hard_bounce")
    await email_suppression_service.suppress(db_session, "foo@example.org", "complaint")
    await db_session.commit()
    rows = (await db_session.scalars(select(EmailSuppression))).all()
    assert len(rows) == 1
    assert rows[0].reason == "hard_bounce"
    assert "foo" not in rows[0].address_hash
    assert await email_suppression_service.is_suppressed(db_session, "FOO@example.org")
    assert not await email_suppression_service.is_suppressed(db_session, "bar@example.org")


# --- delivery ----------------------------------------------------------------------------------------------


async def test_each_recipient_gets_one_mail_in_their_language_with_unsubscribe(client, provider, db_session):
    nl = await _person(client, "Nl", "nl@example.org")
    en = await _person(client, "En", "en@example.org", preferred_language="en")
    fr = await _person(client, "Fr", "fr@example.org", preferred_language="fr")  # no French text: Dutch
    for person_id in (nl, en, fr):
        await _add_consent(db_session, person_id, "club_news")

    message_id = await _send(client)
    states = await _deliver_all(db_session, message_id)

    assert states == {nl: "delivered", en: "delivered", fr: "delivered"}
    by_recipient = {str(mail.recipient): mail for mail in provider.sent}
    assert len(provider.sent) == 3
    assert by_recipient["en@example.org"].subject == "Capsule exchange"
    assert "Unsubscribe:" in by_recipient["en@example.org"].text
    assert by_recipient["fr@example.org"].subject == "Capsule-ruilbeurs"
    assert "Afmelden:" in by_recipient["nl@example.org"].text
    assert all(str(mail.sender) == "club@mail.example.org" for mail in provider.sent)
    mail = by_recipient["nl@example.org"]
    assert mail.delivery_key == f"composer:{message_id}:{nl}"
    assert str(mail.unsubscribe_url) in mail.text
    assert mail.as_message()["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"

    counts = (await client.get(f"/api/composer/{message_id}", headers=ADMIN_HEADERS)).json()
    assert (counts["email_accepted_count"], counts["email_failed_count"], counts["email_pending_count"]) == (3, 0, 0)


async def test_jobs_are_staggered_to_the_rate_limit_and_single_attempt(client, provider, monkeypatch, db_session):
    monkeypatch.setattr(settings, "member_mail_max_per_minute", 30)
    for index in range(3):
        await _add_consent(db_session, await _person(client, f"P{index}", f"p{index}@example.org"), "club_news")
    await _send(client)

    jobs = (
        await db_session.scalars(
            select(OutboxJob).where(OutboxJob.job_type == "composer_message_email").order_by(OutboxJob.scheduled_at)
        )
    ).all()
    assert [job.max_attempts for job in jobs] == [1, 1, 1]
    gaps = [(b.scheduled_at - a.scheduled_at).total_seconds() for a, b in zip(jobs, jobs[1:], strict=False)]
    assert gaps == pytest.approx([2.0, 2.0])


async def test_recipient_is_rechecked_just_before_submission(client, provider, db_session):
    withdrawn = await _person(client, "Withdraws", "w@example.org")
    bounced = await _person(client, "Bounces", "b@example.org")
    kept = await _person(client, "Kept", "k@example.org")
    for person_id in (withdrawn, bounced, kept):
        await _add_consent(db_session, person_id, "club_news")
    message_id = await _send(client)

    consent = await db_session.scalar(select(EmailConsent).where(EmailConsent.person_id == withdrawn))
    from datetime import UTC, datetime

    consent.revoked_at = datetime.now(UTC)
    consent.revoked_source = "self_service"
    await email_suppression_service.suppress(db_session, "b@example.org", "complaint")
    await db_session.commit()

    states = await _deliver_all(db_session, message_id)
    assert states == {withdrawn: "failed", bounced: "failed", kept: "delivered"}
    assert [str(mail.recipient) for mail in provider.sent] == ["k@example.org"]
    counts = (await client.get(f"/api/composer/{message_id}", headers=ADMIN_HEADERS)).json()
    assert (counts["email_accepted_count"], counts["email_skipped_count"], counts["email_failed_count"]) == (1, 2, 0)


@pytest.mark.parametrize(
    ("status", "error", "expected"),
    [
        ("rejected", None, MemberMailRejected),
        ("unknown", None, MemberMailUncertain),
        ("disabled", None, MemberMailUnavailable),
        ("accepted", TimeoutError("smtp timeout to ann@example.org"), MemberMailUncertain),
    ],
)
async def test_unaccepted_outcomes_fail_once_and_are_never_retried(
    client, provider, db_session, status, error, expected
):
    person = await _person(client, "Ann", "ann@example.org")
    await _add_consent(db_session, person, "club_news")
    message_id = await _send(client)
    provider.status, provider.error = status, error

    states = await _deliver_all(db_session, message_id)

    assert states == {person: "failed"}
    job = await db_session.scalar(select(OutboxJob).where(OutboxJob.job_type == "composer_message_email"))
    assert job.attempt_count == 1
    assert job.last_error_code == expected.__name__
    assert len(provider.sent) == 1
    audit = " ".join(str(entry.details) for entry in (await db_session.scalars(select(AuditEntry))).all())
    assert "ann@example.org" not in audit


async def test_a_reclaimed_job_is_not_submitted_again(client, provider, db_session):
    person = await _person(client, "Ann", "ann@example.org")
    await _add_consent(db_session, person, "club_news")
    message_id = await _send(client)
    job = await db_session.scalar(select(OutboxJob).where(OutboxJob.job_type == "composer_message_email"))
    job.attempt_count = 2  # a worker died after claiming it once
    await db_session.commit()

    with pytest.raises(MemberMailUncertain):
        await deliver_composer_email(f"{message_id}:{person}")
    assert provider.sent == []


async def test_delivery_without_configuration_raises_unavailable():
    with pytest.raises(MemberMailUnavailable):
        await deliver_composer_email("cmp_x:per_x")


def test_render_returns_none_without_usable_text():
    from types import SimpleNamespace

    from app.models import EmailCategory
    from app.services.member_mail_render import render_member_mail

    empty = SimpleNamespace(link_url=None, title_nl=None, body_nl=None, title_en=None, body_en=None)
    category = EmailCategory(key="club_news", name_nl="Clubnieuws")
    assert render_member_mail(empty, category, "en", "https://x.test/u") is None  # ty: ignore[invalid-argument-type]


async def test_deleting_a_category_used_by_a_message_is_refused(client, provider):
    await client.post("/api/composer", json=_draft(), headers=ADMIN_HEADERS)
    r = await client.delete("/api/email-categories/club_news", headers=ADMIN_HEADERS)
    assert r.status_code == 409
    assert r.json()["code"] == "email_category_in_use"


def test_skipped_is_a_member_mail_outcome():
    assert issubclass(MemberMailSkipped, member_mail.MemberMailNotSent)


# --- one-click unsubscribe ----------------------------------------------------------------------------------


def _token(person_id: str, category: str = "club_news") -> str:
    url = member_mail_unsubscribe.unsubscribe_url(person_id, category)
    assert url.startswith("https://festival.example.org/api/mail/unsubscribe?token=")
    return parse_qs(urlparse(url).query)["token"][0]


async def test_one_click_unsubscribe_ends_consent_without_login(unauth_client, client, provider, db_session):
    person = await _person(client, "Ann", "ann@example.org")
    twin = await _person(client, "Twin", "ann@example.org", roles=("volunteer",))
    other = await _person(client, "Other", "other@example.org")
    for person_id in (person, twin, other):
        await _add_consent(db_session, person_id, "new_editions")
    await _add_consent(db_session, person, "club_news")
    token = _token(person, "new_editions")

    r = await unauth_client.post(
        "/api/mail/unsubscribe", params={"token": token}, data={"List-Unsubscribe": "One-Click"}
    )
    assert r.status_code == 204

    db_session.expire_all()
    open_rows = {
        (row.person_id, row.category_key)
        for row in (await db_session.scalars(select(EmailConsent).where(EmailConsent.revoked_at.is_(None)))).all()
    }
    assert open_rows == {(other, "new_editions"), (person, "club_news")}
    revoked = (await db_session.scalars(select(EmailConsent).where(EmailConsent.revoked_at.is_not(None)))).all()
    assert {row.revoked_source for row in revoked} == {"unsubscribe_link"}
    audit = (await db_session.scalars(select(AuditEntry).where(AuditEntry.action == "email_consent_revoked"))).all()
    assert len(audit) == 2

    again = await unauth_client.post("/api/mail/unsubscribe", params={"token": token})
    assert again.status_code == 204


async def test_unsubscribe_rejects_tampered_foreign_and_malformed_tokens(unauth_client, client, provider, db_session):
    person = await _person(client, "Ann", "ann@example.org")
    await _add_consent(db_session, person, "club_news")
    token = _token(person)
    payload, _, signature = token.partition(".")
    other_key = member_mail_unsubscribe.make_unsubscribe_token(
        person, "club_news", settings.model_copy(update={"member_mail_signing_key": "z" * 40})
    )
    for bad in (f"{payload}.{'0' * len(signature)}", other_key, "garbage", "!!!.abc", f"{payload}x.{signature}"):
        r = await unauth_client.post("/api/mail/unsubscribe", params={"token": bad})
        assert r.status_code == 404, bad
        assert r.json()["code"] == "unsubscribe_token_invalid"
    db_session.expire_all()
    consent = await db_session.scalar(select(EmailConsent).where(EmailConsent.person_id == person))
    assert consent.revoked_at is None


async def test_unsubscribe_token_is_scoped_to_its_category(unauth_client, client, provider, db_session):
    person = await _person(client, "Ann", "ann@example.org")
    await _add_consent(db_session, person, "club_news")
    await _add_consent(db_session, person, "new_editions")
    r = await unauth_client.post("/api/mail/unsubscribe", params={"token": _token(person, "new_editions")})
    assert r.status_code == 204
    db_session.expire_all()
    rows = {
        row.category_key: row.revoked_at is not None
        for row in (await db_session.scalars(select(EmailConsent).where(EmailConsent.person_id == person))).all()
    }
    assert rows == {"club_news": False, "new_editions": True}


async def test_opening_the_link_redirects_to_the_confirmation_page_without_unsubscribing(
    unauth_client, client, provider, db_session
):
    person = await _person(client, "Ann", "ann@example.org")
    await _add_consent(db_session, person, "club_news")
    token = _token(person)

    r = await unauth_client.get("/api/mail/unsubscribe", params={"token": token}, follow_redirects=False)

    assert r.status_code == 303
    location = urlparse(r.headers["location"])
    assert (location.netloc, location.path) == ("festival.example.org", "/email-unsubscribe")
    assert parse_qs(location.query)["token"] == [token]
    db_session.expire_all()
    consent = await db_session.scalar(select(EmailConsent).where(EmailConsent.person_id == person))
    assert consent.revoked_at is None


async def test_confirmation_page_can_look_up_the_category(unauth_client, client, provider, db_session):
    person = await _person(client, "Ann", "ann@example.org")
    token = _token(person)
    r = await unauth_client.get("/api/mail/unsubscribe/category", params={"token": token, "locale": "en"})
    assert (r.status_code, r.json()) == (200, {"category_key": "club_news", "category_name": "Club news"})
    bad = await unauth_client.get("/api/mail/unsubscribe/category", params={"token": "nope.nope"})
    assert (bad.status_code, bad.json()["code"]) == (404, "unsubscribe_token_invalid")


async def test_unsubscribe_for_a_deleted_person_still_succeeds(unauth_client, provider):
    r = await unauth_client.post("/api/mail/unsubscribe", params={"token": _token("per_gone")})
    assert r.status_code == 204


async def test_unsubscribe_is_unavailable_without_a_signing_key(unauth_client):
    r = await unauth_client.post("/api/mail/unsubscribe", params={"token": "abc.def"})
    assert r.status_code == 404
    with pytest.raises(RuntimeError):
        member_mail_unsubscribe.make_unsubscribe_token("per_1", "club_news")


def test_signing_key_must_be_long_enough():
    from pydantic import ValidationError

    from app.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None, member_mail_signing_key="short")


# --- automatic reward-ready mail ----------------------------------------------------------------------------


async def _earn_reward(client, db_session, *, consent: bool = True, language: str | None = None) -> tuple[str, str]:
    """Earn a stamp-card reward for a member; returns (person id, reward id)."""
    from app.models import Person
    from tests.helpers import _post_registration
    from tests.test_stamp_cards import check, setup_card

    _, event, first = await setup_card(client)
    second = (await _post_registration(client, event=event)).json()
    person = await db_session.get(Person, first["person_id"])
    person.roles = ["member"]
    person.email = "reward@example.org"
    person.preferred_language = language
    await db_session.commit()
    if consent:
        await _add_consent(db_session, person.id, "reward_ready")
    assert (await check(client, first)).status_code == 200
    assert (await check(client, second)).json()["stamp_progress"]["reward_earned"]
    cards = (await client.get(f"/api/stamp-cards/people/{person.id}")).json()
    return person.id, cards[0]["reward"]["id"]


async def _reward_jobs(db_session) -> list[OutboxJob]:
    return list((await db_session.scalars(select(OutboxJob).where(OutboxJob.job_type == "reward_ready_email"))).all())


async def test_reward_ready_mail_is_sent_in_the_members_language(client, provider, db_session):
    person_id, reward_id = await _earn_reward(client, db_session, language="fr")
    jobs = await _reward_jobs(db_session)
    assert [(job.resource_id, job.max_attempts) for job in jobs] == [(reward_id, 1)]

    from app.services.reward_mail import deliver_reward_ready_email

    assert await deliver_reward_ready_email(reward_id) is True
    (mail,) = provider.sent
    assert str(mail.recipient) == "reward@example.org"
    assert mail.category_key == "reward_ready"
    assert mail.subject == "Votre récompense est prête"
    assert "Une bouteille" in mail.text
    assert str(mail.unsubscribe_url) in mail.text
    assert mail.delivery_key == f"reward-ready:{reward_id}"


async def test_reward_ready_mail_needs_consent_and_available_member_mail(client, provider, db_session, monkeypatch):
    await _earn_reward(client, db_session, consent=False)
    assert await _reward_jobs(db_session) == []


async def test_reward_ready_mail_is_not_queued_while_member_mail_is_unavailable(client, db_session):
    await _earn_reward(client, db_session)
    assert await _reward_jobs(db_session) == []


async def test_reward_ready_mail_is_skipped_once_handed_out_or_withdrawn(client, provider, db_session):
    from app.services.reward_mail import deliver_reward_ready_email

    person_id, reward_id = await _earn_reward(client, db_session)
    await client.put(f"/api/stamp-cards/rewards/{reward_id}", json={"handed_out": True})
    with pytest.raises(MemberMailSkipped):
        await deliver_reward_ready_email(reward_id)
    assert provider.sent == []


async def test_reward_ready_mail_is_not_resubmitted_after_a_lost_worker(client, provider, db_session):
    from app.services.reward_mail import deliver_reward_ready_email

    _, reward_id = await _earn_reward(client, db_session)
    (job,) = await _reward_jobs(db_session)
    job.attempt_count = 2
    await db_session.commit()
    with pytest.raises(MemberMailUncertain):
        await deliver_reward_ready_email(reward_id)
    assert provider.sent == []
