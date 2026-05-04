"""Application settings loaded from environment variables / .env file."""

import logging

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES = 60


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Environment ---
    environment: str = "development"
    """Deployment environment. Must be 'development' or 'production'."""

    # --- OIDC ---
    oidc_issuer_url: str = ""
    """OIDC provider base URL. Required in production. Example: https://auth.example.com/application/o/champagnefestival"""

    oidc_audience: str = ""
    """Expected audience claim in the JWT. Optional."""

    oidc_jwks_uri: str = ""
    """JWKS endpoint override. Defaults to {oidc_issuer_url}/.well-known/jwks.json when empty."""

    oidc_algorithms: str = "RS256"
    """Comma-separated list of accepted JWT signing algorithms."""

    # --- Database ---
    database_url: str = "postgresql+asyncpg://localhost/champagne"
    """SQLAlchemy async database URL.
    Defaults to a local PostgreSQL database named 'champagne'.
    Set via DATABASE_URL environment variable, e.g.:
      postgresql+asyncpg://user:password@host:5432/champagne
    """

    database_pool_size: int = 5
    """Number of persistent connections in the pool."""

    database_pool_max_overflow: int = 10
    """Extra connections allowed beyond pool size."""

    # --- CORS ---
    cors_origins: str = ""
    """Allowed CORS origins as a comma-separated string.
    Must be set in production via the CORS_ORIGINS environment variable, e.g.:
      CORS_ORIGINS=https://champagnefestival.be
    An empty string means no browser origins are allowed (safe default).
    For local development add http://localhost:5173 to your .env file.
    Wildcard '*' is only permitted outside production.
    """

    # --- Metrics ---
    metrics_secret: str = ""
    """Shared secret required in the ``X-Metrics-Secret`` header to access ``GET /api/metrics``.
    Leave empty to disable the metrics endpoint entirely."""

    # --- Anti-spam ---
    min_form_seconds: int = 3
    """Minimum seconds between form load and submission (bot protection)."""

    guest_access_token_ttl_minutes: int = 30
    """How long a visitor reservation access link remains valid."""

    # --- TODO: Email notifications (planned, not yet implemented) ---
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    """SMTP credentials for sending guest confirmation e-mails.
    Leaving these empty disables e-mail sending (currently always disabled).
    """

    # --- QR token signing ---
    qr_signing_secret: str = ""
    """HMAC secret for signing visitor QR tokens (``GET /api/me/qr``).
    Defaults to an insecure placeholder in development; should be a long random
    string in production (e.g. generated with ``openssl rand -hex 32``).
    """

    # --- TODO: reCAPTCHA (planned, not yet implemented) ---
    recaptcha_secret: str = ""
    """Google reCAPTCHA v2/v3 secret key.
    Leaving this empty skips reCAPTCHA validation (currently always skipped).
    """

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Validate database_url uses the postgresql+asyncpg async driver."""
        if not v or not v.strip():
            raise ValueError("DATABASE_URL cannot be empty")
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use the asyncpg driver: postgresql+asyncpg://...")
        return v

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        v = v.lower()
        if v not in ("development", "production"):
            raise ValueError(f"ENVIRONMENT must be 'development' or 'production', got: {v}")
        return v

    @field_validator("guest_access_token_ttl_minutes")
    @classmethod
    def validate_guest_access_token_ttl_minutes(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("GUEST_ACCESS_TOKEN_TTL_MINUTES must be greater than 0.")
        if v > GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES:
            raise ValueError(
                f"GUEST_ACCESS_TOKEN_TTL_MINUTES must be less than or equal to {GUEST_ACCESS_TOKEN_TTL_MAX_MINUTES}."
            )
        return v

    @model_validator(mode="after")
    def validate_production_oidc(self) -> "Settings":
        """Refuse to start in production without OIDC issuer URL and QR signing secret."""
        if self.environment == "production":
            if not self.oidc_issuer_url:
                raise ValueError("OIDC_ISSUER_URL must be set in production.")
            if not self.qr_signing_secret:
                raise ValueError("QR_SIGNING_SECRET must be set in production.")
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

    @staticmethod
    def _mask_db_credentials(url: str) -> str:
        """Return url with the password hidden."""
        try:
            from sqlalchemy.engine.url import make_url

            return make_url(url).render_as_string(hide_password=True)
        except Exception:
            return "<unparseable>"

    def log_configuration(self) -> None:
        """Log all configuration at startup, masking sensitive values."""
        logger.info("=" * 60)
        logger.info("Champagne Festival Backend Configuration")
        logger.info("=" * 60)
        logger.info(f"Environment:   {self.environment}")
        logger.info(f"Database URL:  {self._mask_db_credentials(self.database_url)}")

        cors_origins = self.get_cors_origins_list()
        if not cors_origins:
            logger.warning("No CORS origins configured — all cross-origin requests will be blocked!")
        else:
            logger.info(f"CORS Origins:  {', '.join(cors_origins)}")

        logger.info(
            f"OIDC:          {'configured' if self.oidc_issuer_url else 'NOT CONFIGURED — admin endpoints will return 401'}"
        )
        logger.info("=" * 60)


settings = Settings()
