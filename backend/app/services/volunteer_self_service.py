"""Self-service identity operations for OIDC-authenticated volunteers (#1006).

There is no built-in link between an OIDC token and a ``Person`` row — the
``volunteer``/``admin`` realm role checked by ``app.auth.require_volunteer``
proves *that* a token may act as a volunteer, not *which* ``Person`` it
belongs to. ``Person.oidc_subject`` (nullable, unique) is that link, and this
module is the only place that establishes or reads it outside admin edits
(``app.services.volunteers_service.apply_volunteer_update``).

Linking is volunteer-initiated (``claim_volunteer_identity``, matching the
caller's own NISS against an unlinked volunteer-role record) rather than
email-matched at first login: volunteers created via the dedicated
``/api/volunteers`` flow have no email on file at all (``VolunteerCreate`` has
no ``email`` field), so email can't be relied on as the matching key. See
docs/decisions/1006-volunteer-identity-self-service.md.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import write_audit_entry
from app.models import ContactMessage, Person
from app.services.outbox_service import enqueue_contact_notification
from app.services.people_service import normalise_optional_identity
from app.utils import roles_contains


async def get_linked_volunteer(db: AsyncSession, subject: str) -> Person | None:
    """Return the ``Person`` linked to this OIDC subject, if any."""
    return (await db.execute(select(Person).where(Person.oidc_subject == subject))).scalar_one_or_none()


async def claim_volunteer_identity(
    db: AsyncSession,
    *,
    subject: str,
    national_register_number: str,
    client_ip: str,
    actor: str,
    request_id: str | None = None,
) -> Person:
    """Link the calling OIDC subject to the volunteer record matching this NISS.

    Convergent and safe to retry: a repeat with the same NISS from the same
    subject, after the first attempt already linked it, returns the same
    record rather than erroring. The write itself only ever touches a row
    that is currently unlinked (``oidc_subject IS NULL``), so a concurrent
    claim of the same record from two different subjects can only let one of
    them win — the loser gets 404, as if the record had never matched.

    Knowing a volunteer's NISS is what this claim requires — the per-subject
    rate limit only slows guessing, it doesn't prove ownership (#1037
    review). Rather than gating every claim on an admin or a verified
    channel volunteers may not have (no email on file — see the module
    docstring), a successful claim also raises an admin-visible
    ``ContactMessage`` notification, so a wrongful claim is *noticed*
    quickly rather than silently going undetected — an admin can reverse it
    via ``VolunteerUpdate.oidc_subject=None``.
    """
    already_linked = await get_linked_volunteer(db, subject)
    normalised = normalise_optional_identity(national_register_number)

    if already_linked is not None:
        if normalised is not None and already_linked.national_register_number == normalised:
            return already_linked
        raise HTTPException(
            status_code=409,
            detail="Your account is already linked to a different volunteer record.",
        )

    if normalised is None:
        raise HTTPException(status_code=404, detail="No matching volunteer record found.")

    result = await db.execute(
        update(Person)
        .where(
            Person.national_register_number == normalised,
            roles_contains("volunteer"),
            Person.oidc_subject.is_(None),
        )
        .values(oidc_subject=subject)
        .returning(Person.id)
    )
    person_id = result.scalar_one_or_none()
    if person_id is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No matching, unlinked volunteer record found for that national register "
                "number. Ask an administrator to check or link your account."
            ),
        )

    await write_audit_entry(
        db,
        actor=actor,
        action="volunteer_identity_claimed",
        resource_type="person",
        resource_id=person_id,
        request_id=request_id,
        details={},
    )
    person = (await db.execute(select(Person).where(Person.id == person_id))).scalar_one()
    notification_id = str(uuid4())
    await db.execute(
        insert(ContactMessage).values(
            id=notification_id,
            name=person.name,
            email=person.email,
            message=(
                "Volunteer identity self-linked\n"
                f"Person: {person.name} (ID {person.id})\n"
                "A volunteer just linked their own sign-in to this record via "
                "self-service (POST /api/me/volunteer/claim), by submitting the "
                "matching national register number.\n\n"
                "If this doesn't look right, clear the link (set oidc_subject to "
                "null on this volunteer) and follow up with them directly."
            ),
            client_ip=client_ip,
            request_id=request_id,
        )
    )
    await enqueue_contact_notification(db, notification_id, actor=actor, request_id=request_id)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Your account is already linked to a volunteer record.",
        ) from exc

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
