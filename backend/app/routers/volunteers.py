"""Volunteer CRUD endpoints (admin-only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import Volunteer
from app.schemas import VolunteerCreate, VolunteerOut, VolunteerUpdate
from app.utils import make_id, volunteer_to_dict

router = APIRouter(
    prefix="/api/volunteers",
    tags=["volunteers"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=VolunteerOut, status_code=status.HTTP_201_CREATED)
async def create_volunteer(
    body: VolunteerCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    _validate_help_day_range(body.first_help_day, body.last_help_day)

    await _ensure_unique_fields(
        db,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
    )

    volunteer = Volunteer(
        id=make_id("vol"),
        name=body.name,
        address=body.address,
        first_help_day=body.first_help_day,
        last_help_day=body.last_help_day,
        national_register_number=body.national_register_number,
        eid_document_number=body.eid_document_number,
    )
    db.add(volunteer)
    await db.commit()
    await db.refresh(volunteer)
    return volunteer_to_dict(volunteer)


@router.get("", response_model=list[VolunteerOut])
async def list_volunteers(
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, description="Search by name, address, NISS, or eID doc number"),
) -> list[dict]:
    stmt = select(Volunteer)
    if q:
        q_escaped = q.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        stmt = stmt.where(
            or_(
                Volunteer.name.ilike(f"%{q_escaped}%", escape="\\"),
                Volunteer.address.ilike(f"%{q_escaped}%", escape="\\"),
                Volunteer.national_register_number.ilike(f"%{q_escaped}%", escape="\\"),
                Volunteer.eid_document_number.ilike(f"%{q_escaped}%", escape="\\"),
            )
        )

    result = await db.execute(stmt.order_by(Volunteer.created_at.desc()))
    return [volunteer_to_dict(v) for v in result.scalars().all()]


@router.get("/{volunteer_id}", response_model=VolunteerOut)
async def get_volunteer(volunteer_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    volunteer = await _get_or_404(db, volunteer_id)
    return volunteer_to_dict(volunteer)


@router.put("/{volunteer_id}", response_model=VolunteerOut)
async def update_volunteer(
    volunteer_id: str,
    body: VolunteerUpdate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    volunteer = await _get_or_404(db, volunteer_id)

    first_help_day = body.first_help_day if "first_help_day" in body.model_fields_set else volunteer.first_help_day
    last_help_day = body.last_help_day if "last_help_day" in body.model_fields_set else volunteer.last_help_day
    _validate_help_day_range(first_help_day, last_help_day)

    if "national_register_number" in body.model_fields_set and body.national_register_number is not None:
        await _ensure_unique_fields(
            db,
            national_register_number=body.national_register_number,
            exclude_id=volunteer_id,
        )
    if "eid_document_number" in body.model_fields_set and body.eid_document_number is not None:
        await _ensure_unique_fields(
            db,
            eid_document_number=body.eid_document_number,
            exclude_id=volunteer_id,
        )

    for field in (
        "name",
        "address",
        "first_help_day",
        "last_help_day",
        "national_register_number",
        "eid_document_number",
    ):
        if field in body.model_fields_set:
            setattr(volunteer, field, getattr(body, field))

    await db.commit()
    await db.refresh(volunteer)
    return volunteer_to_dict(volunteer)


@router.delete("/{volunteer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_volunteer(volunteer_id: str, db: AsyncSession = Depends(get_db)) -> None:
    volunteer = await _get_or_404(db, volunteer_id)
    await db.delete(volunteer)
    await db.commit()


def _validate_help_day_range(first_help_day, last_help_day) -> None:
    if first_help_day > last_help_day:
        raise HTTPException(
            status_code=400,
            detail="first_help_day must be before or equal to last_help_day.",
        )


async def _ensure_unique_fields(
    db: AsyncSession,
    national_register_number: str | None = None,
    eid_document_number: str | None = None,
    exclude_id: str | None = None,
) -> None:
    if national_register_number is not None:
        stmt = select(Volunteer).where(
            Volunteer.national_register_number == national_register_number
        )
        if exclude_id:
            stmt = stmt.where(Volunteer.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Volunteer with this national register number already exists.",
            )

    if eid_document_number is not None:
        stmt = select(Volunteer).where(
            Volunteer.eid_document_number == eid_document_number
        )
        if exclude_id:
            stmt = stmt.where(Volunteer.id != exclude_id)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Volunteer with this eID document number already exists.",
            )


async def _get_or_404(db: AsyncSession, volunteer_id: str) -> Volunteer:
    result = await db.execute(select(Volunteer).where(Volunteer.id == volunteer_id))
    volunteer = result.scalar_one_or_none()
    if volunteer is None:
        raise HTTPException(status_code=404, detail="Volunteer not found.")
    return volunteer
