"""Public one-click unsubscribe for member mail (#1407).

The URL in a mail's ``List-Unsubscribe`` header and footer: a mail client POSTs
``List-Unsubscribe=One-Click`` to it (RFC 8058) without a login, a person who opens it in a browser
(GET) is sent on to the frontend confirmation page, and the signed token in the query string says
whose consent for which category ends.
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.ratelimit import check_rate_limit, get_client_ip
from app.schemas import MemberMailUnsubscribeCategoryOut
from app.services import member_mail_unsubscribe
from app.services.errors import ApiHTTPException, ServiceError, to_http_exception

router = APIRouter(prefix="/api/mail", tags=["member-mail"])


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    request: Request, token: str = Query(min_length=1, max_length=500), db: AsyncSession = Depends(get_db)
) -> Response:
    """End the consent the signed token names. Repeating it, or the person being gone, still succeeds;
    an invalid token is a 404."""
    if not check_rate_limit(get_client_ip(request), scope="member-mail-unsubscribe", max_requests=30):
        raise ApiHTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again later."
        )
    try:
        await member_mail_unsubscribe.unsubscribe(db, token, request_id=getattr(request.state, "request_id", None))
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/unsubscribe", include_in_schema=False)
async def open_unsubscribe_link(token: str = Query(default="", max_length=500)) -> RedirectResponse:
    """A person opening the link: show the frontend page, which asks before unsubscribing, so a mail
    scanner following the link cannot unsubscribe anyone."""
    page = f"{settings.frontend_url.rstrip('/')}/email-unsubscribe?token={quote(token, safe='')}"
    return RedirectResponse(page, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/unsubscribe/category", response_model=MemberMailUnsubscribeCategoryOut)
async def unsubscribe_category(
    request: Request,
    token: str = Query(min_length=1, max_length=500),
    locale: str | None = Query(default=None, max_length=5),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Which category the token unsubscribes from, for the confirmation page. Changes nothing."""
    if not check_rate_limit(get_client_ip(request), scope="member-mail-unsubscribe", max_requests=30):
        raise ApiHTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again later."
        )
    try:
        category = await member_mail_unsubscribe.token_category(db, token)
    except ServiceError as exc:
        raise to_http_exception(exc) from exc
    return {"category_key": category.key, "category_name": category.localized_name(locale)}
