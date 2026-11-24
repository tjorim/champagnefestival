"""Wire parity for independent service projections migrated in #1657."""

from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from pydantic import BaseModel

from app.models import (
    Announcement,
    ComposedMessage,
    EmailCategory,
    Event,
    EventCategory,
    PaymentTransaction,
    Person,
    PolicyVersion,
    Registration,
)
from app.schemas import AnnouncementOut, CategoryOut, EmailCategoryOut, PaymentTransactionOut, PolicyVersionOut
from app.schemas.actors import ActorLabel
from app.services import (
    announcements_service,
    categories,
    composer_service,
    email_categories_service,
    payments_service,
    policies_service,
)

ACTOR_LABEL = ActorLabel(kind="unknown")
POLICY_LABELS = {"admin": ACTOR_LABEL, "publisher": ACTOR_LABEL}

NOW = datetime(2026, 11, 15, 12, 34, 56, tzinfo=UTC)

# These dictionaries are the pre-migration Python transport payloads, including
# explicit null translations, timestamps and exact decimal strings.
ANNOUNCEMENT = {
    "id": "ann_parity",
    "text_nl": "Welkom",
    "text_fr": None,
    "text_en": "Welcome",
    "level": "warning",
    "active": True,
    "sort_order": 3,
    "starts_at": NOW,
    "ends_at": None,
    "link_url": None,
    "link_label_nl": None,
    "link_label_fr": None,
    "link_label_en": None,
    "published_at": NOW,
    "published_by": "admin",
    "created_at": NOW,
    "updated_at": NOW,
}
CATEGORY = {
    "key": "parity",
    "label_nl": "Categorie",
    "label_fr": None,
    "label_en": "Category",
    "sort_order": 2,
    "created_at": NOW,
    "updated_at": NOW,
}
EMAIL_CATEGORY = {
    "key": "parity",
    "name_nl": "Nieuws",
    "name_fr": None,
    "name_en": "News",
    "description_nl": "Berichten",
    "description_fr": None,
    "description_en": None,
    "allowed_roles": ["member"],
    "automatic": False,
    "sort_order": 4,
    "created_at": NOW,
    "updated_at": NOW,
}
VERSION = {
    "id": "polv_parity",
    "policy_key": "privacy",
    "version_number": 2,
    "status": "superseded",
    "content_nl": "Bron",
    "content_fr": None,
    "content_en": "Source",
    "change_summary": None,
    "created_at": NOW,
    "created_by": "admin",
    "updated_at": NOW,
    "published_at": NOW,
    "published_by": "publisher",
}
VERSION_OUT = VERSION | {
    "created_by_label": ACTOR_LABEL.model_dump(),
    "published_by_label": ACTOR_LABEL.model_dump(),
}

PAYMENT = {
    "id": "txn_parity",
    "registration_id": "reg_parity",
    "amount": "-12.30",
    "effective_date": date(2026, 11, 14),
    "recorded_at": NOW,
    "recorded_by": "admin",
    "reference": None,
    "note": "Refund",
    "reversed_transaction_id": "txn_original",
}


@pytest.mark.parametrize(
    ("builder", "entity", "model", "expected"),
    [
        (announcements_service.to_out, Announcement(**ANNOUNCEMENT), AnnouncementOut, ANNOUNCEMENT),
        (
            lambda row: categories.category_to_out(row, "fr"),
            EventCategory(**CATEGORY),
            CategoryOut,
            {**CATEGORY, "label": "Categorie"},
        ),
        (
            lambda row: categories.category_to_out(row, "en"),
            EventCategory(**CATEGORY),
            CategoryOut,
            {**CATEGORY, "label": "Category"},
        ),
        (
            lambda row: email_categories_service.category_to_out(row, "fr"),
            EmailCategory(**EMAIL_CATEGORY),
            EmailCategoryOut,
            {**EMAIL_CATEGORY, "name": "Nieuws", "description": "Berichten"},
        ),
        (
            lambda row: policies_service._version_to_out(row, POLICY_LABELS),
            PolicyVersion(**VERSION),
            PolicyVersionOut,
            VERSION_OUT,
        ),
    ],
)
def test_entity_projection_preserves_python_transport(builder, entity, model, expected):
    result = builder(entity)
    assert isinstance(result, model)
    assert result.model_dump() == expected
    assert result.model_dump()["created_at"] is NOW


def test_payment_models_preserve_decimal_and_mcp_transport():
    from app.mcp.admin.payments import _payload

    transaction = PaymentTransaction(**{**PAYMENT, "amount": Decimal("-12.30")})
    result = payments_service.payment_transaction_to_out(transaction, ACTOR_LABEL)
    assert isinstance(result, PaymentTransactionOut)
    assert result.amount == Decimal("-12.30")
    assert result.model_dump(mode="json")["amount"] == "-12.30"
    assert _payload(result) == PAYMENT | {"actor_label": ACTOR_LABEL.model_dump()}
    ledger = payments_service.ledger_row_to_out(
        transaction, Registration(), Person(name="Visitor"), Event(title_nl="Event", edition=None), ACTOR_LABEL
    )
    assert ledger.model_dump(mode="json")["amount"] == "-12.30"
    assert ledger.person_name == "Visitor"
    assert ledger.edition_label == ""


@pytest.mark.anyio
async def test_composer_projection_preserves_counts_snapshots_and_nulls(monkeypatch):
    values = {
        "id": "msg_parity",
        "title_nl": "Titel",
        "title_fr": None,
        "title_en": None,
        "body_nl": "Tekst",
        "body_fr": None,
        "body_en": None,
        "level": "info",
        "channels": ["push", "email"],
        "link_url": None,
        "email_category_key": "news",
        "state": "sent",
        "scheduled_at": None,
        "announcement_id": None,
        "push_audience_snapshot": ["opaque-id"],
        "email_audience_snapshot": [],
        "sent_at": NOW,
        "sent_by": "admin",
        "created_at": NOW,
        "updated_at": NOW,
    }
    counts = {
        "push_delivered_count": 3,
        "push_failed_count": 1,
        "push_pending_count": 2,
        "email_accepted_count": 4,
        "email_failed_count": 1,
        "email_skipped_count": 2,
        "email_pending_count": 3,
    }
    monkeypatch.setattr(composer_service, "_estimated_push_audience", AsyncMock(return_value=7))
    monkeypatch.setattr(composer_service, "_estimated_email_audience", AsyncMock(return_value=8))
    monkeypatch.setattr(composer_service, "_result_fields", AsyncMock(return_value=counts))
    monkeypatch.setattr(composer_service.member_mail, "member_mail_available", lambda: True)
    result = await composer_service.to_out(AsyncMock(), ComposedMessage(**values), POLICY_LABELS)
    assert isinstance(result, BaseModel)
    assert result.model_dump() == dict(
        **values,
        **counts,
        estimated_push_audience=7,
        estimated_email_audience=8,
        member_mail_available=True,
        actor_label=ACTOR_LABEL.model_dump(),
    )


def test_waitlist_and_poll_projections_keep_joined_labels_and_empty_answers():
    from app.models import EditionPollOption, EditionPollQuestion, Product, WaitlistEntry
    from app.services import poll_options_service, poll_questions_service, waitlist_service

    entry = WaitlistEntry(
        id="wait_parity",
        product_id="product",
        name="Visitor",
        email="visitor@example.com",
        phone=None,
        guest_count=2,
        notes="",
        created_at=NOW,
        handled_at=None,
        product=Product(name_nl="Product", event_id="event", event=Event(title_nl="Event")),
    )
    assert waitlist_service.to_admin_out(entry).model_dump() == {
        "id": "wait_parity",
        "product_id": "product",
        "name": "Visitor",
        "email": "visitor@example.com",
        "phone": None,
        "guest_count": 2,
        "notes": "",
        "created_at": NOW,
        "handled_at": None,
        "product_name": "Product",
        "event_id": "event",
        "event_title": "Event",
    }
    option = EditionPollOption(
        id="option",
        question_id="question",
        edition_id="edition",
        label_nl="Soep",
        label_fr=None,
        label_en="Soup",
        dietary_tags=["vegan"],
        sort_order=0,
        created_at=NOW,
        updated_at=NOW,
    )
    projected_option = poll_options_service.poll_option_to_out(option, total_quantity=7, volunteer_count=3, locale="en")
    assert projected_option.label == "Soup"
    assert projected_option.total_quantity == 7
    assert projected_option.volunteer_count == 3
    question = EditionPollQuestion(
        id="question",
        edition_id="edition",
        event_id=None,
        kind="meals",
        title_nl="Maaltijd",
        title_fr=None,
        title_en=None,
        description_nl="Kies",
        description_fr=None,
        description_en=None,
        sort_order=1,
        closes_at=None,
        created_at=NOW,
        updated_at=NOW,
    )
    assert poll_questions_service._question_out(question, "fr", [projected_option], None).model_dump() == {
        "id": "question",
        "edition_id": "edition",
        "event_id": None,
        "kind": "meals",
        "title": "Maaltijd",
        "title_nl": "Maaltijd",
        "title_fr": None,
        "title_en": None,
        "description": "Kies",
        "description_nl": "Kies",
        "description_fr": None,
        "description_en": None,
        "sort_order": 1,
        "closes_at": None,
        "closed": False,
        "options": [projected_option.model_dump()],
        "answered_count": 0,
        "yes_count": 0,
        "no_count": 0,
        "people_total": 0,
        "created_at": NOW,
        "updated_at": NOW,
    }


@pytest.mark.anyio
async def test_layout_mcp_keeps_sparse_conflicts(monkeypatch):
    from contextlib import asynccontextmanager

    from app.mcp.admin import layouts
    from app.schemas import LayoutRestorePreview

    legacy = {
        "layout_id": "layout",
        "revision_number": 2,
        "tables_to_add": [],
        "tables_to_update": [],
        "tables_to_remove": [],
        "areas_to_add": [],
        "areas_to_update": [],
        "areas_to_remove": [],
        "allocation_conflicts": [
            {"kind": "area", "id": "area", "name": "Stand", "reason": "deleted", "organization_id": 42}
        ],
        "has_conflicts": True,
    }

    @asynccontextmanager
    async def sessions():
        yield AsyncMock()

    monkeypatch.setattr(
        layouts.layout_revisions_service,
        "preview_layout_restore",
        AsyncMock(return_value=LayoutRestorePreview.model_validate(legacy)),
    )
    assert await layouts.preview_layout_restore(sessions, "layout", 2) == legacy


def test_policy_history_and_consent_payload_parity():
    from app.models import EmailConsent, Policy
    from app.services import email_consent_service

    old = PolicyVersion(**{**VERSION, "id": "old", "version_number": 1})
    current = PolicyVersion(**VERSION)
    policy = policies_service._policy_to_out(
        Policy(key="privacy", title_nl="Privacy", title_fr=None, title_en=None), [old, current], POLICY_LABELS
    )
    assert policy.model_dump() == {
        "key": "privacy",
        "title_nl": "Privacy",
        "title_fr": None,
        "title_en": None,
        "versions": [VERSION_OUT, {**VERSION_OUT, "id": "old", "version_number": 1}],
    }
    consent = EmailConsent(
        id="consent", category_key="parity", source="self_service", granted_at=NOW, revoked_at=None, revoked_source=None
    )
    assert email_consent_service.consent_to_out(consent, EmailCategory(**EMAIL_CATEGORY)).model_dump() == {
        "id": "consent",
        "category_key": "parity",
        "category_name": "Nieuws",
        "source": "self_service",
        "granted_at": NOW,
        "revoked_at": None,
        "revoked_source": None,
    }


def test_revision_projection_keeps_snapshot_geometry():
    from app.models import LayoutRevision
    from app.services import layout_revisions_service

    snapshot = {
        "room": {"width_m": 12.5, "length_m": 8.0},
        "areas": [
            {
                "id": "area",
                "label": "Stand",
                "icon": "tent",
                "x": 1.5,
                "y": 2.5,
                "rotation": 90,
                "width_m": 2.0,
                "length_m": 3.0,
            }
        ],
        "tables": [],
    }
    values = {
        "id": "revision",
        "layout_id": "layout",
        "revision_number": 3,
        "label": "Opening",
        "change_note": None,
        "created_by": "admin",
        "created_at": NOW,
        "snapshot": snapshot,
    }
    assert layout_revisions_service._revision_to_out(LayoutRevision(**values), ACTOR_LABEL).model_dump() == (
        values | {"actor_label": ACTOR_LABEL.model_dump()}
    )


def test_signage_summary_preserves_state_and_native_timestamps():
    from datetime import timedelta

    from app.models import SignageVideoExport
    from app.services import signage_video

    expires = NOW + timedelta(days=36500)
    job = SignageVideoExport(
        id="video",
        channel_id="channel",
        channel_name="Hall",
        locale="fr",
        state="submitted",
        cancel_requested=False,
        error_code="worker_unavailable",
        created_at=NOW,
        expires_at=expires,
        snapshot={"slides": [{"duration": 5}, {"duration": 9}]},
    )
    assert signage_video.summary(job).model_dump() == {
        "id": "video",
        "channel_id": "channel",
        "channel_name": "Hall",
        "locale": "fr",
        "state": "submitted",
        "cancel_requested": False,
        "retrying": True,
        "created_at": NOW,
        "expires_at": expires,
        "slide_count": 2,
        "duration_seconds": 14,
    }


def test_poll_orders_preserve_mcp_event_link_and_rest_projection():
    from pydantic import TypeAdapter

    from app.schemas import PollOrdersOut
    from app.services.poll_questions_service import PollOrderQuestionServiceOut, PollOrdersServiceOut

    question = {
        "id": "question",
        "kind": "yes_no",
        "event_id": "event",
        "title": "Aanwezig?",
        "closed": False,
        "options": [],
        "answered_count": 0,
        "yes_count": 0,
        "no_count": 0,
        "people_total": 0,
    }
    result = PollOrdersServiceOut(
        edition_id="edition",
        questions=[PollOrderQuestionServiceOut(**question)],
        volunteers=[],
        volunteer_count=0,
    )
    assert result.model_dump()["questions"] == [question]
    # FastAPI serializes through the declared response type, keeping its narrower shape.
    rest = TypeAdapter(PollOrdersOut).dump_python(result)
    assert rest["questions"] == [{key: value for key, value in question.items() if key != "event_id"}]
