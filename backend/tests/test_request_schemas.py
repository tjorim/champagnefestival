"""Contract tests for strict external request validation."""

import pytest
from pydantic import ValidationError

from app import schemas
from app.schemas import EditionUpdate, RequestModel


def test_request_models_reject_unknown_fields() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        RequestModel.model_validate({"unexpected": True})


def test_all_request_model_subclasses_inherit_strict_validation() -> None:
    pending = list(RequestModel.__subclasses__())
    request_models: set[type[RequestModel]] = set()

    while pending:
        model = pending.pop()
        request_models.add(model)
        pending.extend(model.__subclasses__())

    assert request_models
    assert all(model.model_config.get("extra") == "forbid" for model in request_models)


@pytest.mark.parametrize("field", ["edition_type", "active"])
def test_edition_update_rejects_null_non_nullable_fields(field: str) -> None:
    with pytest.raises(ValidationError, match=f"{field} may be omitted but cannot be null"):
        EditionUpdate.model_validate({field: None})


@pytest.mark.parametrize(
    ("complete_name", "partial_name", "field"),
    [
        ("CategoryCreate", "CategoryUpdate", "label_language"),
        ("CategoryCreate", "CategoryUpdate", "sort_order"),
        ("EventCreate", "EventUpdate", "title_language"),
        ("ProductCreate", "ProductUpdate", "name_language"),
        ("FaqItemCreate", "FaqItemUpdate", "text_language"),
        ("AnnouncementWrite", "AnnouncementUpdate", "text_language"),
        ("AnnouncementWrite", "AnnouncementUpdate", "level"),
        ("AnnouncementWrite", "AnnouncementUpdate", "active"),
        ("ComposedMessageWrite", "ComposedMessageUpdate", "text_language"),
        ("ComposedMessageWrite", "ComposedMessageUpdate", "level"),
        ("ComposedMessageWrite", "ComposedMessageUpdate", "channels"),
    ],
)
def test_complete_and_partial_request_field_nullability(complete_name: str, partial_name: str, field: str) -> None:
    complete = getattr(schemas, complete_name)
    partial = getattr(schemas, partial_name)

    assert getattr(partial.model_validate({}), field) is None
    assert getattr(partial.model_validate({field: None}), field) is None
    with pytest.raises(ValidationError) as exc_info:
        complete.model_validate({field: None})
    assert any(error["loc"] == (field,) and error["type"] != "missing" for error in exc_info.value.errors())
