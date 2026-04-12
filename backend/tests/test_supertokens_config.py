from __future__ import annotations

from app import supertokens_config as st_config


def test_init_supertokens_registers_dashboard_recipe(monkeypatch) -> None:
    recorded: dict[str, object] = {}
    dashboard_recipe = object()
    emailpassword_recipe = object()
    session_recipe = object()
    userroles_recipe = object()

    monkeypatch.setattr(st_config.settings, "supertokens_connection_uri", "http://supertokens-champagnefestival:3567")
    monkeypatch.setattr(st_config.settings, "supertokens_api_key", "champagnefestival-api-key")
    monkeypatch.setattr(st_config.settings, "api_domain", "https://champagnefestival.tjor.im")
    monkeypatch.setattr(st_config.settings, "website_domain", "https://champagnefestival.tjor.im")
    monkeypatch.setattr(st_config.settings, "api_base_path", "/auth")
    monkeypatch.setattr(st_config.settings, "website_base_path", "/admin")

    def fake_init(**kwargs):
        recorded.update(kwargs)

    monkeypatch.setattr(st_config, "init", fake_init)
    monkeypatch.setattr(st_config.emailpassword, "init", lambda: emailpassword_recipe)
    monkeypatch.setattr(st_config.session, "init", lambda: session_recipe)
    monkeypatch.setattr(st_config.userroles, "init", lambda: userroles_recipe)

    def fake_dashboard_init(*, api_key):
        recorded["dashboard_api_key"] = api_key
        return dashboard_recipe

    monkeypatch.setattr(st_config.dashboard, "init", fake_dashboard_init)

    st_config.init_supertokens()

    assert recorded["framework"] == "fastapi"
    assert recorded["dashboard_api_key"] == "champagnefestival-api-key"
    assert recorded["recipe_list"] == [
        emailpassword_recipe,
        session_recipe,
        userroles_recipe,
        dashboard_recipe,
    ]
