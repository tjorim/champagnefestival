"""Contact form endpoint.

Accepts contact form submissions from the frontend and logs them.
Email delivery to the organiser is a planned feature (see backend/README.md).
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field

from app.spam import check_form_timing, check_honeypot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
    honeypot: str | None = None
    form_start_time: str | None = None


@router.post("")
async def submit_contact(body: ContactRequest) -> dict:
    """Accept a contact-form submission.

    Currently logs the message server-side. Email delivery to the organiser
    is a planned feature — see the "Planned features" section in README.md.
    """
    check_honeypot(body.honeypot or "")
    check_form_timing(body.form_start_time or "")

    logger.info(
        "Contact form submission received",
        extra={
            "contact_name": body.name,
            "contact_email_domain": body.email.split("@")[-1],
            "contact_message_length": len(body.message),
        },
    )
    return {"ok": True}
