"""Spreadsheet-safe CSV cell values."""

_CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")


def csv_safe(value: object) -> str:
    """Return a spreadsheet-safe CSV cell value.

    Keep this rule aligned with ``frontend/src/features/admin/shared/csvExport.ts``.
    """
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(_CSV_INJECTION_PREFIXES) else text
