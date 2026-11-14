"""OpenAPI declarations for routes whose body is a file or stream, not JSON.

Every route either declares a ``response_model`` (a JSON body), answers 204, or
names a non-JSON ``response_class``; ``tests/test_openapi_contract.py`` enforces
that. Use ``**binary_response(media_type)`` for the third kind so the generated
document lists the real media type instead of an empty JSON schema.
"""

from typing import Any

from fastapi import Response


def binary_response(media_type: str, description: str = "File download") -> dict[str, Any]:
    return {
        "response_class": Response,
        "responses": {
            200: {
                "description": description,
                "content": {media_type: {"schema": {"type": "string", "format": "binary"}}},
            }
        },
    }
