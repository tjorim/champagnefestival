"""Specialized response construction preserves the REST/MCP boundary values."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Edition,
    EventOrderOption,
    EventOrderQuestion,
    Organization,
    OrganizationChange,
    RegistrationOrderAnswer,
    SignageVideoExport,
)
from app.schemas import EditionPlanOut, EditionStandsOut, OrderAnswerOut, OrderQuestionOut, OrganizationChangeOut
from app.schemas.signage import VideoExportOut
from app.services import organization_changes, signage_video, stands_service


def test_nested_order_responses_keep_nulls_and_option_order():
    question = EventOrderQuestion(
        id="question",
        kind="single_choice",
        active=False,
        title_nl="Keuze",
        title_fr=None,
        title_en=None,
        description_nl=None,
        description_fr=None,
        description_en=None,
        options=[EventOrderOption(id="second", label_nl="Twee"), EventOrderOption(id="first", label_nl="Een")],
    )
    answer = RegistrationOrderAnswer(
        question_id="question", option_id="second", text=None, rating=None, question=question
    )
    assert isinstance(question.to_out(), OrderQuestionOut)
    assert isinstance(answer.to_out(), OrderAnswerOut)
    assert question.as_dict() == {
        "id": "question",
        "kind": "single_choice",
        "active": False,
        "title_nl": "Keuze",
        "title_fr": None,
        "title_en": None,
        "description_nl": None,
        "description_fr": None,
        "description_en": None,
        "options": [
            {"id": "second", "label_nl": "Twee", "label_fr": None, "label_en": None},
            {"id": "first", "label_nl": "Een", "label_fr": None, "label_en": None},
        ],
    }
    assert answer.as_dict() == {
        "question_id": "question",
        "option_id": "second",
        "text": None,
        "rating": None,
        "question": question.as_dict(),
    }


def test_proposal_response_preserves_sparse_fields_and_timestamp():
    now = datetime.now(UTC)
    organization = Organization(id=7, name="Maison", **dict.fromkeys(organization_changes.FIELDS))
    change = OrganizationChange(
        id="proposal",
        status="superseded",
        proposed={"website": None},
        superseded_fields=["image"],
        reason=None,
        created_at=now,
    )
    result = organization_changes.payload(change, organization)
    assert isinstance(result, OrganizationChangeOut)
    assert result.model_dump() == {
        "id": "proposal",
        "organization_id": 7,
        "organization_name": "Maison",
        "status": "superseded",
        "proposed": {"website": None},
        "current": dict.fromkeys(organization_changes.FIELDS),
        "superseded_fields": ["image"],
        "reason": None,
        "created_at": now,
    }


def test_export_summary_keeps_effective_state_and_python_datetime():
    now = datetime.now(UTC)
    job = SignageVideoExport(
        id="export",
        state="running",
        expires_at=now + timedelta(days=1),
        created_at=now,
        cancel_requested=True,
        channel_id="channel",
        channel_name="Hall",
        locale="nl",
        error_code="worker_unavailable",
        snapshot={"slides": [{"duration": 7}]},
    )
    result = signage_video.summary(job)
    assert isinstance(result, VideoExportOut)
    assert result.model_dump() == {
        "id": "export",
        "channel_id": "channel",
        "channel_name": "Hall",
        "locale": "nl",
        "state": "cancelled",
        "cancel_requested": True,
        "retrying": True,
        "created_at": now,
        "expires_at": job.expires_at,
        "slide_count": 1,
        "duration_seconds": 7,
    }


@pytest.mark.asyncio
async def test_empty_publication_returns_typed_envelopes(monkeypatch):
    async def empty(*args):
        return []

    monkeypatch.setattr(stands_service, "_load_published_layouts", empty)
    edition = Edition(id="edition")
    stands = await stands_service.load_edition_stands(MagicMock(spec=AsyncSession), edition)
    plan = await stands_service.load_edition_plan(MagicMock(spec=AsyncSession), edition)
    assert isinstance(stands, EditionStandsOut)
    assert isinstance(plan, EditionPlanOut)
    assert stands.model_dump() == {"edition_id": "edition", "organizations": []}
    assert plan.model_dump() == {"edition_id": "edition", "days": []}
