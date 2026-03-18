"""Shared serialisation helpers for ORM → dict conversions."""

import secrets
import time
from typing import Any

from app.models import Edition, Layout, Person, Producer, Reservation, Room, Sponsor, Table, TableType, Venue


def roles_contains(role: str) -> Any:
    """Return a SQLAlchemy filter expression that matches Person.roles JSON arrays
    containing *role* as an exact element (case-insensitive).

    Person.roles is stored as a JSON-encoded list of lowercase strings, e.g.
    '["member","volunteer"]'.  We match the quoted token so that a role like
    "member" never accidentally matches "non-member".
    """
    role_norm = role.strip().lower()
    role_escaped = role_norm.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return Person.roles.ilike(f'%"{role_escaped}"%', escape="\\")


def make_id(prefix: str) -> str:
    """Generate a time-ordered, collision-resistant ID with the given prefix."""
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(4)
    return f"{prefix}_{ts}_{rand}"


def reservation_to_dict(r: Reservation) -> dict:
    """Serialise a Reservation ORM row to a plain dict (no check_in_token)."""
    person_key = getattr(getattr(r, "_person", None), "person_key", None)
    return {
        "id": r.id,
        "person_key": person_key,
        "name": r.name,
        "email": r.email,
        "phone": r.phone,
        "event_id": r.event_id,
        "event_title": r.event_title,
        "guest_count": r.guest_count,
        "pre_orders": r.get_pre_orders(),
        "notes": r.notes,
        "accessibility_note": r.accessibility_note,
        "person_id": r.person_id,
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
    return {
        "id": r.id,
        "name": r.name,
        "event_id": r.event_id,
        "event_title": r.event_title,
        "guest_count": r.guest_count,
        "pre_orders": r.get_pre_orders(),
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
    """Serialise a Reservation for the list endpoint (drops phone/notes)."""
    d = reservation_to_dict(r)
    d.pop("phone", None)
    d.pop("notes", None)
    return d


def reservation_to_guest_dict(r: Reservation) -> dict:
    """Serialise a Reservation for the visitor self-lookup endpoint.

    Strips all sensitive / internal fields: phone, notes, checkInToken.
    Returns only safe-to-share booking status information.
    """
    person_key = getattr(getattr(r, "_person", None), "person_key", None)
    return {
        "id": r.id,
        "person_key": person_key,
        "event_id": r.event_id,
        "event_title": r.event_title,
        "guest_count": r.guest_count,
        "pre_orders": r.get_pre_orders(),
        "status": r.status,
        "payment_status": r.payment_status,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
        "created_at": r.created_at,
    }


def producer_to_dict(p: Producer) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "image": p.image,
        "active": p.active,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


def sponsor_to_dict(s: Sponsor) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "image": s.image,
        "active": s.active,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
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
        "reservation_ids": t.get_reservation_ids(),
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
        "schedule": e.get_schedule(),
        "producers": producers if producers is not None else [],
        "sponsors": sponsors if sponsors is not None else [],
        "active": e.active,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
    }


def person_to_dict(p: Person) -> dict:
    return {
        "id": p.id,
        "person_key": p.person_key,
        "name": p.name,
        "email": p.email,
        "phone": p.phone,
        "address": p.address,
        "roles": p.get_roles(),
        "first_help_day": p.first_help_day,
        "last_help_day": p.last_help_day,
        "national_register_number": p.national_register_number,
        "eid_document_number": p.eid_document_number,
        "visits_per_month": p.visits_per_month,
        "club_name": p.club_name,
        "notes": p.notes,
        "active": p.active,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }
