"""Admin session authentication dependency (SuperTokens)."""

from fastapi import Depends
from supertokens_python.recipe.session import SessionContainer
from supertokens_python.recipe.session.framework.fastapi import verify_session


async def require_admin(
    session: SessionContainer = Depends(verify_session()),
) -> None:
    """FastAPI dependency — raises 401 if the request has no valid SuperTokens session.

    All admin routers use this dependency to gate access.  A valid session is
    created when the user signs in via the ``/auth/signin`` endpoint provided
    by the SuperTokens middleware.

    The ``verify_session()`` sub-dependency handles all validation and raises
    an appropriate error for missing or invalid sessions automatically.

    Future enhancement: add a role check for ``admin`` using the UserRoles
    recipe (``UserRoleClaim``) once role provisioning is in place.
    """
