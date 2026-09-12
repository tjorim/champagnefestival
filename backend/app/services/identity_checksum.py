"""Checksum validation for Belgian identity numbers (#1006/#1037).

Both the National Register Number (NISS/rijksregisternummer) and the eID
card's own document number are self-checking modulo-97 numbers, just with
slightly different formulas. Validating them locally catches a typo at
self-service registration time, without needing to look anything up —
which is what makes it possible to trust a volunteer's own typed-in
identity data instead of matching it against an admin-entered record (see
docs/decisions/1006-volunteer-identity-self-service.md).

Callers must normalise (strip separators) before calling these — see
``app.services.people_service.normalise_optional_identity``.
"""

from __future__ import annotations

_NISS_LENGTH = 11
_EID_LENGTH = 12
_POST_2000_OFFSET = 2_000_000_000


def validate_niss_checksum(digits: str) -> bool:
    """Validate an 11-digit NISS: first 9 digits are YYMMDD + serial, last 2 are the check.

    The check is ``97 - (N mod 97)`` where ``N`` is the first 9 digits. For
    someone born in or after 2000, that check fails against the raw 9-digit
    number — the standard fix is to retry with ``2_000_000_000`` added
    first, rather than trying to infer the birth century from the date
    digits themselves.
    """
    if len(digits) != _NISS_LENGTH or not digits.isdigit():
        return False
    base = int(digits[:9])
    check = digits[9:]
    if f"{97 - (base % 97):02d}" == check:
        return True
    return f"{97 - ((base + _POST_2000_OFFSET) % 97):02d}" == check


def validate_eid_checksum(digits: str) -> bool:
    """Validate a 12-digit eID card number: first 10 digits, last 2 are ``N mod 97``.

    Unlike the NISS, the eID card number's check digit is the remainder
    itself (no ``97 -`` complement) and has no birth-year-dependent variant.
    """
    if len(digits) != _EID_LENGTH or not digits.isdigit():
        return False
    base = int(digits[:10])
    check = digits[10:]
    return f"{base % 97:02d}" == check
