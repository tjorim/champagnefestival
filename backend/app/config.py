"""Application settings loaded from environment variables / .env file."""

import logging

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_TOKEN = ""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # --- Environment ---
    environment: str = "development"
    """Deployment environment. Must be 'development' or 'production'."""

    # --- Required ---
    admin_token: str = DEFAULT_ADMIN_TOKEN
    """Bearer token that gates all admin-only endpoints.
    Set to a long random string in production.
    If empty, all admin endpoints will be inaccessible (returns 401)."""

    # --- Database ---
    database_url: str = "sqlite+aiosqlite:///./champagne.db"
    """SQLAlchemy async database URL.
    Defaults to a local SQLite file.  Change the path to an absolute path
    on the VPS so the data survives deployments, e.g.:
      sqlite+aiosqlite:////var/data/champagne/champagne.db
    """

    # --- CORS ---
    cors_origins: str = ""
    """Allowed CORS origins as a comma-separated string.
    Must be set in production via the CORS_ORIGINS environment variable, e.g.:
      CORS_ORIGINS=https://champagnefestival.be
    An empty string means no browser origins are allowed (safe default).
    For local development add http://localhost:5173 to your .env file.
    Wildcard '*' is only permitted outside production.
    """

    # --- Anti-spam ---
    min_form_seconds: int = 3
    """Minimum seconds between form load and submission (bot protection)."""

    # --- TODO: Email notifications (planned, not yet implemented) ---
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    """SMTP credentials for sending guest confirmation e-mails.
    Leaving these empty disables e-mail sending (currently always disabled).
    """

    # --- TODO: reCAPTCHA (planned, not yet implemented) ---
    recaptcha_secret: str = ""
    """Google reCAPTCHA v2/v3 secret key.
    Leaving this empty skips reCAPTCHA validation (currently always skipped).
    """

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        v = v.lower()
        if v not in ("development", "production"):
            raise ValueError(
                f"ENVIRONMENT must be 'development' or 'production', got: {v}"
            )
        return v

    @model_validator(mode="after")
    def validate_production_admin_token(self) -> "Settings":
        """Refuse to start in production with an empty admin token."""
        if self.environment == "production" and self.admin_token == DEFAULT_ADMIN_TOKEN:
            raise ValueError(
                "ADMIN_TOKEN must be set in production; "
                "refusing to start with an empty token."
            )
        return self

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def get_cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS into a list of allowed origins.

        Wildcard '*' is blocked in production (returns empty list with a warning).
        Empty string returns empty list — no cross-origin access.
        """
        cors_env = self.cors_origins.strip()

        if not cors_env:
            return []

        if cors_env == "*":
            if self.environment == "production":
                logger.warning(
                    "CORS_ORIGINS='*' is not allowed in production. "
                    "No origins will be allowed. Set CORS_ORIGINS to explicit origins."
                )
                return []
            logger.info("CORS: allowing all origins (*) in development mode")
            return ["*"]

        return [origin.strip() for origin in cors_env.split(",") if origin.strip()]

    def log_configuration(self) -> None:
        """Log all configuration at startup, masking sensitive values."""
        logger.info("=" * 60)
        logger.info("Champagne Festival Backend Configuration")
        logger.info("=" * 60)
        logger.info(f"Environment:   {self.environment}")
        logger.info(f"Database URL:  {self.database_url}")

        cors_origins = self.get_cors_origins_list()
        if not cors_origins:
            logger.warning(
                "No CORS origins configured — all cross-origin requests will be blocked!"
            )
        else:
            logger.info(f"CORS Origins:  {', '.join(cors_origins)}")

        logger.info(
            f"Admin Token:   "
            f"{'set' if self.admin_token else 'NOT SET — admin endpoints will return 401'}"
        )
        logger.info("=" * 60)


settings = Settings()
