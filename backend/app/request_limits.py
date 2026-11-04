"""Request limits shared by policy across the apps (public APIs only).

Counters are process-local fixed windows. Deploy one worker; use a shared
storage backend before scaling workers or replicas.
"""

import math
import time
from collections.abc import Awaitable, Callable, Iterable
from ipaddress import IPv6Address, ip_address, ip_network
from typing import Any

from fastapi.routing import APIRoute
from limits import parse_many
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.routing import compile_path
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def _client_key(value: str) -> str:
    address = ip_address(value)
    if isinstance(address, IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        return str(ip_network(f"{address}/64", strict=False).network_address)
    return str(address)


def get_client_ip(request: Request) -> str:
    """Trust X-Real-IP only from a private immediate proxy; validate its value.

    These APIs are exposed only on the private Docker network behind Caddy.
    A missing/malformed forwarded value falls back to the peer. IPv6 /64s
    share one bucket, and IPv4-mapped addresses share their IPv4 bucket.
    """
    peer = request.client.host if request.client and request.client.host else "unknown"
    try:
        address = ip_address(peer)
    except ValueError:
        return peer
    if isinstance(address, IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    if address.is_private:
        try:
            return _client_key(request.headers.get("x-real-ip", "").strip())
        except ValueError:
            pass
    return _client_key(peer)


def route_template(request: Request) -> str:
    """Recover inclusion prefixes without keying buckets on path parameters.

    FastAPI can expose a router-local route. Match its suffix using public
    Starlette converters and the parameters already selected by routing. The
    parameter check also disambiguates greedy path converters and repeated
    suffixes. Application inclusion prefixes are static in these APIs.
    """
    route = request.scope.get("route")
    local_path = getattr(route, "path", None)
    if local_path is None:
        raise RuntimeError("Rate limiting requires a resolved route")
    regex, template, converters = compile_path(local_path)
    path = request.scope["path"]
    for start in [index for index, character in enumerate(path) if character == "/"] + [len(path)]:
        match = regex.fullmatch(path[start:])
        if match and all(
            converters[name].convert(value) == request.path_params.get(name)
            for name, value in match.groupdict().items()
        ):
            return path[:start] + template
    raise RuntimeError("Selected route does not match the request path")


class RateLimitExceeded(HTTPException):
    def __init__(self, detail: str, headers: dict[str, str]) -> None:
        self.rate_headers = headers
        super().__init__(status_code=429, detail=detail, headers=headers)


class RequestRateLimiter:
    def __init__(self, limit: str, *, enabled: bool = True, exempt_routes: Iterable[Callable[..., Any]] = ()) -> None:
        self.enabled = enabled
        self.limits = parse_many(limit)
        if not self.limits or any(item.amount <= 0 or item.get_expiry() <= 0 for item in self.limits):
            raise ValueError("Rate limits must be positive")
        self.exempt_routes = set(exempt_routes)
        self.storage = MemoryStorage()
        self.strategy = FixedWindowRateLimiter(self.storage)
        # Public aliases retained for the existing coverage tests.
        self.limiter = self.strategy

    @property
    def limit(self):
        return self.limits[0]

    @limit.setter
    def limit(self, value):
        self.limits = [value]

    def reset(self) -> None:
        self.storage.reset()

    def exempt(self, endpoint: Callable[..., Any]) -> Callable[..., Any]:
        self.exempt_routes.add(endpoint)
        return endpoint

    def check(self, request: Request, *, scope: str | None = None) -> None:
        # Body admission and the dependency must charge a request only once.
        checked = request.scope.setdefault("state", {}).setdefault("rate_limit_checked", set())
        identity = (id(self), scope)
        if identity in checked:
            return
        checked.add(identity)
        if not self.enabled or request.scope.get("endpoint") in self.exempt_routes:
            return
        identifiers = (get_client_ip(request), scope or route_template(request))
        windows = []
        for item in self.limits:
            allowed = self.strategy.hit(item, *identifiers)
            reset, remaining = self.strategy.get_window_stats(item, *identifiers)
            windows.append((allowed, item, reset, remaining))
        blocked = [window for window in windows if not window[0]]
        # A retry must wait for every exhausted window, not just the first.
        selected = max(blocked, key=lambda w: w[2]) if blocked else min(windows, key=lambda w: w[3] / w[1].amount)
        _, item, reset, remaining = selected
        headers = {
            "X-RateLimit-Limit": str(item.amount),
            "X-RateLimit-Remaining": str(max(0, remaining)),
            "X-RateLimit-Reset": str(math.ceil(reset)),
            "Retry-After": str(max(1, math.ceil(reset - time.time()))),
        }
        request.state.rate_limit_headers = headers
        request.state.rate_limit_rejected = bool(blocked)
        if blocked:
            raise RateLimitExceeded(str(item), headers)


class RateLimitHeadersMiddleware:
    """Admit bodies and retain rate headers; register before HTTP middleware.

    Keeping this inside BaseHTTPMiddleware lets body-admission HTTP exceptions
    reach FastAPI directly instead of being wrapped in an ExceptionGroup.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        owner: ASGIApp | None = None,
        check_before_body: Callable[[Request], Awaitable[None]] | None = None,
    ) -> None:
        self.app = app
        self.owner = owner
        self.check_before_body = check_before_body

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        response_started = False
        body_checked = False

        async def guarded_receive() -> Message:
            nonlocal body_checked
            # Routing has selected the APIRoute before FastAPI first reads its
            # body. Admit here, before JSON decoding (including malformed JSON).
            # Only this FastAPI app owns the policy; mounted apps stay separate.
            if (
                not response_started
                and not body_checked
                and scope.get("app") is self.owner
                and isinstance(scope.get("route"), APIRoute)
                and self.check_before_body is not None
            ):
                body_checked = True
                await self.check_before_body(Request(scope))
            return await receive()

        async def send_with_headers(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                headers = MutableHeaders(scope=message)
                state = scope.get("state", {})
                # A purpose-specific quota can reject an otherwise allowed
                # general request. Its backoff/headers must take precedence.
                if message["status"] != 429 or state.get("rate_limit_rejected"):
                    for name, value in state.get("rate_limit_headers", {}).items():
                        if name not in headers:
                            headers[name] = value
                if message["status"] == 429 and "Cache-Control" not in headers:
                    headers["Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, guarded_receive, send_with_headers)
