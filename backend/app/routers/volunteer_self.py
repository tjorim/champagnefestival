"""Self-service identity endpoints for OIDC-authenticated volunteers (``/api/me/volunteer/*``).

There is no built-in link between an OIDC token and the ``Person`` row
holding a volunteer's NISS/eID — see ``app.services.volunteer_self_service``
for why linking is a volunteer-initiated NISS claim rather than an
email-match at first login, and docs/decisions/1006-volunteer-identity-self-service.md
for the full design.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_actor_id, require_volunteer
from app.database import get_db
from app.dependencies import get_request_id
from app.models import Person
from app.ratelimit import check_volunteer_identity_claim_rate_limit, get_client_ip
from app.schemas import RequestModel
from app.services import volunteer_self_service

router = APIRouter(prefix="/api/me/volunteer", tags=["me", "volunteers"], dependencies=[Depends(require_volunteer)])


class VolunteerIdentityClaimRequest(RequestModel):
    national_register_number: str = Field(min_length=1, max_length=20)


class VolunteerEidCorrectionRequest(RequestModel):
    submission_id: UUID
    new_eid_document_number: str = Field(min_length=1, max_length=50)
    note: str = Field(default="", max_length=2000)


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


@router.post("/claim", response_model=VolunteerIdentityOut)
async def claim_my_volunteer_identity(
    body: VolunteerIdentityClaimRequest,
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
    request_id: str | None = Depends(get_request_id),
) -> VolunteerIdentityOut:
    # Commit the bucket increment before the claim itself, matching
    # app.routers.check_in/push's fix: otherwise a rejected claim (e.g. wrong
    # NISS) rolls back with the rest of this request's uncommitted
    # transaction and is never actually counted.
    allowed = await check_volunteer_identity_claim_rate_limit(db, subject)
    await db.commit()
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please try again later.",
        )
    person = await volunteer_self_service.claim_volunteer_identity(
        db,
        subject=subject,
        national_register_number=body.national_register_number,
        actor=subject,
        request_id=request_id,
    )
    return _identity_out(person)


@router.post("/eid-correction", status_code=status.HTTP_202_ACCEPTED)
async def request_eid_correction(
    body: VolunteerEidCorrectionRequest,
    request: Request,
    subject: str = Depends(get_actor_id),
    db: AsyncSession = Depends(get_db),
    request_id: str | None = Depends(get_request_id),
) -> dict[str, bool]:
    person = await volunteer_self_service.get_linked_volunteer(db, subject)
    if person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Your account isn't linked to a volunteer record yet.",
        )
    await volunteer_self_service.submit_eid_correction_request(
        db,
        person=person,
        submission_id=body.submission_id,
        new_eid_document_number=body.new_eid_document_number,
        note=body.note,
        client_ip=get_client_ip(request),
        actor=subject,
        request_id=request_id,
    )
    return {"submitted": True}
