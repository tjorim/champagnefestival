"""Shared serialisation helpers for ORM → dict conversions."""

import secrets
import time
from typing import Any

from sqlalchemy import Text, cast

from app.models import Area, Edition, Exhibitor, Layout, Person, Reservation, Room, Table, TableType, Venue


def roles_contains(role: str) -> Any:
    """Return a SQLAlchemy filter expression that matches Person.roles JSON arrays
    containing *role* as an exact element (case-insensitive).

    Casts the JSON column to Text so the LIKE works on both SQLite and PostgreSQL.
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


def reservation_to_dict(r: Reservation) -> dict:
    """Serialise a Reservation ORM row to a plain dict (no check_in_token)."""
    person: Person | None = getattr(r, "_person", None)
    if person is None:
        raise ValueError(f"Reservation {r.id!r} has no attached _person; caller must set r._person before serialising.")
    return {
        "id": r.id,
        "person_id": r.person_id,
        "person": person_summary_to_dict(person),
        "event_id": r.event_id,
        "event_title": r.event_title,
        "guest_count": r.guest_count,
        "pre_orders": r.pre_orders,
        "notes": r.notes,
        "accessibility_note": r.accessibility_note,
        "table_id": r.table_id,
        "status": r.status,
        "payment_status": r.payment_status,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def reservation_to_checkin_dict(r: Reservation) -> dict:
    """Serialise a Reservation for the public check-in GET endpoint.

    Only exposes fields needed on the volunteer tablet.  PII (email, phone) and
    internal-only fields (payment_status, table_id, timestamps) are omitted.
    """
    person: Person | None = getattr(r, "_person", None)
    if person is None:
        raise ValueError(f"Reservation {r.id!r} has no attached _person; caller must set r._person before serialising.")
    return {
        "id": r.id,
        "name": person.name,
        "event_id": r.event_id,
        "event_title": r.event_title,
        "guest_count": r.guest_count,
        "pre_orders": r.pre_orders,
        "notes": r.notes,
        "status": r.status,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
    }


def reservation_to_dict_with_token(r: Reservation) -> dict:
    """Serialise a Reservation ORM row including the sensitive check_in_token.

    Only use this for the admin detail endpoint.
    """
    return {**reservation_to_dict(r), "check_in_token": r.check_in_token}


def reservation_to_list_dict(r: Reservation) -> dict:
    """Serialise a Reservation for the list endpoint (drops notes)."""
    d = reservation_to_dict(r)
    d.pop("notes", None)
    return d


def reservation_to_guest_dict(r: Reservation) -> dict:
    """Serialise a Reservation for the visitor self-lookup endpoint.

    Strips all sensitive / internal fields: notes, checkInToken.
    Returns only safe-to-share booking status information.
    """
    person: Person | None = getattr(r, "_person", None)
    return {
        "id": r.id,
        "name": person.name if person else "",
        "event_id": r.event_id,
        "event_title": r.event_title,
        "guest_count": r.guest_count,
        "pre_orders": r.pre_orders,
        "status": r.status,
        "payment_status": r.payment_status,
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
        "shape": tt.shape,
        "width_m": tt.width_m,
        "length_m": tt.length_m,
        "height_type": tt.height_type,
        "max_capacity": tt.max_capacity,
        "active": tt.active,
        "created_at": tt.created_at,
        "updated_at": tt.updated_at,
    }


def layout_to_dict(lay: Layout) -> dict:
    return {
        "id": lay.id,
        "edition_id": lay.edition_id,
        "room_id": lay.room_id,
        "day_id": lay.day_id,
        "label": lay.label,
        "created_at": lay.created_at,
        "updated_at": lay.updated_at,
    }


def table_to_dict(t: Table) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "capacity": t.capacity,
        "x": t.x,
        "y": t.y,
        "table_type_id": t.table_type_id,
        "rotation": t.rotation,
        "layout_id": t.layout_id,
        "reservation_ids": t.reservation_ids,
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
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def edition_to_dict(
    e: Edition,
    venue: dict,
    producers: list[dict] | None = None,
    sponsors: list[dict] | None = None,
) -> dict:
    return {
        "id": e.id,
        "year": e.year,
        "month": e.month,
        "friday": e.friday.isoformat(),
        "saturday": e.saturday.isoformat(),
        "sunday": e.sunday.isoformat(),
        "venue": venue,
        "schedule": e.schedule,
        "producers": producers if producers is not None else [],
        "sponsors": sponsors if sponsors is not None else [],
        "active": e.active,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
    }


def person_summary_to_dict(p: Person) -> dict:
    """Serialise only public-safe person fields for embedding in reservation responses.

    Omits sensitive/admin-only fields (address, roles, national register number,
    notes, etc.) so that the public reservation endpoints cannot leak PII.
    """
    return {
        "id": p.id,
        "name": p.name,
        "email": p.email,
        "phone": p.phone,
    }


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
