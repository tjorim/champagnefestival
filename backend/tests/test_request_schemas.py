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
        ("CategoryCreate", "CategoryUpdate", "sort_order"),
        ("AnnouncementWrite", "AnnouncementUpdate", "level"),
        ("AnnouncementWrite", "AnnouncementUpdate", "active"),
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


def _without_presence_metadata(schema: dict) -> dict:
    """Compare value validation independently of defaults and nullability."""
    result = {key: value for key, value in schema.items() if key not in {"title", "description", "default"}}
    if "anyOf" in result:
        alternatives = [_without_presence_metadata(item) for item in result["anyOf"] if item != {"type": "null"}]
        if len(alternatives) == 1:
            return alternatives[0]
        result["anyOf"] = alternatives
    return result


@pytest.mark.parametrize(
    ("create", "update"),
    [
        (model, getattr(schemas, name.removesuffix("Create") + "Update"))
        for name, model in vars(schemas).items()
        if name.endswith("Create")
        and isinstance(model, type)
        and hasattr(schemas, name.removesuffix("Create") + "Update")
    ],
    ids=lambda model: model.__name__,
)
def test_create_update_value_constraints_match(create: type[RequestModel], update: type[RequestModel]) -> None:
    create_fields = create.model_json_schema()["properties"]
    update_fields = update.model_json_schema()["properties"]
    for field in create_fields.keys() & update_fields.keys():
        assert _without_presence_metadata(create_fields[field]) == _without_presence_metadata(update_fields[field]), (
            field
        )


@pytest.mark.parametrize("model", [schemas.TableUpdate, schemas.RoomUpdate])
@pytest.mark.parametrize("name", ["", "x" * 201])
def test_layout_name_updates_reject_names_that_creation_rejects(model: type[RequestModel], name: str) -> None:
    with pytest.raises(ValidationError):
        model.model_validate({"name": name})


@pytest.mark.parametrize("model", [schemas.PollOptionCreate, schemas.PollOptionUpdate])
def test_poll_label_validation_is_shared(
    model: type[schemas.PollOptionCreate] | type[schemas.PollOptionUpdate],
) -> None:
    payload = {"edition_id": "edition"} if model is schemas.PollOptionCreate else {}
    assert model.model_validate({**payload, "label": "  Dinner  "}).label == "Dinner"
    with pytest.raises(ValidationError, match="Label must not be blank"):
        model.model_validate({**payload, "label": "   "})
