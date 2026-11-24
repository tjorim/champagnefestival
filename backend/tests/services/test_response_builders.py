"""Response-builder parity at model, MCP and internal serialization boundaries."""

from datetime import UTC, date, datetime, time
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest

from app import schemas
from app.mcp.utils import dump_response
from app.models import FaqItem, VolunteerPeriod
from app.services import serializers as utils
from app.services.volunteers_service import to_volunteer_out

NOW = datetime(2026, 11, 15, 12, 30, tzinfo=UTC)
TIMESTAMPS = {"created_at": NOW, "updated_at": NOW}


@pytest.mark.parametrize(
    ("builder", "model", "fields"),
    [
        (
            utils.area_to_out,
            schemas.AreaOut,
            {
                "id": "a",
                "layout_id": "l",
                "organization_id": None,
                "label": "Bar",
                "icon": "wine",
                "x": 2.0,
                "y": 3.0,
                "rotation": 90.0,
                "width_m": 4.0,
                "length_m": 5.0,
            },
        ),
        (
            utils.venue_to_out,
            schemas.VenueOut,
            {
                "id": "v",
                "name": "Hall",
                "address": "Street",
                "city": "Town",
                "postal_code": "1000",
                "country": "BE",
                "lat": 50.0,
                "lng": 4.0,
                "active": True,
            },
        ),
        (
            utils.table_type_to_out,
            schemas.TableTypeOut,
            {
                "id": "tt",
                "name": "Round",
                "venue_id": "v",
                "shape": "round",
                "width_m": 2.0,
                "length_m": 2.0,
                "height_type": "low",
                "capacity": 8,
                "active": True,
            },
        ),
        (
            utils.room_to_out,
            schemas.RoomOut,
            {
                "id": "r",
                "venue_id": "v",
                "name": "Room",
                "width_m": 10.0,
                "length_m": 12.0,
                "color": "#abcdef",
                "active": True,
                "dimensions_placeholder": False,
            },
        ),
        (
            utils.app_settings_to_out,
            schemas.AppSettingsOut,
            {
                "member_limit": 10,
                "member_inactivity_months": 12,
                "maintenance_mode": False,
                "stamp_card_type_id": None,
                "public_email": "hello@example.org",
                "public_phone": "123",
                "facebook_url": "",
            },
        ),
    ],
)
def test_direct_projection_parity(builder: Any, model: Any, fields: dict):
    source = {**fields, **TIMESTAMPS}
    result = builder(SimpleNamespace(**source))
    assert isinstance(result, model)
    expected = {key: source[key] for key in model.model_fields}
    assert result.model_dump() == expected
    assert dump_response({"items": [result]}) == {"items": [expected]}
    assert result.model_dump(mode="json")["updated_at"] == "2026-11-15T12:30:00Z"


def person():
    return SimpleNamespace(
        id="p",
        name="Alice",
        email="alice@example.org",
        phone="123",
        preferred_language="fr",
        address="Street",
        roles=["volunteer"],
        retired_roles=None,
        role_history=None,
        national_register_number="private",
        eid_document_number="private-id",
        inactivity_exempt=False,
        inactivity_exempt_note="",
        visits_per_month=None,
        notes="Internal",
        anonymised=False,
        oidc_subject="subject",
        **TIMESTAMPS,
    )


def product(**changes):
    values = dict(
        id="wine",
        event_id="e",
        name_nl="Wijn",
        name_fr=None,
        name_en=None,
        description_nl="Beschrijving",
        description_fr=None,
        description_en=None,
        price=Decimal("12.50"),
        category="drink",
        purchasable=True,
        required=False,
        unit="table",
        stock=2,
        reserved_quantity=3,
        inclusions=[
            {"product_id": "hidden", "quantity": 1, "per_quantity": 1, "rounding": "up"},
            {"product_id": "wine", "quantity": 2, "per_quantity": 1, "rounding": "up"},
        ],
        **TIMESTAMPS,
    )
    values.update(changes)
    return SimpleNamespace(
        **values, localized_name=lambda locale: "Wijn", localized_description=lambda locale: "Beschrijving"
    )


def event():
    return SimpleNamespace(
        id="e",
        edition_id="ed",
        title="Feest",
        title_nl="Feest",
        title_fr=None,
        title_en=None,
        description_nl="Welkom",
        description_fr=None,
        description_en=None,
        localized_title=lambda locale: "Feest",
        localized_description=lambda locale: "Welkom",
        date=date(2026, 11, 15),
        start_time=time(12),
        end_time=None,
        category="festival",
        volunteers_only=False,
        members_only=False,
        registration_required=True,
        registrations_open_from=None,
        registrations_close_at=None,
        active=True,
        order_questions=[],
        products=[product(), product(id="hidden", purchasable=False)],
        edition=None,
        **TIMESTAMPS,
    )


def registration():
    return SimpleNamespace(
        id="reg",
        poll_question_id=None,
        person_id="p",
        event_id="e",
        guest_count=4,
        order_answers=[],
        order_items=[
            {"product_id": "wine", "name": "Wijn", "quantity": 2, "price": "12.50", "category": "drink"},
            {
                "product_id": "hidden",
                "name": "Hidden",
                "quantity": 1,
                "price": "0",
                "category": "drink",
                "visible": False,
            },
        ],
        notes="Arrival",
        allocations=[
            SimpleNamespace(table_id="t", guest_count=4, exclusive=True, table=SimpleNamespace(name="Table 1"))
        ],
        booked_table_quantity=2,
        status="confirmed",
        payment_status="paid",
        amount_due=Decimal("20.00"),
        amount_paid=Decimal("25.00"),
        checked_in=False,
        checked_in_at=None,
        strap_issued=False,
        check_in_token="secret",
        **TIMESTAMPS,
    )


def test_product_and_event_public_admin_parity():
    admin = utils.event_to_summary_out(event())
    public = utils.event_to_summary_out(event(), public=True, locale="fr")
    assert isinstance(admin, schemas.EventOut)
    assert isinstance(public, schemas.EventPublicOut)
    assert len(admin.products) == len(public.products) == 1
    assert admin.products[0].stock == 2
    assert admin.products[0].shortage == 1
    assert admin.products[0].available_quantity == 0
    assert admin.products[0].sold_out
    assert admin.model_dump(mode="json")["products"][0]["price"] == "12.50"
    public_product = public.products[0].model_dump()
    assert "stock" not in public_product and "reserved_quantity" not in public_product
    assert "included_product_id" not in public_product and "included_per_guests" not in public_product
    assert [edge["product_id"] for edge in public_product["inclusions"]] == ["wine"]
    assert public.title == "Feest" and public.title_fr is None
    assert utils.product_to_out(product(stock=None)).available_quantity is None
    assert not utils.product_to_out(product(stock=None)).sold_out


def test_all_registration_variants_preserve_projections_and_computed_values():
    r, p, e = registration(), person(), event()
    admin = utils.registration_to_out(r, p, e)
    public = utils.registration_to_out(r, p, e, public=True)
    listed = utils.registration_to_list_out(r, p, e)
    token = utils.registration_to_out_with_token(r, p, e)
    guest = utils.registration_to_guest_out(r, p, e)
    checkin = utils.registration_to_checkin_out(r, p, e)
    assert isinstance(admin, schemas.RegistrationOut)
    assert isinstance(public, schemas.RegistrationPublicOut)
    assert isinstance(listed, schemas.RegistrationListOut)
    assert isinstance(token, schemas.RegistrationOutWithToken)
    assert isinstance(guest, schemas.RegistrationGuestOut)
    assert isinstance(checkin, schemas.CheckInGuestOut)
    for result in (admin, public, listed, token):
        assert result.booked_table_quantity == 2
        assert result.table_id == "t"
        assert result.allocations[0].exclusive
        assert result.refund_due == Decimal("5.00")
        assert "national_register_number" not in result.person.model_dump()
    assert len(admin.order_items) == 2
    assert len(public.order_items) == len(guest.order_items) == 1
    assert "check_in_token" not in admin.model_dump()
    assert token.check_in_token == guest.check_in_token == "secret"
    assert checkin.table_name == "Table 1"
    assert "check_in_token" not in checkin.model_dump()
    assert dump_response(admin)["edition_id"] == "ed"
    assert "stamp_progress" not in dump_response(admin)
    assert "delivered_quantity" not in dump_response(admin)["order_items"][0]
    assert "delivered" not in dump_response(admin)["order_items"][0]
    assert admin.model_dump()["order_items"][0]["delivered_quantity"] == 0
    replay = schemas.RegistrationOut.model_validate(admin.model_dump(mode="json"))
    replay._from_idempotency_replay = True
    assert dump_response(replay) == admin.model_dump(mode="json")
    assert "edition_id" not in dump_response(replay)
    assert isinstance(dump_response(replay)["created_at"], str)
    r.amount_due = None
    assert utils.registration_to_out(r, p, e).refund_due is None


@pytest.mark.parametrize(
    "delivery",
    [
        {},
        {"delivered_quantity": 2},
        {"delivered_quantity": 1, "delivered": False},
        {"delivered_quantity": 2, "delivered": True},
    ],
)
def test_mcp_registration_preserves_stored_order_fields(delivery):
    r = registration()
    stored = {
        "product_id": "wine",
        "name": "Wijn",
        "quantity": 2,
        "price": 12.5,
        "category": "drink",
        **delivery,
    }
    r.order_items = [stored]
    result = utils.registration_to_out(r, person(), event())
    assert dump_response(result)["order_items"] == [stored]
    # REST keeps its existing complete, derived delivery projection.
    rest_item = result.model_dump()["order_items"][0]
    expected = delivery.get("delivered_quantity", 0)
    assert rest_item["delivered_quantity"] == expected
    assert rest_item["delivered"] == (expected == 2)


def test_people_volunteer_and_faq_boundaries():
    p = person()
    full = utils.person_to_out(p)
    summary = utils.person_admin_summary_out(p)
    assert full.national_register_number == "private"
    assert "national_register_number" not in summary.model_dump()
    assert full.retired_roles == full.role_history == {}
    period = VolunteerPeriod(id=1, first_help_day=date(2026, 11, 15), last_help_day=None, notes="")
    volunteer = to_volunteer_out(p, [period])
    assert volunteer.help_periods[0].first_help_day == period.first_help_day
    assert volunteer.oidc_subject == "subject"
    assert "email" not in volunteer.model_dump()
    faq = utils.faq_item_to_public_out(FaqItem(id="faq", question_nl="Vraag", answer_nl="Antwoord"), "fr")
    assert faq.model_dump() == {"id": "faq", "question": "Vraag", "answer": "Antwoord"}
    assert dump_response(volunteer)["created_at"] is NOW


def test_edition_organization_and_floor_plan_composition():
    p = person()
    organization: Any = SimpleNamespace(
        id=1,
        name="Producer",
        image="logo.svg",
        website="https://example.org",
        description_nl="Producent",
        description_fr=None,
        description_en=None,
        active=True,
        type="producer",
        contact_person_id=p.id,
        **TIMESTAMPS,
    )
    out = utils.organization_to_out(organization, p)
    assert out.contact_person is not None
    assert out.contact_person.id == p.id
    assert "address" not in out.contact_person.model_dump()
    edition: Any = SimpleNamespace(
        id="ed",
        year=2026,
        month="november",
        edition_type="festival",
        active=True,
        organizations=[1],
        flyer_image=None,
        hero_image="hero.jpg",
        share_image=None,
        **TIMESTAMPS,
    )
    venue = schemas.VenueOut(
        id="v",
        name="Hall",
        address="Street",
        city="Town",
        postal_code="1000",
        country="BE",
        lat=50,
        lng=4,
        active=True,
        **TIMESTAMPS,
    )
    item = schemas.EditionItemOut.model_validate(organization)
    admin = utils.edition_to_out(edition, venue, events=[utils.event_to_summary_out(event())], producers=[item])
    public = utils.edition_to_out(
        edition, venue, events=[utils.event_to_summary_out(event(), public=True)], producers=[item], public=True
    )
    assert isinstance(admin, schemas.EditionOut)
    assert isinstance(public, schemas.EditionPublicOut)
    assert admin.organizations == [1]
    assert "organizations" not in public.model_dump()
    assert "contact_person" not in public.producers[0].model_dump()
    assert public.producers[0].description_fr is None
    assert utils.edition_summary_to_out(edition).model_dump() == {
        "id": "ed",
        "year": 2026,
        "month": "november",
        "edition_type": "festival",
        "active": True,
    }
    layout: Any = SimpleNamespace(
        id="l", edition_id="ed", event_id="e", event=event(), room_id="r", label="Lunch", **TIMESTAMPS
    )
    assert utils.layout_to_out(layout, date=event().date).event_title == "Feest"
    table: Any = SimpleNamespace(
        id="t",
        event_id="e",
        name="Table",
        capacity=6,
        x=1,
        y=2,
        table_type_id="tt",
        rotation=45,
        layout_id="l",
        **TIMESTAMPS,
    )
    assert utils.table_to_out(table, ["reg"]).registration_ids == ["reg"]
    assert utils.table_to_out(table, [], capacity=0).capacity == 0
