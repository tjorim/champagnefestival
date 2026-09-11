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

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import ContactMessage, Person
from app.services.identity_checksum import validate_eid_checksum, validate_niss_checksum
from app.services.outbox_service import enqueue_contact_notification
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

    matches = (
        (
            await db.execute(
                select(Person).where(or_(Person.national_register_number == nrr, Person.eid_document_number == eid))
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


async def submit_eid_correction_request(
    db: AsyncSession,
    *,
    person: Person,
    submission_id: UUID,
    new_eid_document_number: str,
    note: str,
    client_ip: str,
    actor: str,
    request_id: str | None = None,
) -> None:
    """Record a volunteer's self-reported eID renewal for admin review.

    Not a direct write to ``Person.eid_document_number`` — the field backs an
    insurance record, so a correction is admin-reviewed, same posture as the
    booking change/cancellation request this mirrors
    (``app.routers.me.request_registration_change``): a ``ContactMessage`` is
    inserted under the client-generated ``submission_id`` (idempotent via
    ``ON CONFLICT DO NOTHING``) and an outbox notification is enqueued in the
    same transaction so an admin sees it and applies the change themselves
    through the existing ``PUT /api/volunteers/{id}``.

    Unlike a plain client-generated-ID replay, the frontend keeps the same
    ``submission_id`` across a failed attempt even if the volunteer edits the
    form before retrying (it only rotates the id on success) — so a reused id
    with a *different* payload is a distinct correction, not a replay, and
    must not be silently swallowed by ``ON CONFLICT DO NOTHING`` (#1037
    review). Raises 409 in that case; the client must submit a fresh
    ``submission_id``.
    """
    new_eid = normalise_optional_identity(new_eid_document_number)
    message_text = (
        "Volunteer eID correction request\n"
        f"Person: {person.name} (ID {person.id})\n"
        f"Current eID on file: {person.eid_document_number or '(none)'}\n"
        f"Requested new eID: {new_eid_document_number.strip()}\n\n"
        f"Note: {note.strip() or '(none)'}"
    )
    message_id = str(submission_id)
    inserted = await db.scalar(
        insert(ContactMessage)
        .values(
            id=message_id,
            name=person.name,
            email=person.email,
            message=message_text,
            client_ip=client_ip,
            request_id=request_id,
        )
        .on_conflict_do_nothing(index_elements=[ContactMessage.id])
        .returning(ContactMessage.id)
    )
    if inserted is None:
        existing = await db.get(ContactMessage, message_id)
        if existing is not None and existing.message != message_text:
            raise HTTPException(
                status_code=409,
                detail="This request was already submitted with different details. Please try again.",
            )
    if inserted is not None:
        # Intentionally omits the actual eID values — audit details are not a
        # place to duplicate PII already captured in the ContactMessage above
        # (matches volunteer_updated's fields_changed-only convention).
        await write_audit_entry(
            db,
            actor=actor,
            action="volunteer_eid_correction_requested",
            resource_type="person",
            resource_id=person.id,
            request_id=request_id,
            details={"contact_message_id": message_id, "eid_changed": new_eid != person.eid_document_number},
        )
        await enqueue_contact_notification(db, message_id, actor=actor, request_id=request_id)
    await db.commit()
