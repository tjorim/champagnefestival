"""Self-service identity endpoints for OIDC-authenticated volunteers (``/api/me/volunteer/*``).

There is no built-in link between an OIDC token and the ``Person`` row
holding a volunteer's NISS/eID — see ``app.services.volunteer_self_service``
for why registration is volunteer-initiated and self-contained rather than
matched against a pre-existing admin-entered record, and
docs/decisions/1006-volunteer-identity-self-service.md for the full design.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_volunteer
from app.database import get_db
from app.dependencies import get_request_id
from app.models import Person
from app.schemas import RequestModel
from app.services import volunteer_self_service

router = APIRouter(prefix="/api/me/volunteer", tags=["me", "volunteers"], dependencies=[Depends(require_volunteer)])


class VolunteerIdentityRegisterRequest(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    national_register_number: str = Field(min_length=1, max_length=20)
    eid_document_number: str = Field(min_length=1, max_length=50)


class VolunteerEidCorrectionRequest(RequestModel):
    eid_document_number: str = Field(min_length=1, max_length=50)


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
