"""Shared serialisation helpers for ORM → dict conversions."""

from __future__ import annotations

import secrets
import time
from collections.abc import Sequence
from datetime import date
from typing import Any, TypeVar

from fastapi import HTTPException
from sqlalchemy import Text, cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.interfaces import ORMOption

from app.database import Base
from app.models import (
    AppSettings,
    Area,
    Edition,
    Event,
    Exhibitor,
    FaqItem,
    Layout,
    Person,
    Product,
    Registration,
    Room,
    Table,
    TableType,
    Venue,
)

T = TypeVar("T", bound=Base)

_CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")


def csv_safe(value: object) -> str:
    """Return a spreadsheet-safe CSV cell value.

    Keep this rule aligned with ``frontend/src/utils/csvExport.ts``.
    """
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(_CSV_INJECTION_PREFIXES) else text


def normalise_table_type_dimensions(shape: str, width_m: float, length_m: float) -> tuple[float, float]:
    """Return canonical (width_m, length_m) for a table type.

    - round tables have a single diameter: the larger of the two inputs, so
      whichever field the caller actually used to express it (only one is
      meaningful for a circle) is preserved rather than always deferring to
      width_m — previously this silently discarded length_m, which could
      collapse a large-capacity round table down to a tiny default diameter
      (see #835).
    - rectangular tables ensure length_m >= width_m by swapping if needed
    Shared between TableTypeCreate validator and table_types_service update path
    so the two entry points cannot diverge.
    """
    if shape == "round":
        diameter = max(width_m, length_m)
        return diameter, diameter
    if length_m < width_m:
        return length_m, width_m
    return width_m, length_m


async def get_or_404(
    db: AsyncSession,
    model: type[T],
    object_id: Any,
    detail: str,
    *,
    options: Sequence[ORMOption] | None = None,
) -> T:
    # populate_existing ensures loader options (e.g. selectinload) are applied even when the
    # instance is already present in the identity map — for example an object that was just added
    # and committed, leaving its relationships expired. Without this, Session.get returns the
    # cached instance without eager-loading, and accessing a relationship later triggers a lazy
    # load outside the async greenlet (MissingGreenlet).
    obj = await db.get(model, object_id, options=options, populate_existing=options is not None)
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj


def roles_contains(role: str) -> Any:
    """Return a SQLAlchemy filter expression that matches Person.roles JSON arrays
    containing *role* as an exact element (case-insensitive).

    Casts the JSON column to Text so the LIKE works on PostgreSQL.
    We match the quoted token so that a role like "member" never accidentally
    matches "non-member".
    """
    role_norm = role.strip().lower()
    role_escaped = role_norm.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return cast(Person.roles, Text).ilike(f'%"{role_escaped}"%', escape="\\")


def make_id(prefix: str) -> str:
    """Generate a time-ordered, collision-resistant ID with the given prefix."""
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(4)
    return f"{prefix}_{ts}_{rand}"


def event_to_summary_dict(event: Event, include_edition: bool = False) -> dict:
    data = {
        "id": event.id,
        "edition_id": event.edition_id,
        "title": event.title,
        "description": event.description,
        "date": event.date,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "category": event.category,
        "registration_required": event.registration_required,
        "registrations_open_from": event.registrations_open_from,
        "max_capacity": event.max_capacity,
        "active": event.active,
        "created_at": event.created_at,
        "updated_at": event.updated_at,
        "edition": None,
        # Active only: an archived product should stop being offered without
        # rewriting the order_items already placed against it (a name/price/category
        # snapshot, not a live reference — see Product's docstring).
        "products": [product_to_dict(p) for p in event.products if p.active],
    }
    edition: Edition | None = getattr(event, "edition", None)
    if include_edition and edition is not None:
        data["edition"] = edition_summary_to_dict(edition)
    return data


def product_to_dict(p: Product) -> dict:
    return {
        "id": p.id,
        "event_id": p.event_id,
        "name": p.name,
        "price": p.price,
        "category": p.category,
        "active": p.active,
        "required": p.required,
        "included_product_id": p.included_product_id,
        "included_per_guests": p.included_per_guests,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


def registration_to_dict(r: Registration, person: Person, event: Event) -> dict:
    """Serialise a Registration ORM row to a plain dict (no check_in_token)."""
    return {
        "id": r.id,
        "person_id": r.person_id,
        "person": person_summary_to_dict(person),
        "event_id": r.event_id,
        "edition_id": event.edition_id,
        "event": event_to_summary_dict(event, include_edition=True),
        "guest_count": r.guest_count,
        "order_items": r.order_items,
        "notes": r.notes,
        "accessibility_note": r.accessibility_note,
        "table_id": r.table_id,
        "status": r.status,
        "payment_status": r.payment_status,
        "amount_due": r.amount_due,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def registration_to_checkin_dict(
    r: Registration,
    person: Person,
    event: Event,
    table_name: str | None = None,
) -> dict:
    """Serialise a Registration for the public check-in GET endpoint."""
    return {
        "id": r.id,
        "name": person.name,
        "event_id": r.event_id,
        "edition_id": event.edition_id,
        "event_title": event.title,
        "event_date": event.date,
        "check_in_token": r.check_in_token,
        "table_id": r.table_id,
        "table_name": table_name,
        "guest_count": r.guest_count,
        "order_items": r.order_items,
        "notes": r.notes,
        "status": r.status,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
    }


def registration_to_dict_with_token(r: Registration, person: Person, event: Event) -> dict:
    """Serialise a Registration ORM row including the sensitive check_in_token."""
    return {**registration_to_dict(r, person, event), "check_in_token": r.check_in_token}


def registration_to_list_dict(r: Registration, person: Person, event: Event) -> dict:
    """Serialise a Registration for the list endpoint (drops notes)."""
    d = registration_to_dict(r, person, event)
    d.pop("notes", None)
    return d


def registration_to_guest_dict(r: Registration, person: Person, event: Event) -> dict:
    """Serialise a Registration for the visitor self-lookup endpoint."""
    return {
        "id": r.id,
        "name": person.name,
        "event_id": r.event_id,
        "event_title": event.title,
        "event_date": event.date,
        "check_in_token": r.check_in_token,
        "guest_count": r.guest_count,
        "order_items": r.order_items,
        "status": r.status,
        "payment_status": r.payment_status,
        "amount_due": r.amount_due,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
        "created_at": r.created_at,
    }


def exhibitor_to_dict(e: Exhibitor, contact_person: Person | None = None) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "image": e.image,
        "website": e.website,
        "active": e.active,
        "type": e.type,
        "contact_person_id": e.contact_person_id,
        "contact_person": person_summary_to_dict(contact_person) if contact_person else None,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
    }


def area_to_dict(a: Area) -> dict:
    return {
        "id": a.id,
        "layout_id": a.layout_id,
        "exhibitor_id": a.exhibitor_id,
        "label": a.label,
        "icon": a.icon,
        "x": a.x,
        "y": a.y,
        "rotation": a.rotation,
        "width_m": a.width_m,
        "length_m": a.length_m,
        "created_at": a.created_at,
        "updated_at": a.updated_at,
    }


def venue_to_dict(v: Venue) -> dict:
    return {
        "id": v.id,
        "name": v.name,
        "address": v.address,
        "city": v.city,
        "postal_code": v.postal_code,
        "country": v.country,
        "lat": v.lat,
        "lng": v.lng,
        "active": v.active,
        "created_at": v.created_at,
        "updated_at": v.updated_at,
    }


def table_type_to_dict(tt: TableType) -> dict:
    return {
        "id": tt.id,
        "name": tt.name,
        "venue_id": tt.venue_id,
        "shape": tt.shape,
        "width_m": tt.width_m,
        "length_m": tt.length_m,
        "height_type": tt.height_type,
        "capacity": tt.capacity,
        "active": tt.active,
        "created_at": tt.created_at,
        "updated_at": tt.updated_at,
    }


def layout_to_dict(lay: Layout, date: date | None = None) -> dict:
    return {
        "id": lay.id,
        "edition_id": lay.edition_id,
        "room_id": lay.room_id,
        "day_id": lay.day_id,
        "date": date,
        "label": lay.label,
        "created_at": lay.created_at,
        "updated_at": lay.updated_at,
    }


def table_to_dict(t: Table, registration_ids: list[str], *, capacity: int | None = None) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "capacity": t.capacity if capacity is None else capacity,
        "x": t.x,
        "y": t.y,
        "table_type_id": t.table_type_id,
        "rotation": t.rotation,
        "layout_id": t.layout_id,
        "registration_ids": registration_ids,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


def room_to_dict(r: Room) -> dict:
    return {
        "id": r.id,
        "venue_id": r.venue_id,
        "name": r.name,
        "width_m": r.width_m,
        "length_m": r.length_m,
        "color": r.color,
        "active": r.active,
        "dimensions_placeholder": r.dimensions_placeholder,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def edition_summary_to_dict(e: Edition) -> dict:
    return {
        "id": e.id,
        "year": e.year,
        "month": e.month,
        "edition_type": e.edition_type,
        "active": e.active,
    }


def edition_to_dict(
    e: Edition,
    venue: dict,
    dates: list | None = None,
    events: list[dict] | None = None,
    producers: list[dict] | None = None,
    sponsors: list[dict] | None = None,
    vendors: list[dict] | None = None,
    co_organizer: dict | None = None,
) -> dict:
    return {
        "id": e.id,
        "year": e.year,
        "month": e.month,
        "edition_type": e.edition_type,
        "dates": dates if dates is not None else [],
        "venue": venue,
        "events": events if events is not None else [],
        "producers": producers if producers is not None else [],
        "sponsors": sponsors if sponsors is not None else [],
        "vendors": vendors if vendors is not None else [],
        "co_organizer": co_organizer,
        "active": e.active,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
    }


def person_summary_to_dict(p: Person) -> dict:
    """Serialise only public-safe person fields for embedding in registration responses."""
    return {
        "id": p.id,
        "name": p.name,
        "email": p.email,
        "phone": p.phone,
    }


def app_settings_to_dict(s: AppSettings) -> dict:
    return {
        "maintenance_mode": s.maintenance_mode,
        "public_email": s.public_email,
        "public_phone": s.public_phone,
        "facebook_url": s.facebook_url,
        "updated_at": s.updated_at,
    }


def faq_item_to_dict(f: FaqItem) -> dict:
    """Admin shape: every locale's content, for the FAQ editor."""
    return {
        "id": f.id,
        "question_nl": f.question_nl,
        "answer_nl": f.answer_nl,
        "question_en": f.question_en,
        "answer_en": f.answer_en,
        "question_fr": f.question_fr,
        "answer_fr": f.answer_fr,
        "sort_order": f.sort_order,
        "active": f.active,
        "created_at": f.created_at,
        "updated_at": f.updated_at,
    }


def faq_item_to_public_dict(f: FaqItem, locale: str) -> dict | None:
    """Public shape: one locale's question/answer, or None if that locale is blank.

    A blank translation hides the item on that locale's FAQ rather than
    falling back to another language's text.
    """
    question = getattr(f, f"question_{locale}", None)
    answer = getattr(f, f"answer_{locale}", None)
    if not question or not answer:
        return None
    return {"id": f.id, "question": question, "answer": answer}


def person_to_dict(p: Person) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "email": p.email,
        "phone": p.phone,
        "address": p.address,
        "roles": p.roles,
        "national_register_number": p.national_register_number,
        "eid_document_number": p.eid_document_number,
        "visits_per_month": p.visits_per_month,
        "club_name": p.club_name,
        "notes": p.notes,
        "active": p.active,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }
