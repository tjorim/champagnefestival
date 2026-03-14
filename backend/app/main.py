"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_tables
from app.routers import check_in, content, reservations, tables


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create tables on startup if they don't already exist.
    # In production you should run Alembic migrations instead.
    await create_tables()
    yield


app = FastAPI(
    title="Champagne Festival API",
    version="0.1.0",
    description=(
        "Backend for the VIP reservation and check-in system. "
        "See the /docs endpoint for the interactive OpenAPI explorer."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reservations.router)
app.include_router(check_in.router)
app.include_router(tables.router)
app.include_router(content.router)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    """Simple health-check endpoint used by the reverse proxy / systemd watchdog."""
    return {"status": "ok"}
