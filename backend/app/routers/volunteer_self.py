"""Self-service identity endpoints for OIDC-authenticated volunteers (``/api/me/volunteer/*``).

There is no built-in link between an OIDC token and the ``Person`` row
holding a volunteer's NISS/eID — see ``app.services.volunteer_self_service``
for why registration is volunteer-initiated and self-contained rather than
matched against a pre-existing admin-entered record, and
docs/decisions/1006-volunteer-identity-self-service.md for the full design.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_volunteer
from app.database import get_db
from app.dependencies import get_request_id
from app.models import Person
from app.schema_types import NonEmptyText20, NonEmptyText50, NonEmptyText200
from app.schemas import (
    FaqLocale,
    RequestModel,
    VolunteerPollAnswerIn,
    VolunteerPollNoteIn,
    VolunteerPollOut,
)
from app.services import poll_questions_service, volunteer_self_service

router = APIRouter(prefix="/api/me/volunteer", tags=["me", "volunteers"], dependencies=[Depends(require_volunteer)])


class VolunteerIdentityRegisterRequest(RequestModel):
    name: NonEmptyText200
    national_register_number: NonEmptyText20
    eid_document_number: NonEmptyText50


class VolunteerEidCorrectionRequest(RequestModel):
    eid_document_number: NonEmptyText50


class VolunteerIdentityOut(BaseModel):
    linked: bool
    name: str | None = None
    national_register_number: str | None = None
    eid_document_number: str | None = None


def _identity_out(person: Person) -> VolunteerIdentityOut:
    return VolunteerIdentityOut(
        linked=True,
        name=person.name,
        national_register_number=person.national_register_number,
        eid_document_number=person.eid_document_number,
    )


@router.get("", response_model=VolunteerIdentityOut)
async def get_my_volunteer_identity(
    response: Response,
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
) -> VolunteerIdentityOut:
    # Same rationale as app.routers.me's PII reads: reachable via a Bearer
    # token an intermediary cache must not reuse across callers.
    response.headers["Cache-Control"] = "no-store"
    person = await volunteer_self_service.get_linked_volunteer(db, subject)
    if person is None:
        return VolunteerIdentityOut(linked=False)
    return _identity_out(person)


@router.post("/register", response_model=VolunteerIdentityOut)
async def register_my_volunteer_identity(
    body: VolunteerIdentityRegisterRequest,
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
    request_id: str | None = Depends(get_request_id),
) -> VolunteerIdentityOut:
    person = await volunteer_self_service.register_volunteer_identity(
        db,
        subject=subject,
        name=body.name,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
        actor=subject,
        request_id=request_id,
    )
    return _identity_out(person)


@router.post("/eid-correction", response_model=VolunteerIdentityOut)
async def update_my_eid_document_number(
    body: VolunteerEidCorrectionRequest,
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
    request_id: str | None = Depends(get_request_id),
) -> VolunteerIdentityOut:
    person = await volunteer_self_service.get_linked_volunteer(db, subject)
    if person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Your account isn't linked to a volunteer record yet.",
        )
    person = await volunteer_self_service.update_eid_document_number(
        db,
        person=person,
        new_eid_document_number=body.eid_document_number,
        actor=subject,
        request_id=request_id,
    )
    return _identity_out(person)


@router.get("/poll", response_model=VolunteerPollOut)
async def get_my_poll(
    response: Response,
    locale: FaqLocale = Query(default="nl"),
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """The active festival edition's poll questions in `locale` (Dutch when a language has no text), with
    this volunteer's own answers and dietary note and whether each question has closed. Answers come back
    empty if the caller isn't linked to a volunteer record yet, rather than 404ing — there's nothing wrong
    with browsing the questions before registering."""
    response.headers["Cache-Control"] = "no-store"
    person = await volunteer_self_service.get_linked_volunteer(db, subject)
    return await poll_questions_service.volunteer_poll_view(db, person.id if person else None, locale)


async def _linked_volunteer(db: AsyncSession, subject: str) -> Person:
    person = await volunteer_self_service.get_linked_volunteer(db, subject)
    if person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Your account isn't linked to a volunteer record yet.",
        )
    return person


@router.put("/poll/questions/{question_id}", response_model=VolunteerPollOut)
async def answer_my_poll_question(
    question_id: str,
    body: VolunteerPollAnswerIn,
    locale: FaqLocale = Query(default="nl"),
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    """Answer one question: `selections` (a quantity per option) for a meals question, `attending` and
    `people` for a yes/no question. A closed question refuses it (409 `poll_question_closed`)."""
    person = await _linked_volunteer(db, subject)
    return await poll_questions_service.answer_poll_question(
        db,
        volunteer_id=person.id,
        question_id=question_id,
        body=body,
        locale=locale,
        actor=subject,
        request_id=request_id,
    )


@router.put("/poll/note", response_model=VolunteerPollOut)
async def save_my_poll_note(
    body: VolunteerPollNoteIn,
    locale: FaqLocale = Query(default="nl"),
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
    request_id: str | None = Depends(get_request_id),
) -> dict:
    person = await _linked_volunteer(db, subject)
    return await poll_questions_service.save_poll_note(
        db, volunteer_id=person.id, note=body.note, locale=locale, actor=subject, request_id=request_id
    )
