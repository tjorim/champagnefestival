"""Mock of Champagnefestival's Pebble registrations endpoint, for testing the watchapp.

Mirrors the pebble_router route in backend/app/routers/me.py:

    GET /api/pebble/registrations   (Authorization: Bearer cfpat_..., see
                                      backend/app/services/pebble_access.py)

Every request is appended to a log file, which is the point: this stands in
for a real backend so the watch's rendering and error-state handling in
src/embeddedjs/main.js (refreshGlance) can be exercised without a live server
or a real Keycloak login on hand.

    python3 pebble/scripts/mock-server.py [port] [--host H] [--token T] [--status N]

Point the watch at it through `pebble send-app-message` (see ../EMULATOR.md)
or through the real pairing flow with API_BASE_URL overridden to this host.
"""

import argparse
import json
from datetime import UTC, date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REGISTRATIONS_PATH = "/api/pebble/registrations"

_ERROR_DETAIL = {
    401: "Invalid or revoked Pebble token",
    403: "Invalid or revoked Pebble token",
    429: "Too many requests",
    500: "Internal server error",
}

STATE = [
    {
        "id": "reg_today",
        "event_id": "evt_today",
        "event_title": "Champagne Tasting Evening",
        "event_date": date.today().isoformat(),
        "edition_id": "edn_2026",
        "guest_count": 2,
        "status": "confirmed",
        "payment_status": "paid",
        "checked_in": False,
        "checked_in_at": None,
        "person_name": "Jane Visitor",
        "created_at": datetime.now(UTC).isoformat(),
    },
    {
        "id": "reg_upcoming",
        "event_id": "evt_upcoming",
        "event_title": "Grand Cru Masterclass",
        "event_date": (date.today() + timedelta(days=7)).isoformat(),
        "edition_id": "edn_2026",
        "guest_count": 1,
        "status": "confirmed",
        "payment_status": "paid",
        "checked_in": False,
        "checked_in_at": None,
        "person_name": "Jane Visitor",
        "created_at": datetime.now(UTC).isoformat(),
    },
]


class Handler(BaseHTTPRequestHandler):
    expected_token = "cfpat_test000000000000000000000000"
    forced_status = None
    log_path = Path("requests.log")

    def log_message(self, *args):
        """Silence the default stderr access log; we keep our own."""

    def record(self, line):
        with self.log_path.open("a") as fh:
            fh.write(line + "\n")
        print(line, flush=True)

    def bearer_token(self):
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        return auth.removeprefix("Bearer ")

    def respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond_error(self, code):
        self.respond(code, {"detail": _ERROR_DETAIL.get(code, "error")})

    def do_GET(self):
        if self.path != REGISTRATIONS_PATH:
            self.record(f"GET {self.path} -> 404")
            return self.respond(404, {"detail": "not found"})

        if self.forced_status is not None:
            self.record(f"GET {self.path} -> {self.forced_status} (forced)")
            return self.respond_error(self.forced_status)

        token = self.bearer_token()
        if token != self.expected_token:
            self.record(f"GET {self.path} -> 401 (bad or missing token)")
            return self.respond_error(401)

        self.record(f"GET {self.path} -> 200 ({len(STATE)} registrations)")
        self.respond(200, STATE)


def main():
    parser = argparse.ArgumentParser(description="Mock Champagnefestival Pebble registrations API.")
    parser.add_argument("port", nargs="?", type=int, default=8899)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="bind address; use 0.0.0.0 to reach it from a watch on the network",
    )
    parser.add_argument("--token", default=Handler.expected_token, help="expected bearer token (cfpat_...)")
    parser.add_argument(
        "--status",
        type=int,
        choices=sorted(_ERROR_DETAIL),
        default=None,
        help="always return this status instead of checking auth, e.g. to test 429/500 handling",
    )
    parser.add_argument("--log", default="requests.log", help="request log file")
    args = parser.parse_args()

    Handler.expected_token = args.token
    Handler.forced_status = args.status
    Handler.log_path = Path(args.log)
    Handler.log_path.write_text("")

    print(f"mock Champagnefestival Pebble API on http://{args.host}:{args.port} (log: {args.log})")
    HTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
