"""Anti-spam helpers for the public reservation endpoint."""

from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.config import settings


def check_honeypot(honeypot: str) -> None:
    """Reject the submission if the hidden honeypot field is populated."""
    if honeypot:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission rejected.",
        )


def check_form_timing(form_start_time: str) -> None:
    """Reject submissions that were filled in too quickly (bot protection).

    form_start_time should be an ISO-8601 UTC timestamp string set by the
    frontend when the form is first rendered.
    """
    if not form_start_time:
        return  # field is optional — skip the check if absent

    try:
        start = datetime.fromisoformat(form_start_time)
    except ValueError:
        return  # invalid timestamp — skip the check

    # Make timezone-aware if naïve
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    elapsed = (datetime.now(timezone.utc) - start).total_seconds()
    if elapsed < settings.min_form_seconds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission rejected.",
        )
