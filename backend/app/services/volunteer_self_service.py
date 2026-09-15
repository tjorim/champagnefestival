"""Self-service identity operations for OIDC-authenticated volunteers (#1006).

There is no built-in link between an OIDC token and a ``Person`` row — the
``volunteer``/``admin`` realm role checked by ``app.auth.require_volunteer``
proves *that* a token may act as a volunteer, not *which* ``Person`` it
belongs to. ``Person.oidc_subject`` (nullable, unique) is that link, and this
module is the only place that establishes or reads it outside admin edits
(``app.services.volunteers_service.apply_volunteer_update``).

Registration is volunteer-initiated and self-contained: an admin grants the
``volunteer`` realm role in the identity provider (already a prerequisite
for reaching any of these endpoints via ``require_volunteer``), and the
volunteer then submits their own NISS/eID, checksum-validated locally, to
create their own ``Person`` row. There is no "does this match an existing
admin-entered record" step and nothing to guess: knowing the realm role
already means the identity provider vouches for this being a real
volunteer, and a checksum-valid submission is trusted as their own data,
the same way any self-reported form field is. See
docs/decisions/1006-volunteer-identity-self-service.md.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import EditionPollOption, Person, VolunteerPollSelection
from app.schemas import VolunteerPollSelectionsIn, VolunteerPollSelectionsOut
from app.services.editions_service import find_active_edition
from app.services.identity_checksum import validate_eid_checksum, validate_niss_checksum
from app.services.people_service import normalise_optional_identity
from app.services.volunteers_service import ensure_volunteer_role
from app.utils import make_id


async def get_linked_volunteer(db: AsyncSession, subject: str) -> Person | None:
    """Return the ``Person`` linked to this OIDC subject, if any."""
    return (await db.execute(select(Person).where(Person.oidc_subject == subject))).scalar_one_or_none()


async def register_volunteer_identity(
    db: AsyncSession,
    *,
    subject: str,
    name: str,
    national_register_number: str,
    eid_document_number: str,
    actor: str,
    request_id: str | None = None,
) -> Person:
    """Create (or link) the calling OIDC subject's own volunteer record.

    Convergent and safe to retry: a subject that's already linked just
    returns its existing record rather than erroring, regardless of what's
    resubmitted. Both identifiers must pass their checksum before anything
    is written — that's what lets this trust the volunteer's own input
    instead of matching against a pre-existing admin-entered record (see
    module docstring).

    If a `Person` with this exact NISS *and* eID already exists (e.g.
    imported by an admin before this volunteer ever signed in) and isn't
    linked to anyone yet, this links to it instead of creating a duplicate —
    preserving whatever help-period history it already has. A *partial*
    match (one field matching a different, unrelated person's record) or a
    match already linked to someone else is a conflict, not a duplicate to
    silently paper over.
    """
    already_linked = await get_linked_volunteer(db, subject)
    if already_linked is not None:
        return already_linked

    nrr = normalise_optional_identity(national_register_number)
    eid = normalise_optional_identity(eid_document_number)
    if nrr is None or not validate_niss_checksum(nrr):
        raise HTTPException(
            status_code=422,
            detail="That national register number doesn't look valid. Please check it and try again.",
        )
    if eid is None or not validate_eid_checksum(eid):
        raise HTTPException(
            status_code=422,
            detail="That eID document number doesn't look valid. Please check it and try again.",
        )

    # .with_for_update() closes the same race the admin assign-volunteer
    # override guards against (#1044): without it, two concurrent
    # registrations targeting the same unlinked Person could both read
    # `oidc_subject is None` and the later commit would silently overwrite
    # the earlier subject's link (CWE-367).
    matches = (
        (
            await db.execute(
                select(Person)
                .where(or_(Person.national_register_number == nrr, Person.eid_document_number == eid))
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    exact_match = next(
        (p for p in matches if p.national_register_number == nrr and p.eid_document_number == eid),
        None,
    )
    if exact_match is None and matches:
        raise HTTPException(
            status_code=409,
            detail="These details conflict with an existing record. Ask an administrator for help.",
        )

    if exact_match is not None:
        if exact_match.oidc_subject is not None:
            raise HTTPException(
                status_code=409,
                detail="This identity is already linked to another account. Ask an administrator for help.",
            )
        exact_match.oidc_subject = subject
        ensure_volunteer_role(exact_match)
        person = exact_match
    else:
        person = Person(
            id=make_id("per"),
            name=name,
            national_register_number=nrr,
            eid_document_number=eid,
            oidc_subject=subject,
        )
        ensure_volunteer_role(person)
        db.add(person)

    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_identity_registered",
        resource_type="person",
        resource_id=person.id,
        request_id=request_id,
        details={"linked_existing_record": exact_match is not None},
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This information is already associated with another account.",
        ) from exc
    await db.refresh(person)
    return person


async def update_eid_document_number(
    db: AsyncSession,
    *,
    person: Person,
    new_eid_document_number: str,
    actor: str,
    request_id: str | None = None,
) -> Person:
    """Update the calling volunteer's own eID document number directly.

    A direct write, not an admin-reviewed request: the volunteer already
    self-registers their own NISS/eID with nothing but a checksum check
    (see ``register_volunteer_identity``), so a correction is held to the
    same trust model rather than a stricter one — the checksum catches a
    typo here exactly as it does on initial registration, and there's no
    more of an identity-proof gap on a correction than there was on the
    original claim (same already-linked person). Superseded the earlier
    admin-reviewed-ContactMessage design; see Decision 2 in
    docs/decisions/1006-volunteer-identity-self-service.md.

    Convergent and safe to retry: writing the same value twice is a no-op
    the second time, so no idempotency key is needed.
    """
    new_eid = normalise_optional_identity(new_eid_document_number)
    if new_eid is None or not validate_eid_checksum(new_eid):
        raise HTTPException(
            status_code=422,
            detail="That eID document number doesn't look valid. Please check it and try again.",
        )

    changed = new_eid != person.eid_document_number
    person.eid_document_number = new_eid
    if changed:
        # Intentionally omits the actual eID value — audit details are not a
        # place to record PII, matching volunteer_updated's and
        # volunteer_identity_registered's fields-changed-only convention.
        await write_audit_entry(
            db,
            actor=actor,
            action="volunteer_eid_updated",
            resource_type="person",
            resource_id=person.id,
            request_id=request_id,
            details={"eid_changed": True},
        )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This eID document number is already associated with another account.",
        ) from exc
    await db.refresh(person)
    return person


async def get_active_edition_poll_options(db: AsyncSession) -> tuple[str | None, list[EditionPollOption]]:
    """The active festival edition's poll options (empty list, `None` edition
    id if there is no active festival edition or it has none configured)."""
    edition = await find_active_edition(db, edition_type="festival")
    if edition is None:
        return None, []
    options = (
        (
            await db.execute(
                select(EditionPollOption)
                .where(EditionPollOption.edition_id == edition.id)
                .order_by(EditionPollOption.kind, EditionPollOption.created_at)
            )
        )
        .scalars()
        .all()
    )
    return edition.id, list(options)


async def get_poll_selections(db: AsyncSession, volunteer_id: str) -> VolunteerPollSelectionsOut:
    option_ids = (
        await db.execute(
            select(VolunteerPollSelection.option_id, EditionPollOption.kind)
            .join(EditionPollOption, EditionPollOption.id == VolunteerPollSelection.option_id)
            .where(VolunteerPollSelection.volunteer_id == volunteer_id)
        )
    ).all()
    dish = next((oid for oid, kind in option_ids if kind == "dish"), None)
    soup = next((oid for oid, kind in option_ids if kind == "soup"), None)
    dinners = [oid for oid, kind in option_ids if kind == "dinner"]
    return VolunteerPollSelectionsOut(dish_option_id=dish, soup_option_id=soup, dinner_option_ids=dinners)


async def replace_poll_selections(
    db: AsyncSession,
    *,
    volunteer_id: str,
    body: VolunteerPollSelectionsIn,
    actor: str,
    request_id: str | None = None,
) -> VolunteerPollSelectionsOut:
    """Replace this volunteer's own picks. Safe to wholesale-replace: every
    row touched is keyed by `volunteer_id`, so this can never affect another
    volunteer's selections or the options themselves (see
    `VolunteerPollSelectionsIn`'s docstring)."""
    active_edition_id, _ = await get_active_edition_poll_options(db)
    requested_ids = [oid for oid in (body.dish_option_id, body.soup_option_id, *body.dinner_option_ids) if oid]
    options_by_id: dict[str, EditionPollOption] = {}
    if requested_ids:
        rows = (
            (await db.execute(select(EditionPollOption).where(EditionPollOption.id.in_(requested_ids)))).scalars().all()
        )
        options_by_id = {o.id: o for o in rows}
        missing = set(requested_ids) - options_by_id.keys()
        if missing or any(o.edition_id != active_edition_id for o in options_by_id.values()):
            raise HTTPException(status_code=404, detail="One or more poll options are not part of the active edition.")

    def _check_kind(option_id: str | None, expected_kind: str) -> None:
        if option_id is not None and options_by_id[option_id].kind != expected_kind:
            raise HTTPException(status_code=400, detail=f"That option isn't a {expected_kind} choice.")

    _check_kind(body.dish_option_id, "dish")
    _check_kind(body.soup_option_id, "soup")
    for dinner_id in body.dinner_option_ids:
        if options_by_id[dinner_id].kind != "dinner":
            raise HTTPException(status_code=400, detail="That option isn't a dinner choice.")

    await db.execute(delete(VolunteerPollSelection).where(VolunteerPollSelection.volunteer_id == volunteer_id))
    for option_id in dict.fromkeys(requested_ids):  # de-duplicate, preserve order
        db.add(VolunteerPollSelection(volunteer_id=volunteer_id, option_id=option_id))

    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_poll_selections_updated",
        resource_type="person",
        resource_id=volunteer_id,
        request_id=request_id,
        details={"option_count": len(set(requested_ids))},
    )
    await db.commit()
    return await get_poll_selections(db, volunteer_id)
