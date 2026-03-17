"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings
from app.database import create_tables
from app.routers import (
    members,
    check_in,
    contact,
    content,
    editions,
    layouts,
    people,
    reservations,
    rooms,
    table_types,
    tables,
    venues,
    volunteers,
)

# Configure logging before any other module uses a logger.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    logger.info("=" * 60)
    logger.info("Champagne Festival API — starting up")
    logger.info("=" * 60)

    settings.log_configuration()

    try:
        await create_tables()
        logger.info("✓ Database tables verified / created")
    except Exception as exc:
        logger.error(f"❌ Database initialisation failed: {exc}")
        raise

    logger.info("=" * 60)
    logger.info("Startup complete — server ready to accept connections")
    logger.info("=" * 60)

    yield

    # Shutdown
    logger.info("Champagne Festival API shutting down...")


app = FastAPI(
    title="Champagne Festival API",
    version="0.1.0",
    description=(
        "Backend for the VIP reservation and check-in system. "
        "See the /docs endpoint for the interactive OpenAPI explorer."
    ),
    lifespan=lifespan,
)

_cors_origins = settings.get_cors_origins_list()

if not _cors_origins:
    logger.warning(
        "No CORS origins configured — all cross-origin requests will be blocked!"
    )
else:
    logger.info(f"CORS middleware configured with origins: {_cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False if "*" in _cors_origins else True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(reservations.router)
app.include_router(members.router)
app.include_router(check_in.router)
app.include_router(contact.router)
app.include_router(tables.router)
app.include_router(table_types.router)
app.include_router(venues.router)
app.include_router(rooms.router)
app.include_router(layouts.router)
app.include_router(content.router)
app.include_router(editions.router)
app.include_router(people.router)
app.include_router(volunteers.router)


class HealthResponse(BaseModel):
    status: str


@app.get("/health", tags=["meta"], response_model=HealthResponse)
async def health() -> HealthResponse:
    """Simple health-check endpoint used by the reverse proxy / systemd watchdog."""
    return HealthResponse(status="ok")
