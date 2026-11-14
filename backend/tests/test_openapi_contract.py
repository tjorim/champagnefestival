"""Every route declares what it returns, so the OpenAPI document is the API contract.

The frontend generates its types from ``openapi.json`` (see
``test_openapi_export.py``); a route without a response model would appear there
as an untyped JSON body and the generated client could not check it.

A route passes when it declares a ``response_model`` (a JSON body), answers 204,
or names a non-JSON ``response_class`` and lists its media type
(``app.openapi_responses.binary_response``).
"""

from collections.abc import Iterable
from typing import Any, get_args, get_origin

from fastapi.datastructures import DefaultPlaceholder
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.main import app

HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch"}

# Routes allowed an untyped JSON body, as ``METHOD /path``. Keep this empty: give
# the route a model instead.
UNTYPED_JSON_ROUTES: set[str] = set()


def api_routes(routes: Iterable[Any] = app.router.routes) -> Iterable[APIRoute]:
    """Yield every route, descending into included routers."""
    for route in routes:
        included = getattr(route, "original_router", None)
        if included is not None:
            yield from api_routes(included.routes)
        elif isinstance(route, APIRoute):
            yield route


def label(route: APIRoute) -> str:
    return f"{'/'.join(sorted(route.methods or ()))} {route.path} ({route.endpoint.__module__}.{getattr(route.endpoint, '__name__', '?')})"


def returns_json(route: APIRoute) -> bool:
    response_class = route.response_class
    if isinstance(response_class, DefaultPlaceholder):
        response_class = response_class.value
    return issubclass(response_class, JSONResponse)


def is_untyped(annotation: Any) -> bool:
    """A bare ``dict``/``object``/``Any`` (or a container of one) says nothing about the body."""
    if annotation in (dict, object, Any):
        return True
    origin = get_origin(annotation)
    if origin is dict:
        return not get_args(annotation) or any(is_untyped(arg) for arg in get_args(annotation)[1:])
    return origin is not None and any(is_untyped(arg) for arg in get_args(annotation) if arg is not type(None))


def test_route_walk_finds_the_routes():
    # Guards the walker itself: a FastAPI change that hides included routers
    # would otherwise turn the checks below into vacuous passes.
    assert len(list(api_routes())) > 250


def test_every_json_route_declares_a_response_model():
    missing = [
        label(route)
        for route in api_routes()
        if returns_json(route) and route.status_code != 204 and route.response_model is None
    ]
    assert not missing, "Routes without a response_model:\n" + "\n".join(sorted(missing))


def test_no_response_model_is_an_untyped_dict():
    untyped = [
        label(route)
        for route in api_routes()
        if route.response_model is not None
        and is_untyped(route.response_model)
        and f"{'/'.join(sorted(route.methods or ()))} {route.path}" not in UNTYPED_JSON_ROUTES
    ]
    assert not untyped, "Routes whose response_model says nothing about the body:\n" + "\n".join(sorted(untyped))


def test_documented_responses_never_have_an_empty_json_schema():
    # Catches a non-JSON route that forgot to list its media type: FastAPI then
    # documents an ``application/json`` body with an empty schema.
    empty = []
    for path, operations in app.openapi()["paths"].items():
        for method, operation in operations.items():
            if method not in HTTP_METHODS:
                continue
            for status, response in operation["responses"].items():
                body = response.get("content", {}).get("application/json")
                if status.startswith("2") and body is not None and not body.get("schema"):
                    empty.append(f"{method.upper()} {path} -> {status}")
    assert not empty, "2xx responses with an empty JSON schema:\n" + "\n".join(sorted(empty))


# Schemas used both as a request body and inside a response. Their request side keeps optional
# defaults, so the response side cannot mark them required without splitting the type in two.
SHARED_REQUEST_RESPONSE_SCHEMAS = {
    "Background",
    "Layer",
    "PollAttendanceItem",
    "TableAllocation",
}


def _refs(node: object) -> set[str]:
    found: set[str] = set()
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str):
                found.add(value.rsplit("/", 1)[1])
            else:
                found |= _refs(value)
    elif isinstance(node, list):
        for value in node:
            found |= _refs(value)
    return found


def _closure(schemas: dict[str, Any], roots: set[str]) -> set[str]:
    seen: set[str] = set()
    pending = list(roots)
    while pending:
        name = pending.pop()
        if name not in seen:
            seen.add(name)
            pending.extend(_refs(schemas[name]))
    return seen


def test_response_fields_with_defaults_are_required():
    # A field the server always sends must not be generated as `field?:`. Response models inherit
    # `ResponseModel`, which turns on `json_schema_serialization_defaults_required`.
    document = app.openapi()
    schemas = document["components"]["schemas"]
    request_roots: set[str] = set()
    response_roots: set[str] = set()
    for operations in document["paths"].values():
        for method, operation in operations.items():
            if method not in HTTP_METHODS:
                continue
            request_roots |= _refs(operation.get("requestBody", {}))
            response_roots |= _refs(operation.get("responses", {}))
    in_responses = _closure(schemas, response_roots) - _closure(schemas, request_roots)
    optional = [
        f"{name}.{field}"
        for name in sorted(in_responses)
        for field, definition in schemas[name].get("properties", {}).items()
        if field not in schemas[name].get("required", []) and "default" in definition
    ]
    assert not optional, (
        "Response fields with a default that are not required (derive from ResponseModel):\n" + "\n".join(optional)
    )


def test_shared_schemas_list_is_current():
    document = app.openapi()
    schemas = document["components"]["schemas"]
    request_roots: set[str] = set()
    response_roots: set[str] = set()
    for operations in document["paths"].values():
        for method, operation in operations.items():
            if method in HTTP_METHODS:
                request_roots |= _refs(operation.get("requestBody", {}))
                response_roots |= _refs(operation.get("responses", {}))
    shared = _closure(schemas, request_roots) & _closure(schemas, response_roots)
    with_defaults = {
        name
        for name in shared
        if any(
            field not in schemas[name].get("required", []) and "default" in definition
            for field, definition in schemas[name].get("properties", {}).items()
        )
    }
    assert with_defaults == SHARED_REQUEST_RESPONSE_SCHEMAS
