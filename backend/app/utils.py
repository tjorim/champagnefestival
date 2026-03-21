"""Shared serialisation helpers for ORM → dict conversions."""

from __future__ import annotations

import secrets
import time
from typing import Any

from sqlalchemy import Text, cast

from app.models import (
    Area,
    Edition,
    Event,
    Exhibitor,
    Layout,
    Person,
    Registration,
    Room,
    Table,
    TableType,
    Venue,
)


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
    }
    edition: Edition | None = getattr(event, "edition", None)
    if include_edition and edition is not None:
        data["edition"] = edition_summary_to_dict(edition)
    return data


def registration_to_dict(r: Registration) -> dict:
    """Serialise a Registration ORM row to a plain dict (no check_in_token)."""
    person: Person | None = getattr(r, "_person", None)
    event: Event | None = getattr(r, "_event", None)
    if person is None:
        raise ValueError(
            f"Registration {r.id!r} has no attached _person; caller must set r._person before serialising."
        )
    if event is None:
        raise ValueError(
            f"Registration {r.id!r} has no attached _event; caller must set r._event before serialising."
        )
    return {
        "id": r.id,
        "person_id": r.person_id,
        "person": person_summary_to_dict(person),
        "event_id": r.event_id,
        "event": event_to_summary_dict(event, include_edition=True),
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


def registration_to_checkin_dict(r: Registration) -> dict:
    """Serialise a Registration for the public check-in GET endpoint."""
    person: Person | None = getattr(r, "_person", None)
    event: Event | None = getattr(r, "_event", None)
    if person is None or event is None:
        raise ValueError(
            f"Registration {r.id!r} requires attached _person and _event before serialising."
        )
    return {
        "id": r.id,
        "name": person.name,
        "event_id": r.event_id,
        "event_title": event.title,
        "guest_count": r.guest_count,
        "pre_orders": r.pre_orders,
        "notes": r.notes,
        "status": r.status,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
    }


def registration_to_dict_with_token(r: Registration) -> dict:
    """Serialise a Registration ORM row including the sensitive check_in_token."""
    return {**registration_to_dict(r), "check_in_token": r.check_in_token}


def registration_to_list_dict(r: Registration) -> dict:
    """Serialise a Registration for the list endpoint (drops notes)."""
    d = registration_to_dict(r)
    d.pop("notes", None)
    return d


def registration_to_guest_dict(r: Registration) -> dict:
    """Serialise a Registration for the visitor self-lookup endpoint."""
    person: Person | None = getattr(r, "_person", None)
    event: Event | None = getattr(r, "_event", None)
    return {
        "id": r.id,
        "name": person.name if person else "",
        "event_id": r.event_id,
        "event_title": event.title if event else "",
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


def layout_to_dict(lay: Layout, date: object | None = None) -> dict:
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


def table_to_dict(t: Table, reservation_ids: list[str] | None = None) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "capacity": t.capacity,
        "x": t.x,
        "y": t.y,
        "table_type_id": t.table_type_id,
        "rotation": t.rotation,
        "layout_id": t.layout_id,
        "reservation_ids": reservation_ids if reservation_ids is not None else t.reservation_ids,
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
    dates: dict | None = None,
    events: list[dict] | None = None,
    producers: list[dict] | None = None,
    sponsors: list[dict] | None = None,
) -> dict:
    return {
        "id": e.id,
        "year": e.year,
        "month": e.month,
        "edition_type": e.edition_type,
        "external_partner": e.external_partner,
        "external_contact_name": e.external_contact_name,
        "external_contact_email": e.external_contact_email,
        "dates": dates,
        "venue": venue,
        "events": events if events is not None else [],
        "producers": producers if producers is not None else [],
        "sponsors": sponsors if sponsors is not None else [],
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
