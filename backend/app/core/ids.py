"""Identifier generation."""

import secrets
import time


def make_id(prefix: str) -> str:
    """Generate a time-ordered, collision-resistant ID with the given prefix."""
    ts = int(time.time() * 1000)
    rand = secrets.token_hex(4)
    return f"{prefix}_{ts}_{rand}"
