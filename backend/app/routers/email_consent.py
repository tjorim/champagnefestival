"""Public confirmation of an emailed email-consent request (#1408).

The registration form's updates option only becomes consent once the address is verified. A
registrant who is not signed in with that address receives a link; opening it (a deliberate click on
the confirmation page, not a mail client's prefetch) activates the consent.
"""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.ratelimit import check_rate_limit, get_client_ip
from app.schemas import EmailConsentConfirm, EmailConsentConfirmedOut
from app.services import email_consent_service
from app.services.errors import ApiHTTPException, ServiceError, to_http_exception

router = APIRouter(prefix="/api/email-consents", tags=["email-consents"])


@router.post("/confirm", response_model=EmailConsentConfirmedOut)
async def confirm_email_consent(
    body: EmailConsentConfirm, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    """Activate the consent behind a confirmation link. The link works once; a used, expired or unknown one is a 404."""
    if not check_rate_limit(get_client_ip(request), scope="email-consent-confirm"):
        raise ApiHTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again later."
        )
    try:
        category = await email_consent_service.confirm_consent(
            db, body.token, request_id=getattr(request.state, "request_id", None)
        )
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    return {"category_key": category.key, "category_name": category.localized_name(body.locale)}
