"""Portal-user persistence shared by authenticated self-service flows."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils import make_id


async def get_or_create_user(db: AsyncSession, oidc_subject: str, *, commit: bool = True) -> User:
    """Return the portal user for an OIDC subject, creating it if necessary."""
    user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
    if user is None:
        user = User(id=make_id("usr"), oidc_subject=oidc_subject)
        if commit:
            db.add(user)
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
                user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
                if user is None:
                    raise
        else:
            try:
                async with db.begin_nested():
                    db.add(user)
                    await db.flush()
            except IntegrityError:
                user = await db.scalar(select(User).where(User.oidc_subject == oidc_subject))
                if user is None:
                    raise
        await db.refresh(user)
    return user
