"""Admin session authentication dependency (SuperTokens)."""

from fastapi import Depends
from supertokens_python.recipe.session import SessionContainer
from supertokens_python.recipe.session.framework.fastapi import verify_session
from supertokens_python.recipe.userroles import UserRoleClaim


async def require_admin(
    session: SessionContainer = Depends(
        verify_session(
            override_global_claim_validators=lambda global_validators, session, user_context: (
                global_validators + [UserRoleClaim.validators.includes("admin")]
            )
        )
    ),
) -> None:
    """FastAPI dependency — rejects requests without a valid admin session.

    Raises 401 if the request has no valid SuperTokens session, or 403 if
    the session does not contain the ``admin`` role (checked via
    ``UserRoleClaim``).

    All admin routers use this dependency to gate access.  A valid session is
    created when the user signs in via the ``/auth/signin`` endpoint provided
    by the SuperTokens middleware.  The ``admin`` role must be assigned to the
    user via the SuperTokens UserRoles recipe.
    """
