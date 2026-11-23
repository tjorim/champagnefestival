"""Shared response-model construction and internal serialization helpers."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from typing import Literal, overload
from typing import cast as type_cast

from app.core.translations import resolve_text
from app.models import (
    AppSettings,
    Area,
    Edition,
    Event,
    FaqItem,
    Layout,
    Organization,
    Person,
    Product,
    Registration,
    RegistrationOrderAnswer,
    Room,
    Table,
    TableType,
    Venue,
)
from app.schemas import (
    AppSettingsOut,
    AreaOut,
    CheckInGuestOut,
    EditionItemOut,
    EditionOut,
    EditionPublicOut,
    EditionSummaryOut,
    EventOut,
    EventPublicOut,
    FaqItemPublicOut,
    LayoutOut,
    OrganizationOut,
    PersonAdminSummaryOut,
    PersonOut,
    PersonSummaryOut,
    ProductOut,
    ProductPublicOut,
    RegistrationGuestOut,
    RegistrationListOut,
    RegistrationOut,
    RegistrationOutWithToken,
    RegistrationPublicOut,
    RoomOut,
    TableOut,
    TableTypeOut,
    VenueOut,
)


def edition_display_name(edition: Edition) -> str:
    """The admin's display name for an edition, e.g. ``March 2027``.

    Mirrors ``editionDisplayName`` in ``frontend/src/lib/editions/editionName.ts``; the
    edition id (``2027-march``) is internal and not shown to people.
    """
    month = edition.month.strip()
    return f"{month[:1].upper()}{month[1:]} {edition.year}".strip()


def event_text_dict(event: Event, locale: str | None = None) -> dict:
    """Event title/description for *locale* (``title``/``description``, falling
    back to Dutch) plus every stored language."""
    return {
        "title": event.localized_title(locale),
        "description": event.localized_description(locale),
        "title_nl": event.title_nl,
        "title_fr": event.title_fr,
        "title_en": event.title_en,
        "description_nl": event.description_nl,
        "description_fr": event.description_fr,
        "description_en": event.description_en,
    }


@overload
def event_to_summary_out(
    event: Event, include_edition: bool = False, *, public: Literal[False] = False, locale: str | None = None
) -> EventOut: ...


@overload
def event_to_summary_out(
    event: Event, include_edition: bool = False, *, public: Literal[True], locale: str | None = None
) -> EventPublicOut: ...


@overload
def event_to_summary_out(
    event: Event, include_edition: bool = False, *, public: bool, locale: str | None = None
) -> EventOut | EventPublicOut: ...


def event_to_summary_out(
    event: Event, include_edition: bool = False, *, public: bool = False, locale: str | None = None
) -> EventOut | EventPublicOut:
    """``locale`` resolves ``title``/``description`` for that language (Dutch
    when ``None``); the per-language fields are always included."""
    edition: Edition | None = getattr(event, "edition", None)
    # Both projections include only purchasable products. The public model also
    # removes inclusion edges targeting hidden products (#1020).
    return (EventPublicOut if public else EventOut)(
        id=event.id,
        edition_id=event.edition_id,
        **event_text_dict(event, locale),
        date=event.date,
        start_time=event.start_time,
        end_time=event.end_time,
        category=event.category,
        volunteers_only=event.volunteers_only,
        members_only=event.members_only,
        registration_required=event.registration_required,
        registrations_open_from=event.registrations_open_from,
        registrations_close_at=event.registrations_close_at,
        active=event.active,
        created_at=event.created_at,
        updated_at=event.updated_at,
        edition=edition_summary_to_out(edition) if include_edition and edition is not None else None,
        order_questions=[q.as_dict() for q in event.order_questions if not public or q.active],
        products=_public_products(event.products, locale)
        if public
        else [product_to_out(p, locale) for p in event.products if p.purchasable],
    )


def _public_products(products: Sequence[Product], locale: str | None = None) -> list[ProductPublicOut]:
    purchasable_ids = {p.id for p in products if p.purchasable}
    return [product_to_public_out(p, purchasable_ids, locale) for p in products if p.id in purchasable_ids]


def product_text_dict(p: Product, locale: str | None = None) -> dict:
    """Product name/description for *locale* (``name``/``description``, falling back
    to Dutch) plus every stored language."""
    return {
        "name": p.localized_name(locale),
        "description": p.localized_description(locale),
        "name_nl": p.name_nl,
        "name_fr": p.name_fr,
        "name_en": p.name_en,
        "description_nl": p.description_nl,
        "description_fr": p.description_fr,
        "description_en": p.description_en,
    }


def order_item_name(item: dict, locale: str | None) -> str:
    """An order line's product name in *locale*, falling back to the Dutch
    name stored with the order (older orders carry only that)."""
    return resolve_text({code: item.get(f"name_{code}") for code in ("nl", "fr", "en")}, locale) or item["name"]


def product_available_quantity(p: Product) -> int | None:
    return max(0, p.stock - p.reserved_quantity) if p.stock is not None else None


def product_sold_out(p: Product, available_quantity: int | None) -> bool:
    return p.purchasable and available_quantity is not None and available_quantity <= 0


def product_to_out(p: Product, locale: str | None = None) -> ProductOut:
    available_quantity = product_available_quantity(p)
    return ProductOut(
        id=p.id,
        event_id=p.event_id,
        **product_text_dict(p, locale),
        price=p.price,
        category=p.category,
        purchasable=p.purchasable,
        required=p.required,
        included_product_id=p.included_product_id,
        included_per_guests=p.included_per_guests,
        unit=type_cast(Literal["item", "table", "person"], p.unit),
        stock=p.stock,
        inclusions=p.inclusions,
        reserved_quantity=p.reserved_quantity,
        available_quantity=available_quantity,
        shortage=max(0, p.reserved_quantity - p.stock) if p.stock is not None else 0,
        sold_out=product_sold_out(p, available_quantity),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def product_to_public_out(
    p: Product, purchasable_ids: set[str] | None = None, locale: str | None = None
) -> ProductPublicOut:
    """The visitor-safe shape of a product — never exposes `stock`, and never
    named unless `p.purchasable`. `purchasable_ids`, when given, is the set
    of this event's purchasable product ids: any inclusion edge (or the
    legacy `included_product_id`) pointing outside that set targets a hidden
    product and is stripped, so a hidden product's id never reaches an
    unauthenticated caller even as a bare bundle-target reference. See
    app.schemas.ProductPublicOut."""
    available_quantity = product_available_quantity(p)
    inclusions = p.inclusions
    included_product_id = p.included_product_id
    included_per_guests = p.included_per_guests
    if purchasable_ids is not None:
        if inclusions is not None:
            inclusions = [edge for edge in inclusions if edge["product_id"] in purchasable_ids]
        if included_product_id is not None and included_product_id not in purchasable_ids:
            included_product_id = None
            included_per_guests = None
    return ProductPublicOut(
        id=p.id,
        **product_text_dict(p, locale),
        price=p.price,
        category=p.category,
        unit=type_cast(Literal["item", "table", "person"], p.unit),
        required=p.required,
        purchasable=p.purchasable,
        available_quantity=available_quantity,
        sold_out=product_sold_out(p, available_quantity),
        inclusions=inclusions,
        included_product_id=included_product_id,
        included_per_guests=included_per_guests,
    )


def _visible_order_items(items: list[dict]) -> list[dict]:
    """Order items a visitor may be shown — a hidden line's `visible=False`
    is only advisory to the admin UI; a visitor-facing response must actually
    drop the line rather than merely flag it, or its name/product_id leaks."""
    return [i for i in items if i.get("visible", True)]


def _registration_response[
    T: RegistrationOut
    | RegistrationPublicOut
    | RegistrationOutWithToken
    | RegistrationListOut
    | RegistrationGuestOut
    | CheckInGuestOut
](response: T, stored_items: list[dict]) -> T:
    # Delivery validators derive defaults and mark them as set. REST has always
    # serialized those defaults, but MCP historically sent only stored keys.
    # Preserve that distinction for exclude_unset at the MCP boundary, including
    # old order lines that predate delivered_quantity.
    for item, stored in zip(response.order_items, stored_items, strict=True):
        item.model_fields_set.intersection_update(stored)
    return response


@overload
def registration_to_out(
    r: Registration, person: Person, event: Event, *, public: Literal[False] = False
) -> RegistrationOut: ...


@overload
def registration_to_out(
    r: Registration, person: Person, event: Event, *, public: Literal[True]
) -> RegistrationPublicOut: ...


@overload
def registration_to_out(
    r: Registration, person: Person, event: Event, *, public: bool
) -> RegistrationOut | RegistrationPublicOut: ...


def registration_to_out(
    r: Registration, person: Person, event: Event, *, public: bool = False
) -> RegistrationOut | RegistrationPublicOut:
    """Build a registration response without the check-in token.

    `public=True` for the unauthenticated booking response (POST
    /api/registrations) — see `event_to_summary_out`. Also strips any
    non-`visible` order item from the returned `order_items`, since this is
    the visitor's own view of the booking, not an admin one.
    """
    return _registration_response(
        (RegistrationPublicOut if public else RegistrationOut)(
            id=r.id,
            poll_question_id=r.poll_question_id,
            person_id=r.person_id,
            person=person_summary_to_out(person),
            event_id=r.event_id,
            event=event_to_summary_out(event, include_edition=True, public=public),
            guest_count=r.guest_count,
            order_answers=[a.as_dict() for a in r.order_answers],
            order_items=_visible_order_items(r.order_items) if public else r.order_items,
            notes=r.notes,
            table_id=r.allocations[0].table_id if r.allocations else None,
            booked_table_quantity=sum(
                i["quantity"]
                for i in r.order_items
                if (r.product_snapshot or {}).get(i["product_id"], {}).get("unit") == "table"
            ),
            allocations=[
                {"table_id": a.table_id, "guest_count": a.guest_count, "exclusive": a.exclusive} for a in r.allocations
            ],
            status=type_cast(Literal["pending", "confirmed", "cancelled"], r.status),
            payment_status=type_cast(Literal["unpaid", "partial", "paid"], r.payment_status),
            amount_due=r.amount_due,
            amount_paid=r.amount_paid,
            refund_due=None if r.amount_due is None else max(0, (r.amount_paid or 0) - r.amount_due),
            checked_in=r.checked_in,
            checked_in_at=r.checked_in_at,
            strap_issued=r.strap_issued,
            created_at=r.created_at,
            updated_at=r.updated_at,
        ),
        _visible_order_items(r.order_items) if public else r.order_items,
    )


def registration_to_checkin_out(
    r: Registration,
    person: Person,
    event: Event,
    table_name: str | None = None,
) -> CheckInGuestOut:
    """Serialise a Registration for the public check-in GET endpoint."""
    return _registration_response(
        CheckInGuestOut(
            id=r.id,
            name=person.name,
            event_id=r.event_id,
            edition_id=event.edition_id,
            event_title=event.title,
            table_id=r.allocations[0].table_id if r.allocations else None,
            table_name=", ".join(a.table.name for a in r.allocations) or table_name,
            guest_count=r.guest_count,
            order_items=r.order_items,
            notes=r.notes,
            status=type_cast(Literal["pending", "confirmed", "cancelled"], r.status),
            checked_in=r.checked_in,
            checked_in_at=r.checked_in_at,
            strap_issued=r.strap_issued,
        ),
        r.order_items,
    )


def registration_to_out_with_token(r: Registration, person: Person, event: Event) -> RegistrationOutWithToken:
    """Serialise a Registration ORM row including the sensitive check_in_token."""
    return _registration_response(
        RegistrationOutWithToken(**registration_to_out(r, person, event).model_dump(), check_in_token=r.check_in_token),
        r.order_items,
    )


def registration_to_list_out(r: Registration, person: Person, event: Event) -> RegistrationListOut:
    """Admin list includes notes needed for manual table allocation."""
    return _registration_response(
        RegistrationListOut(
            **registration_to_out(r, person, event).model_dump(),
            table_names=[allocation.table.name for allocation in r.allocations],
        ),
        r.order_items,
    )


def registration_to_guest_out(r: Registration, person: Person, event: Event) -> RegistrationGuestOut:
    """Serialise a Registration for the visitor self-lookup endpoint — always
    strips non-`visible` order items, same as `registration_to_out`'s
    `public=True` path; this function has no admin caller."""
    return _registration_response(
        RegistrationGuestOut(
            id=r.id,
            name=person.name,
            event_id=r.event_id,
            event_title=event.title,
            event_date=event.date,
            check_in_token=r.check_in_token,
            guest_count=r.guest_count,
            order_answers=[a.as_dict() for a in r.order_answers],
            order_items=_visible_order_items(r.order_items),
            status=type_cast(Literal["pending", "confirmed", "cancelled"], r.status),
            payment_status=type_cast(Literal["unpaid", "partial", "paid"], r.payment_status),
            amount_due=r.amount_due,
            amount_paid=r.amount_paid,
            refund_due=None if r.amount_due is None else max(0, (r.amount_paid or 0) - r.amount_due),
            checked_in=r.checked_in,
            checked_in_at=r.checked_in_at,
            strap_issued=r.strap_issued,
            created_at=r.created_at,
        ),
        _visible_order_items(r.order_items),
    )


def organization_to_out(e: Organization, contact_person: Person | None = None) -> OrganizationOut:
    return OrganizationOut(
        id=e.id,
        name=e.name,
        image=e.image,
        website=e.website,
        description_nl=e.description_nl,
        description_fr=e.description_fr,
        description_en=e.description_en,
        active=e.active,
        type=e.type,
        contact_person_id=e.contact_person_id,
        contact_person=person_summary_to_out(contact_person) if contact_person else None,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


def area_to_out(a: Area) -> AreaOut:
    return AreaOut.model_validate(a, from_attributes=True)


def venue_to_out(v: Venue) -> VenueOut:
    return VenueOut.model_validate(v, from_attributes=True)


def table_type_to_out(tt: TableType) -> TableTypeOut:
    return TableTypeOut.model_validate(tt, from_attributes=True)


def layout_to_out(lay: Layout, date: date | None = None) -> LayoutOut:
    return LayoutOut(
        event_id=lay.event_id,
        event_title=lay.event.title,
        id=lay.id,
        edition_id=lay.edition_id,
        room_id=lay.room_id,
        date=date,
        label=lay.label,
        created_at=lay.created_at,
        updated_at=lay.updated_at,
    )


def table_to_out(t: Table, registration_ids: list[str], *, capacity: int | None = None) -> TableOut:
    return TableOut(
        event_id=t.event_id,
        id=t.id,
        name=t.name,
        capacity=t.capacity if capacity is None else capacity,
        x=t.x,
        y=t.y,
        table_type_id=t.table_type_id,
        rotation=t.rotation,
        layout_id=t.layout_id,
        registration_ids=registration_ids,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def room_to_out(r: Room) -> RoomOut:
    return RoomOut.model_validate(r, from_attributes=True)


def edition_summary_to_out(e: Edition) -> EditionSummaryOut:
    return EditionSummaryOut.model_validate(e, from_attributes=True)


def edition_to_out(
    e: Edition,
    venue: VenueOut,
    dates: list | None = None,
    events: list[EventOut | EventPublicOut] | None = None,
    producers: list[EditionItemOut] | None = None,
    sponsors: list[EditionItemOut] | None = None,
    vendors: list[EditionItemOut] | None = None,
    co_organizer: EditionItemOut | None = None,
    public: bool = False,
) -> EditionOut | EditionPublicOut:
    return (EditionPublicOut if public else EditionOut)(
        id=e.id,
        year=e.year,
        month=e.month,
        edition_type=type_cast(Literal["festival", "bourse", "capsule_exchange"], e.edition_type),
        dates=dates if dates is not None else [],
        venue=venue,
        events=events if events is not None else [],
        organizations=list(e.organizations),
        producers=producers if producers is not None else [],
        sponsors=sponsors if sponsors is not None else [],
        vendors=vendors if vendors is not None else [],
        co_organizer=co_organizer,
        flyer_image=e.flyer_image,
        hero_image=e.hero_image,
        share_image=e.share_image,
        active=e.active,
        created_at=e.created_at,
        updated_at=e.updated_at,
    )


def person_summary_to_out(p: Person) -> PersonSummaryOut:
    """Serialise only public-safe person fields for embedding in registration responses."""
    return PersonSummaryOut.model_validate(p, from_attributes=True)


def app_settings_to_out(s: AppSettings) -> AppSettingsOut:
    return AppSettingsOut.model_validate(s, from_attributes=True)


def faq_item_to_public_out(f: FaqItem, locale: str) -> FaqItemPublicOut:
    """Public shape: the question/answer for *locale*, or Dutch
    when that locale is not fully translated."""
    question, answer = f.localized(locale)
    return FaqItemPublicOut(id=f.id, question=question, answer=answer)


def person_to_out(p: Person) -> PersonOut:
    return PersonOut(
        id=p.id,
        name=p.name,
        email=p.email,
        phone=p.phone,
        preferred_language=type_cast(Literal["nl", "fr", "en"] | None, p.preferred_language),
        address=p.address,
        roles=p.roles,
        retired_roles=dict(p.retired_roles or {}),
        role_history={role: [dict(s) for s in stretches] for role, stretches in (p.role_history or {}).items()},
        national_register_number=p.national_register_number,
        eid_document_number=p.eid_document_number,
        inactivity_exempt=p.inactivity_exempt,
        inactivity_exempt_note=p.inactivity_exempt_note,
        visits_per_month=p.visits_per_month,
        notes=p.notes,
        anonymised=p.anonymised,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def person_admin_summary_out(p: Person) -> PersonAdminSummaryOut:
    """``person_to_out`` without the volunteer-only NISS/eID fields.

    For reads that browse or look up a person without editing or verifying
    those specific fields — see ``PersonAdminSummaryOut`` in ``app.schemas`` for
    the REST-side equivalent restriction and why create/update/merge don't
    use this (docs/decisions/934-data-retention-and-erasure.md). MCP tools
    return plain dicts with no response-model filtering, so this is applied
    explicitly rather than relying on schema validation to drop the keys.
    """
    return PersonAdminSummaryOut.model_validate(person_to_out(p), from_attributes=True)


def order_answer_text(answer: RegistrationOrderAnswer) -> str:
    """Dutch question/value for admin exports; CSV escaping happens at the boundary."""
    value = answer.text if answer.text is not None else answer.rating
    if answer.option_id is not None:
        value = next((o.label_nl for o in answer.question.options if o.id == answer.option_id), "")
    return f"{answer.question.title_nl}: {value}"
