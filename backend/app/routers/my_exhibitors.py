"""Read exhibitors managed by the shared magic-link identity (#1192)."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Exhibitor, Person
from app.schemas import ManagedExhibitorOut
from app.visitor_session import get_current_exhibitor_manager

router = APIRouter(prefix="/api/me/exhibitors", tags=["me", "exhibitors"])


@router.get("", response_model=list[ManagedExhibitorOut])
async def my_exhibitors(
    response: Response, email: str = Depends(get_current_exhibitor_manager), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    rows = (
        await db.scalars(
            select(Exhibitor)
            .join(Person, Exhibitor.contact_person_id == Person.id)
            .where(func.lower(func.trim(Person.email)) == email)
            .order_by(Exhibitor.name, Exhibitor.id)
        )
    ).all()
    return [
        {"id": row.id, "name": row.name, "type": row.type, "website": row.website, "active": row.active} for row in rows
    ]
