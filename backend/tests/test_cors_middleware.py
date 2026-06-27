from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.middleware import add_cors_middleware


@pytest.mark.anyio
async def test_mcp_paths_bypass_cors_while_other_paths_use_cors() -> None:
    app = FastAPI()

    @app.get("/api/ping")
    async def api_ping() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/mcp/ping")
    async def mcp_ping() -> dict[str, str]:
        return {"status": "ok"}

    add_cors_middleware(
        app,
        Settings(cors_origins="https://admin.example.test"),
        mcp_enabled=True,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        api_response = await client.get(
            "/api/ping",
            headers={"Origin": "https://admin.example.test"},
        )
        mcp_response = await client.get(
            "/mcp/ping",
            headers={"Origin": "https://admin.example.test"},
        )

    assert api_response.status_code == 200
    assert api_response.headers["access-control-allow-origin"] == "https://admin.example.test"
    assert mcp_response.status_code == 200
    assert "access-control-allow-origin" not in mcp_response.headers
