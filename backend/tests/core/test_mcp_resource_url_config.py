"""``MCP_RESOURCE_URL`` is the MCP mount switch, advertised resource and the only OAuth token audience."""

import pytest

from app.core.config import Settings


def test_mcp_resource_url_defaults_to_disabled():
    assert Settings(_env_file=None).mcp_resource_url == ""


def test_mcp_resource_url_accepts_the_canonical_endpoint():
    settings = Settings(_env_file=None, mcp_resource_url="https://champagnefestival.example/mcp/")

    assert settings.mcp_resource_url == "https://champagnefestival.example/mcp/"


@pytest.mark.parametrize(
    "url",
    [
        "champagnefestival",
        "https://champagnefestival.example/mcp",
        "https://champagnefestival.example/mcp/?unexpected=true",
        "https://champagnefestival.example/mcp/#fragment",
        "https://user@champagnefestival.example/mcp/",
        "ftp://champagnefestival.example/mcp/",
        "https://champagnefestival.example/other/",
    ],
)
def test_mcp_resource_url_requires_canonical_endpoint(url: str):
    with pytest.raises(ValueError, match="MCP_RESOURCE_URL"):
        Settings(_env_file=None, mcp_resource_url=url)


def test_retired_mcp_base_url_fails_loudly_instead_of_unmounting_mcp(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("MCP_BASE_URL", "https://champagnefestival.example/mcp")

    with pytest.raises(ValueError, match="MCP_BASE_URL is no longer read"):
        Settings(_env_file=None)
    assert Settings(_env_file=None, mcp_resource_url="https://champagnefestival.example/mcp/").mcp_resource_url
