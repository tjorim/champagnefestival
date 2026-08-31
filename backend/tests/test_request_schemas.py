"""Contract tests for strict external request validation."""

import pytest
from pydantic import ValidationError

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
