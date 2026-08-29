"""Tests for the client-IP resolution helper used by rate limiting and audit logging."""

from __future__ import annotations

from starlette.requests import Request

from app.ratelimit import check_check_in_rate_limit, check_rate_limit, get_client_ip, get_general_rate_limit_key


def _make_request(headers: dict[str, str], client_host: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345) if client_host else None,
    }
    return Request(scope)


def test_get_client_ip_prefers_x_real_ip_from_trusted_proxy_peer() -> None:
    request = _make_request({"X-Real-IP": "203.0.113.5"}, client_host="10.0.0.1")
    assert get_client_ip(request) == "203.0.113.5"


def test_get_client_ip_ignores_x_real_ip_from_untrusted_peer() -> None:
    request = _make_request({"X-Real-IP": "203.0.113.5"}, client_host="8.8.8.8")
    assert get_client_ip(request) == "8.8.8.8"


def test_get_client_ip_ignores_x_forwarded_for() -> None:
    request = _make_request({"X-Forwarded-For": "203.0.113.5, 198.51.100.9"}, client_host="10.0.0.1")
    assert get_client_ip(request) == "10.0.0.1"


def test_get_client_ip_falls_back_to_direct_connection() -> None:
    request = _make_request({}, client_host="192.0.2.1")
    assert get_client_ip(request) == "192.0.2.1"


def test_get_client_ip_returns_unknown_with_no_signal() -> None:
    request = _make_request({}, client_host=None)
    assert get_client_ip(request) == "unknown"


def test_get_client_ip_treats_invalid_peer_host_as_untrusted() -> None:
    request = _make_request({"X-Real-IP": "203.0.113.5"}, client_host="not-an-ip")
    assert get_client_ip(request) == "not-an-ip"


def test_public_rate_limit_buckets_are_split_by_scope() -> None:
    for _ in range(5):
        assert check_rate_limit("203.0.113.5", scope="registration-create")

    assert not check_rate_limit("203.0.113.5", scope="registration-create")
    assert check_rate_limit("203.0.113.5", scope="registration-access-request")


def test_check_in_rate_limit_is_independent_per_registration() -> None:
    for index in range(40):
        assert check_check_in_rate_limit(f"reg-{index}", "203.0.113.5")


def test_check_in_rate_limit_rejects_repeated_attempts_for_one_registration() -> None:
    for _ in range(10):
        assert check_check_in_rate_limit("reg-target", "203.0.113.5")

    assert not check_check_in_rate_limit("reg-target", "203.0.113.5")


def test_general_rate_limit_uses_registration_id_for_check_in() -> None:
    request = _make_request({})
    request.scope["path"] = "/api/check-in/reg-123/lookup"

    assert get_general_rate_limit_key(request) == "check-in-registration:reg-123"
