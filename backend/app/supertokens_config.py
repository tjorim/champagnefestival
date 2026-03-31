"""SuperTokens initialization for session-based admin authentication."""

import logging

from supertokens_python import InputAppInfo, SupertokensConfig, init
from supertokens_python.recipe import emailpassword, session, userroles

from app.config import settings

logger = logging.getLogger(__name__)


def init_supertokens() -> None:
    """Configure SuperTokens with emailpassword + session + userroles recipes.

    Call once at application startup (before requests are served).
    Only initializes when ``SUPERTOKENS_CONNECTION_URI`` is set; otherwise
    logs a warning and returns — admin endpoints will reject all requests.
    """
    if not settings.supertokens_connection_uri:
        logger.warning(
            "SUPERTOKENS_CONNECTION_URI is not set — "
            "SuperTokens will not be initialized and admin endpoints will return 401."
        )
        return

    init(
        app_info=InputAppInfo(
            app_name="Champagne Festival",
            api_domain=settings.api_domain,
            website_domain=settings.website_domain,
            api_base_path="/auth",
            website_base_path="/auth",
        ),
        supertokens_config=SupertokensConfig(
            connection_uri=settings.supertokens_connection_uri,
            api_key=settings.supertokens_api_key or None,
        ),
        framework="fastapi",
        recipe_list=[
            emailpassword.init(),
            session.init(),
            userroles.init(),
        ],
    )
    logger.info("✓ SuperTokens initialized (emailpassword + session + userroles)")
