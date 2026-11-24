"""Which person is this account? Linking people to accounts by key (#1655)."""

import pytest
from sqlalchemy import delete, select

from app.models import AuditEntry, Person, Registration, User
from app.services import people_service, person_account
from app.services.errors import ApiHTTPException
from app.services.users_service import claim_unowned_registrations_for_email
from tests.helpers import ADMIN_HEADERS, _create_event, _post_registration, role_periods


async def _add(db_session, *rows):
    db_session.add_all(rows)
    await db_session.commit()


async def _audit_actions(db_session, resource_id):
    return [
        row.action for row in await db_session.scalars(select(AuditEntry).where(AuditEntry.resource_id == resource_id))
    ]


@pytest.mark.anyio
async def test_person_for_account_resolves_by_user_id_or_subject(db_session):
    user = User(id="usr-a", oidc_subject="sub-a")
    await _add(db_session, user, Person(id="per-a", name="A", user_id="usr-a"), Person(id="per-b", name="B"))

    assert (await person_account.person_for_account(db_session, user_id="usr-a")) == await db_session.get(
        Person, "per-a"
    )
    assert (await person_account.person_for_account(db_session, subject="sub-a")) == await db_session.get(
        Person, "per-a"
    )
    assert await person_account.person_for_account(db_session, subject="unknown") is None
    with pytest.raises(ValueError, match="exactly one"):
        await person_account.person_for_account(db_session)
    with pytest.raises(ValueError, match="exactly one"):
        await person_account.person_for_account(db_session, user_id="usr-a", subject="sub-a")


@pytest.mark.anyio
async def test_link_person_is_idempotent_and_never_steals(db_session):
    first, second = User(id="usr-1", oidc_subject="sub-1"), User(id="usr-2", oidc_subject="sub-2")
    await _add(
        db_session,
        first,
        second,
        Person(id="per-1", name="One"),
        Person(id="per-2", name="Two"),
        Person(id="per-gone", name="Gone", anonymised=True),
    )
    person = await db_session.get(Person, "per-1")
    other = await db_session.get(Person, "per-2")
    gone = await db_session.get(Person, "per-gone")

    assert await person_account.link_person(db_session, person, first, method="test", actor="a") is True
    assert await person_account.link_person(db_session, person, first, method="test", actor="a") is False
    await db_session.commit()
    assert await _audit_actions(db_session, "per-1") == ["person_account_linked"]

    # Another account cannot take a linked person, and an account never gets a second person.
    for target, user in ((person, second), (other, first), (gone, second)):
        with pytest.raises(ApiHTTPException) as error:
            await person_account.link_person(db_session, target, user, method="test", actor="a")
        assert error.value.code == "person_account_conflict"
    await db_session.rollback()
    assert (await db_session.get(Person, "per-1")).user_id == "usr-1"
    assert (await db_session.get(Person, "per-2")).user_id is None


@pytest.mark.anyio
async def test_verified_email_links_exactly_one_matching_person(db_session):
    user = User(id="usr-v", verified_email="Visitor@Example.com ")
    await _add(db_session, user, Person(id="per-v", name="Visitor", email="visitor@example.com"))

    person = await person_account.link_by_verified_email(db_session, user, " VISITOR@example.com", actor="usr-v")
    await db_session.commit()

    assert person is not None and person.id == "per-v"
    assert (await db_session.get(Person, "per-v")).user_id == "usr-v"
    # Linked once: asking again returns the same person without another audit row.
    again = await person_account.link_by_verified_email(db_session, user, "visitor@example.com", actor="usr-v")
    await db_session.commit()
    assert again is not None and again.id == "per-v"
    assert await _audit_actions(db_session, "per-v") == ["person_account_linked"]


@pytest.mark.anyio
@pytest.mark.parametrize("verified", [None, "", "   ", "someone.else@example.com"])
async def test_no_verified_match_links_nothing(db_session, verified):
    """An absent, blank or different verified address never links, however similar the stored person looks."""
    user = User(id="usr-n", verified_email="mine@example.com")
    await _add(db_session, user, Person(id="per-n", name="Someone", email="victim@example.com"))

    assert await person_account.link_by_verified_email(db_session, user, verified, actor="usr-n") is None
    assert (await db_session.get(Person, "per-n")).user_id is None


@pytest.mark.anyio
async def test_shared_address_is_ambiguous_and_never_guessed(db_session):
    user = User(id="usr-h", verified_email="family@example.com")
    await _add(
        db_session,
        user,
        Person(id="per-h1", name="Parent", email="family@example.com"),
        Person(id="per-h2", name="Child", email="Family@example.com"),
    )
    assert await person_account.link_by_verified_email(db_session, user, "family@example.com", actor="usr-h") is None
    assert (await db_session.scalars(select(Person.user_id).where(Person.user_id.is_not(None)))).all() == []


@pytest.mark.anyio
async def test_a_linked_person_is_never_taken_over_by_another_account(db_session):
    """Account B proves the same address as A's already-linked person: it neither links nor displaces A."""
    owner = User(id="usr-owner", oidc_subject="sub-owner")
    other = User(id="usr-other", verified_email="owned@example.com")
    await _add(
        db_session, owner, other, Person(id="per-o", name="Owned", email="owned@example.com", user_id="usr-owner")
    )

    assert (
        await person_account.link_by_verified_email(db_session, other, "owned@example.com", actor="usr-other") is None
    )
    assert (await db_session.get(Person, "per-o")).user_id == "usr-owner"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "identity",
    [
        {"national_register_number": "91010112345"},
        {"eid_document_number": "BEX123456"},
        {"role_periods": role_periods(["volunteer"])},
    ],
)
async def test_identity_holders_are_only_linked_by_their_own_subject(db_session, identity):
    """A verified address is not enough for a person with identity documents or the volunteer role (#1006)."""
    user = User(id="usr-i", verified_email="volunteer@example.com")
    await _add(db_session, user, Person(id="per-i", name="Volunteer", email="volunteer@example.com", **identity))

    assert await person_account.link_by_verified_email(db_session, user, "volunteer@example.com", actor="usr-i") is None
    assert (await db_session.get(Person, "per-i")).user_id is None


@pytest.mark.anyio
async def test_anonymised_people_are_not_linked_by_email(db_session):
    user = User(id="usr-an", verified_email="erased@example.com")
    await _add(db_session, user, Person(id="per-an", name="Guest", email="erased@example.com", anonymised=True))
    assert await person_account.link_by_verified_email(db_session, user, "erased@example.com", actor="usr-an") is None


@pytest.mark.anyio
async def test_claiming_registrations_links_the_person_but_not_other_peoples_records(client, db_session):
    event = await _create_event(client)
    mine = await _post_registration(client, event=event, email="claimer@example.com", name="Claimer")
    theirs = await _post_registration(client, event=event, email="stranger@example.com", name="Stranger")
    user = User(id="usr-c", oidc_subject="sub-c", verified_email="claimer@example.com")
    await _add(db_session, user)

    await claim_unowned_registrations_for_email(db_session, user, "claimer@example.com", actor="sub-c")
    await db_session.commit()

    registration = await db_session.get(Registration, mine.json()["id"])
    assert registration.user_id == "usr-c"
    assert (await db_session.get(Registration, theirs.json()["id"])).user_id is None
    assert (await db_session.get(Person, mine.json()["person_id"])).user_id == "usr-c"
    assert (await db_session.get(Person, theirs.json()["person_id"])).user_id is None


@pytest.mark.anyio
async def test_deleting_the_account_clears_the_link_but_keeps_the_person(db_session):
    await _add(db_session, User(id="usr-d", oidc_subject="sub-d"), Person(id="per-d", name="D", user_id="usr-d"))
    await db_session.execute(delete(User).where(User.id == "usr-d"))
    await db_session.commit()
    db_session.expire_all()
    person = await db_session.get(Person, "per-d")
    assert person is not None and person.user_id is None


@pytest.mark.anyio
async def test_anonymising_a_person_clears_the_link(db_session):
    await _add(
        db_session,
        User(id="usr-z", verified_email="z@example.com"),
        Person(id="per-z", name="Z", email="z@example.com", user_id="usr-z"),
    )
    await people_service.anonymise_person(db_session, await db_session.get(Person, "per-z"), actor="admin")
    person = await db_session.get(Person, "per-z")
    assert person.anonymised and person.user_id is None
    assert await person_account.person_for_account(db_session, user_id="usr-z") is None
    assert "person_account_unlinked" in await _audit_actions(db_session, "per-z")


@pytest.mark.anyio
async def test_merge_moves_the_link_to_the_surviving_person(client, db_session):
    await _add(
        db_session,
        User(id="usr-m", oidc_subject="sub-m"),
        Person(id="per-keep", name="Keep"),
        Person(id="per-dup", name="Dup", user_id="usr-m"),
    )
    response = await client.post("/api/people/per-keep/merge/per-dup", headers=ADMIN_HEADERS)
    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert (await db_session.get(Person, "per-keep")).user_id == "usr-m"
    assert await db_session.get(Person, "per-dup") is None
    assert (await person_account.person_for_account(db_session, subject="sub-m")) == await db_session.get(
        Person, "per-keep"
    )


@pytest.mark.anyio
async def test_merge_keeps_the_canonical_link_and_refuses_two_different_accounts(client, db_session):
    await _add(
        db_session,
        User(id="usr-1", oidc_subject="sub-1"),
        User(id="usr-2", oidc_subject="sub-2"),
        Person(id="per-1", name="One", user_id="usr-1"),
        Person(id="per-2", name="Two", user_id="usr-2"),
        Person(id="per-3", name="Three"),
    )
    # A duplicate without an account merges into a linked canonical and the link stays.
    assert (await client.post("/api/people/per-1/merge/per-3", headers=ADMIN_HEADERS)).status_code == 200
    # Two different accounts: the merge is refused instead of stripping one account of its person.
    conflict = await client.post("/api/people/per-1/merge/per-2", headers=ADMIN_HEADERS)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "person_account_conflict"
    db_session.expire_all()
    assert (await db_session.get(Person, "per-1")).user_id == "usr-1"
    assert (await db_session.get(Person, "per-2")).user_id == "usr-2"


# --- Public booking matching (one documented rule, #1655) -------------------------------------------------


async def _find(db_session, *, name="Bob Martin", email="bob@example.com", phone="+32470123456", user=None):
    person, created = await people_service.find_or_create_public_person(
        db_session, name=name, email=email, phone=phone, preferred_language=None, user=user
    )
    await db_session.commit()
    return person, created


@pytest.mark.anyio
async def test_public_booking_reuses_a_person_despite_a_retyped_phone_and_differently_cased_email(db_session):
    first, created = await _find(db_session)
    assert created is True

    for variant in (
        {"phone": "+32499999999"},
        {"phone": ""},
        {"email": " BOB@Example.COM "},
        {"name": "  bob   MARTIN "},
    ):
        again, created = await _find(db_session, **variant)
        assert (again.id, created) == (first.id, False), variant
    # The stored phone is never overwritten by an unauthenticated form.
    assert (await db_session.get(Person, first.id)).phone == "+32470123456"


@pytest.mark.anyio
async def test_public_booking_keeps_household_members_apart_and_fills_only_a_blank_phone(db_session):
    bob, _ = await _find(db_session, phone="")
    robert, created = await _find(db_session, name="Robert Martin")
    assert created is True and robert.id != bob.id

    again, created = await _find(db_session, phone="+32470123456")
    assert (again.id, created) == (bob.id, False)
    assert (await db_session.get(Person, bob.id)).phone == "+32470123456"


@pytest.mark.anyio
async def test_public_booking_never_reuses_an_anonymised_person_and_prefers_the_signed_in_account(db_session):
    erased, _ = await _find(db_session)
    await people_service.anonymise_person(db_session, erased, actor="admin")
    fresh, created = await _find(db_session)
    assert created is True and fresh.id != erased.id

    user = User(id="usr-b", oidc_subject="sub-b")
    older = Person(id="per-0000-older", name="Dana", email="dana@example.com")
    newer = Person(id="per-9999-newer", name="Dana", email="dana@example.com", user=user)
    await _add(db_session, user, older, newer)
    picked, _ = await _find(db_session, name="Dana", email="dana@example.com", user=user)
    assert picked.id == "per-9999-newer"
    picked, _ = await _find(db_session, name="Dana", email="dana@example.com")
    assert picked.id == "per-0000-older"
