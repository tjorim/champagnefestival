"""Self-service endpoints for authenticated visitors (``/api/me/*``)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit import write_audit_entry
from app.auth import get_current_claims
from app.database import get_db
from app.models import Event, Person, Registration, User
from app.schemas import (
    CommunicationPreferenceOut,
    CommunicationPreferenceUpdate,
    MyRegistrationOut,
    PaymentStatus,
    PebbleAccessTokenOut,
    RegistrationAccessLookupRequest,
    RegistrationGuestOut,
    RegistrationStatus,
)
from app.services.pebble_access import (
    authenticate_pebble_token,
    revoke_pebble_token,
    rotate_pebble_token,
)
from app.services.users_service import get_or_create_user
from app.utils import registration_to_guest_dict

router = APIRouter(prefix="/api/me", tags=["me"])
pebble_router = APIRouter(prefix="/api/pebble", tags=["pebble"])
_bearer_scheme = HTTPBearer(auto_error=True)


async def _user_people(db: AsyncSession, user_id: str) -> list[Person]:
    return list(
        (
            await db.scalars(
                select(Person).where(
                    Person.id.in_(select(Registration.person_id).where(Registration.user_id == user_id))
                )
            )
        ).all()
    )


@router.get("/communication-preference", response_model=CommunicationPreferenceOut)
async def get_communication_preference(
    claims: dict[str, Any] = Depends(get_current_claims), db: AsyncSession = Depends(get_db)
) -> CommunicationPreferenceOut:
    user = await get_or_create_user(db, claims["sub"])
    people = await _user_people(db, user.id)
    preferred_language = next((person.preferred_language for person in people if person.preferred_language), None)
    return CommunicationPreferenceOut.model_validate({"preferred_language": preferred_language})


@router.put("/communication-preference", response_model=CommunicationPreferenceOut)
async def update_communication_preference(
    body: CommunicationPreferenceUpdate,
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> CommunicationPreferenceOut:
    user = await get_or_create_user(db, claims["sub"])
    people = await _user_people(db, user.id)
    for person in people:
        person.preferred_language = body.preferred_language
    await write_audit_entry(
        db,
        actor=claims["sub"],
        action="communication_preference_updated",
        resource_type="user",
        resource_id=user.id,
        details={"preferred_language": body.preferred_language, "people_updated": len(people)},
    )
    await db.commit()
    return CommunicationPreferenceOut(preferred_language=body.preferred_language)


async def _registrations_for_user(db: AsyncSession, user_id: str) -> list[MyRegistrationOut]:
    result = await db.execute(
        select(Registration)
        .options(
            selectinload(Registration.person),
            selectinload(Registration.event).selectinload(Event.edition),
        )
        .where(Registration.user_id == user_id)
        .order_by(Registration.created_at.desc())
    )
    registrations = result.scalars().all()

    payload: list[MyRegistrationOut] = []
    for reg in registrations:
        event = reg.event
        payload.append(
            MyRegistrationOut(
                id=reg.id,
                event_id=reg.event_id,
                event_title=event.title if event else "",
                event_date=event.date if event else None,
                edition_id=event.edition_id if event else None,
                guest_count=reg.guest_count,
                status=cast(RegistrationStatus, reg.status),
                payment_status=cast(PaymentStatus, reg.payment_status),
                checked_in=reg.checked_in,
                checked_in_at=reg.checked_in_at,
                person_name=reg.person.name if reg.person else "",
                created_at=reg.created_at,
            )
        )
    return payload


@router.get("/registrations", response_model=list[RegistrationGuestOut])
async def list_my_registrations(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return registrations claimed by the authenticated portal user."""
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    user = await get_or_create_user(db, oidc_subject)
    rows = (
        await db.execute(
            select(Registration, Person, Event)
            .join(Person, Registration.person_id == Person.id)
            .join(Event, Registration.event_id == Event.id)
            .where(Registration.user_id == user.id)
            .order_by(Registration.created_at.desc())
        )
    ).all()
    return [registration_to_guest_dict(registration, person, event) for registration, person, event in rows]


@router.post("/registrations/claim", response_model=list[RegistrationGuestOut])
async def claim_my_registrations(
    body: RegistrationAccessLookupRequest,
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Claim unowned registrations after proving control of their email address."""
    from app.routers.registrations import _get_guest_access_token_or_401, _load_guest_registrations_by_email

    oidc_subject = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    token_row = await _get_guest_access_token_or_401(db, body.token)
    user = await get_or_create_user(db, oidc_subject, commit=False)
    token_row.expires_at = datetime.now(UTC)
    registrations = (
        await db.scalars(
            select(Registration)
            .join(Person, Registration.person_id == Person.id)
            .where(Person.email == token_row.email, Registration.user_id.is_(None))
            .with_for_update()
        )
    ).all()
    for registration in registrations:
        registration.user_id = user.id
        await write_audit_entry(
            db,
            actor=oidc_subject,
            action="registration_claimed",
            resource_type="registration",
            resource_id=registration.id,
        )
    rows = await _load_guest_registrations_by_email(db, token_row.email)
    await db.commit()
    return [registration_to_guest_dict(registration, person, event) for registration, person, event in rows]


@router.post("/pebble-token", response_model=PebbleAccessTokenOut)
async def create_pebble_token(
    response: Response,
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> PebbleAccessTokenOut:
    """Rotate the caller's long-lived token scoped to the Pebble glance."""
    response.headers["Cache-Control"] = "no-store"
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    user = await get_or_create_user(db, oidc_subject)
    return PebbleAccessTokenOut(token=await rotate_pebble_token(db, user.id))


@router.delete("/pebble-token", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pebble_token(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> None:
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")
    user = await get_or_create_user(db, oidc_subject)
    await revoke_pebble_token(db, user.id)


@pebble_router.get("/registrations", response_model=list[MyRegistrationOut])
async def list_pebble_registrations(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> list[MyRegistrationOut]:
    """Return registrations using a credential that cannot access other APIs."""
    user_id = await authenticate_pebble_token(db, credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked Pebble token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _registrations_for_user(db, user_id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    claims: dict[str, Any] = Depends(get_current_claims),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete the caller's portal account while preserving festival records.

    Registrations, order items, payment state, check-in state, and audit history
    are operational festival records.  Deleting the portal account only removes
    the OIDC-backed account link so those records can still be fulfilled and
    retained for event/accounting purposes.
    """
    oidc_subject: str = claims.get("sub", "")
    if not oidc_subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing sub claim in token")

    result = await db.execute(select(User).where(User.oidc_subject == oidc_subject))
    user = result.scalar_one_or_none()
    if user is None:
        return

    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
