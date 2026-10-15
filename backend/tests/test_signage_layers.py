"""Canvas validation independent of application writes."""

import pytest
from pydantic import ValidationError

from app.signage_schemas import Layer, TemplateWrite, missing_bindings


def test_legacy_layer_defaults():
    layer = Layer(id="name", kind="binding", binding="name")
    assert layer.visible and not layer.locked
    assert (layer.font, layer.align, layer.fit) == ("sans", "center", "contain")


@pytest.mark.parametrize(
    "patch",
    [
        {"font": "unknown"},
        {"align": "justify"},
        {"fit": "stretch"},
        {"color": "red"},
        {"x": float("nan")},
        {"width": 0},
    ],
)
def test_invalid_layer_properties(patch):
    with pytest.raises(ValidationError):
        Layer.model_validate({"id": "test", "kind": "text", **patch})


def test_unique_layer_ids():
    with pytest.raises(ValidationError):
        TemplateWrite(name="Duplicate", layers=[Layer(id="x", kind="text"), Layer(id="x", kind="shape")])


def test_hidden_and_static_layers_do_not_satisfy_requirements():
    layers = [
        {"id": "logo", "kind": "binding", "binding": "logo", "visible": False},
        {"id": "name", "kind": "text", "binding": "name"},
        {"id": "sponsor", "kind": "binding", "binding": "sponsor"},
    ]
    assert missing_bindings(layers, "organizations") == {"logo", "name"}
    assert missing_bindings(layers, "image") == set()
