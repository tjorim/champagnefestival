"""Generate a VAPID key pair for Web Push (#941).

Usage: uv run python scripts/generate_vapid_keys.py

Prints VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as raw, base64url-encoded
strings — the format ``pywebpush.webpush``'s ``vapid_private_key`` argument
and the browser's ``pushManager.subscribe({applicationServerKey})`` both
expect (py_vapid.Vapid.from_string base64url-decodes and checks for a
32-byte raw key; a PEM string, as opposed to a PEM *file path*, is not
accepted here — verified against pywebpush 2.5.0 / py-vapid 1.9.4).

Run once per deployment and store the output as deployment-managed secrets
(VAPID_PRIVATE_KEY never leaves the server; VAPID_PUBLIC_KEY is served
publicly via GET /api/push/vapid-public-key). Regenerating invalidates every
existing subscription — visitors would need to opt in again — so this is a
one-time setup step, not something to rerun casually.
"""

from __future__ import annotations

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid02, b64urlencode


def main() -> None:
    vapid = Vapid02()
    vapid.generate_keys()

    public_bytes = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    private_bytes = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")

    print(f"VAPID_PUBLIC_KEY={b64urlencode(public_bytes)}")
    print(f"VAPID_PRIVATE_KEY={b64urlencode(private_bytes)}")


if __name__ == "__main__":
    main()
