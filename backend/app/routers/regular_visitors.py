"""Regular visitor CRUD endpoints (admin-only)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.database import get_db
from app.models import RegularVisitor
from app.schemas import RegularVisitorCreate, RegularVisitorOut, RegularVisitorUpdate
from app.utils import make_id, regular_visitor_to_dict

router = APIRouter(
    prefix="/api/regular-visitors",
    tags=["regular-visitors"],
    dependencies=[Depends(require_admin)],
)
# Backward-compatible alias for older clients; can be removed in a later release.
legacy_router = APIRouter(
    prefix="/api/recurring-visitors",
    tags=["regular-visitors"],
    dependencies=[Depends(require_admin)],
    deprecated=True,
)


def _register_routes(api: APIRouter) -> None:
    @api.post("", response_model=RegularVisitorOut, status_code=status.HTTP_201_CREATED)
    async def create_regular_visitor(
        body: RegularVisitorCreate,
        db: AsyncSession = Depends(get_db),
    ) -> dict:
        existing = await db.execute(
            select(RegularVisitor).where(
                RegularVisitor.email == str(body.email).lower().strip()
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=409,
                detail="Regular visitor with this email already exists.",
            )

        visitor = RegularVisitor(
            id=make_id("rv"),
            name=body.name,
            email=str(body.email).lower().strip(),
            phone=body.phone,
            visits_per_month=body.visits_per_month,
            is_capsule_exchange_member=body.is_capsule_exchange_member,
            club_name=body.club_name,
            notes=body.notes,
            last_visit_at=body.last_visit_at,
            next_expected_visit_at=body.next_expected_visit_at,
            active=body.active,
        )
        db.add(visitor)
        await db.commit()
        await db.refresh(visitor)
        return regular_visitor_to_dict(visitor)

    @api.get("", response_model=list[RegularVisitorOut])
    async def list_regular_visitors(
        db: AsyncSession = Depends(get_db),
        q: str | None = Query(
            default=None, description="Search by name, email, phone, or club"
        ),
        active: bool | None = Query(default=None),
        capsule_exchange_member: bool | None = Query(default=None),
    ) -> list[dict]:
        stmt = select(RegularVisitor)

        if q:
            q_escaped = q.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
            stmt = stmt.where(
                or_(
                    RegularVisitor.name.ilike(f"%{q_escaped}%", escape="\\"),
                    RegularVisitor.email.ilike(f"%{q_escaped}%", escape="\\"),
                    RegularVisitor.phone.ilike(f"%{q_escaped}%", escape="\\"),
                    RegularVisitor.club_name.ilike(f"%{q_escaped}%", escape="\\"),
                )
            )
        if active is not None:
            stmt = stmt.where(RegularVisitor.active == active)
        if capsule_exchange_member is not None:
            stmt = stmt.where(
                RegularVisitor.is_capsule_exchange_member == capsule_exchange_member
            )

        result = await db.execute(stmt.order_by(RegularVisitor.created_at.desc()))
        rows = result.scalars().all()
        return [regular_visitor_to_dict(r) for r in rows]

    @api.get("/{visitor_id}", response_model=RegularVisitorOut)
    async def get_regular_visitor(
        visitor_id: str,
        db: AsyncSession = Depends(get_db),
    ) -> dict:
        visitor = await _get_or_404(db, visitor_id)
        return regular_visitor_to_dict(visitor)

    @api.put("/{visitor_id}", response_model=RegularVisitorOut)
    async def update_regular_visitor(
        visitor_id: str,
        body: RegularVisitorUpdate,
        db: AsyncSession = Depends(get_db),
    ) -> dict:
        visitor = await _get_or_404(db, visitor_id)

        if body.email is not None:
            normalized_email = str(body.email).lower().strip()
            existing = await db.execute(
                select(RegularVisitor).where(
                    RegularVisitor.email == normalized_email,
                    RegularVisitor.id != visitor_id,
                )
            )
            if existing.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Regular visitor with this email already exists.",
                )
            visitor.email = normalized_email

        for field in (
            "name",
            "phone",
            "visits_per_month",
            "is_capsule_exchange_member",
            "club_name",
            "notes",
            "last_visit_at",
            "next_expected_visit_at",
            "active",
        ):
            if field in body.model_fields_set:
                setattr(visitor, field, getattr(body, field))

        await db.commit()
        await db.refresh(visitor)
        return regular_visitor_to_dict(visitor)

    @api.delete("/{visitor_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_regular_visitor(
        visitor_id: str,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        visitor = await _get_or_404(db, visitor_id)
        await db.delete(visitor)
        await db.commit()


_register_routes(router)
_register_routes(legacy_router)


async def _get_or_404(db: AsyncSession, visitor_id: str) -> RegularVisitor:
    result = await db.execute(select(RegularVisitor).where(RegularVisitor.id == visitor_id))
    visitor = result.scalar_one_or_none()
    if visitor is None:
        raise HTTPException(status_code=404, detail="Regular visitor not found.")
    return visitor
