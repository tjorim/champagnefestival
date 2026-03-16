"""Shared serialisation helpers for ORM → dict conversions."""

import secrets
import time
from typing import Any

from app.models import Edition, Person, Reservation, Room, Table


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


def table_to_dict(t: Table) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "capacity": t.capacity,
        "x": t.x,
        "y": t.y,
        "room_id": t.room_id,
        "shape": t.shape,
        "width_m": t.width_m,
        "height_m": t.height_m,
        "rotation": t.rotation,
        "reservation_ids": t.get_reservation_ids(),
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


def room_to_dict(r: Room) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "zone_type": r.zone_type,
        "width_m": r.width_m,
        "height_m": r.height_m,
        "color": r.color,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


def edition_to_dict(e: Edition) -> dict:
    return {
        "id": e.id,
        "year": e.year,
        "month": e.month,
        "friday": e.friday.isoformat(),
        "saturday": e.saturday.isoformat(),
        "sunday": e.sunday.isoformat(),
        "venue_name": e.venue_name,
        "venue_address": e.venue_address,
        "venue_city": e.venue_city,
        "venue_postal_code": e.venue_postal_code,
        "venue_country": e.venue_country,
        "venue_lat": e.venue_lat,
        "venue_lng": e.venue_lng,
        "schedule": e.get_schedule(),
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
