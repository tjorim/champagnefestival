"""Shared serialisation helpers for ORM → dict conversions."""

from app.models import Reservation, Table


def reservation_to_dict(r: Reservation) -> dict:
    """Serialise a Reservation ORM row to a plain dict (no check_in_token)."""
    return {
        "id": r.id,
        "name": r.name,
        "email": r.email,
        "phone": r.phone,
        "event_id": r.event_id,
        "event_title": r.event_title,
        "guest_count": r.guest_count,
        "pre_orders": r.get_pre_orders(),
        "notes": r.notes,
        "table_id": r.table_id,
        "status": r.status,
        "payment_status": r.payment_status,
        "checked_in": r.checked_in,
        "checked_in_at": r.checked_in_at,
        "strap_issued": r.strap_issued,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
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
    return {
        "id": r.id,
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
        "reservation_ids": t.get_reservation_ids(),
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }
