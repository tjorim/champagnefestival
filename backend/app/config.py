"""Application settings loaded from environment variables / .env file."""

import logging
from pathlib import Path
from typing import Any
from urllib.parse import quote

from limits import parse as parse_rate_limit_string
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
    """JWKS endpoint override. Discovered from OIDC metadata when empty."""

    oidc_algorithms: str = "RS256"
    """Comma-separated list of accepted JWT signing algorithms."""

    dev_auth_bypass_token: str = ""
    """Local-dev-only shortcut that skips real OIDC/JWKS verification entirely
    — no Keycloak/IdP container needed. When set, a request bearing this exact
    string as its Bearer token is treated as a fixed dev user (see
    oidc_config._DEV_BYPASS_CLAIMS). Empty by default; validate_production_oidc()
    refuses to start if this is ever set outside environment == "development"."""

    # --- Database ---
    database_url: str = "postgresql+asyncpg://localhost/champagne"
    """SQLAlchemy async database URL.
    Defaults to a local PostgreSQL database named 'champagne'.
    Set via DATABASE_URL environment variable, e.g.:
      postgresql+asyncpg://user:password@host:5432/champagne
    Takes precedence over DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD_FILE below —
    intended as a local-dev override so a plaintext URL never has to be used in production.
    """

    database_pool_size: int = 5
    """Number of persistent connections in the pool."""

    database_pool_max_overflow: int = 10
    """Extra connections allowed beyond pool size."""

    db_host: str = ""
    """Database host. Combined with DB_PORT/DB_NAME/DB_USER/DB_PASSWORD_FILE to build
    DATABASE_URL without ever putting the password in a plaintext .env file. Ignored
    when DATABASE_URL is set directly."""

    db_port: int = 5432
    """Database port, used only when building DATABASE_URL from DB_* parts."""

    db_name: str = ""
    """Database name, used only when building DATABASE_URL from DB_* parts."""

    db_user: str = ""
    """Database user, used only when building DATABASE_URL from DB_* parts."""

    db_password_file: str = ""
    """Path to a file containing the database password (e.g. a Docker secret).
    Combined with DB_HOST/DB_PORT/DB_NAME/DB_USER to build DATABASE_URL. Ignored
    when DATABASE_URL is set directly."""

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
    metrics_hmac_secret: str = ""
    """Shared secret used to compute the HMAC in the ``X-Metrics-Token`` header
    (format ``<unix-timestamp>:<hex-hmac-sha256>``) required to access ``GET
    /api/metrics``. Tokens older than 60 seconds are rejected, limiting the
    value of a leaked token. Leave empty to disable the metrics endpoint entirely."""

    # --- Error tracking ---
    sentry_dsn: str = ""
    """Sentry DSN for backend error tracking. Leave empty to disable Sentry.
    Example: https://<key>@<org>.ingest.sentry.io/<project>
    """

    sentry_traces_sample_rate: float = 0.0
    """Fraction (0.0-1.0) of transactions sampled for Sentry performance monitoring.
    0.0 (default) disables performance tracing entirely; error tracking is unaffected."""

    # --- Rate limiting ---
    rate_limit_enabled: bool = True
    """Whether the general per-IP rate limiter applies to every /api route.
    The stricter check-in/registration limiter (app/ratelimit.py) always applies
    on top of this one, regardless of this setting."""

    rate_limit_default: str = "60/minute"
    """Default rate limit applied per client IP and route, e.g. "60/minute".
    See https://limits.readthedocs.io/en/stable/quickstart.html#rate-limit-string-notation
    for the accepted syntax."""

    # --- Host header validation ---
    trusted_hosts: str = ""
    """Comma-separated list of allowed Host header values (Starlette's
    TrustedHostMiddleware). Supports a leading wildcard for subdomains, e.g.
    "*.champagnefestival.be". Required in production. Leave empty in development
    to disable Host header validation entirely."""

    # --- MCP server ---
    mcp_base_url: str = ""
    """Public base URL of the MCP server (e.g. https://champagnefestival.tjor.im/mcp).
    When set, mounts the FastMCP server at /mcp and enables Keycloak auth enforcement."""

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

    @field_validator("sentry_traces_sample_rate")
    @classmethod
    def validate_sentry_traces_sample_rate(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("SENTRY_TRACES_SAMPLE_RATE must be between 0.0 and 1.0.")
        return v

    @field_validator("rate_limit_default")
    @classmethod
    def validate_rate_limit_default(cls, v: str) -> str:
        try:
            parse_rate_limit_string(v)
        except ValueError as exc:
            raise ValueError(f"RATE_LIMIT_DEFAULT is not a valid rate limit string: {v!r} ({exc})") from exc
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

    @model_validator(mode="before")
    @classmethod
    def build_database_url_from_parts(cls, data: Any) -> Any:
        """Build DATABASE_URL from DB_HOST/DB_PORT/DB_NAME/DB_USER + DB_PASSWORD_FILE.

        Keeps the database password out of a plaintext .env file in production —
        DB_PASSWORD_FILE points at a mounted secret (e.g. a Docker secret) instead.
        Only runs when DATABASE_URL isn't set directly, which always wins as a
        local-dev override.
        """
        if not isinstance(data, dict) or data.get("database_url"):
            return data

        db_host = data.get("db_host")
        db_name = data.get("db_name")
        db_user = data.get("db_user")
        password_file = data.get("db_password_file")
        if not (db_host and db_name and db_user and password_file):
            return data

        try:
            password = Path(password_file).read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise ValueError(f"DB_PASSWORD_FILE could not be read: {password_file!r} ({exc})") from exc

        db_port = data.get("db_port") or 5432
        data["database_url"] = (
            f"postgresql+asyncpg://{quote(str(db_user), safe='')}:{quote(password, safe='')}"
            f"@{db_host}:{db_port}/{db_name}"
        )
        return data

    @model_validator(mode="after")
    def validate_production_oidc(self) -> "Settings":
        """Refuse to start in production without OIDC issuer URL, QR signing secret, and trusted hosts."""
        if self.environment == "production":
            if not self.oidc_issuer_url:
                raise ValueError("OIDC_ISSUER_URL must be set in production.")
            if not self.qr_signing_secret:
                raise ValueError("QR_SIGNING_SECRET must be set in production.")
            if not self.trusted_hosts.strip():
                raise ValueError("TRUSTED_HOSTS must be set in production.")
        return self

    @model_validator(mode="after")
    def validate_production_no_dev_bypass(self) -> "Settings":
        """Refuse to start with DEV_AUTH_BYPASS_TOKEN set outside development.

        Makes it structurally impossible for the auth bypass to be both
        configured and reachable in production at the same time.
        """
        if self.dev_auth_bypass_token and self.environment != "development":
            raise ValueError("DEV_AUTH_BYPASS_TOKEN must not be set outside environment=development.")
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

    def get_trusted_hosts_list(self) -> list[str]:
        """Parse TRUSTED_HOSTS into a list of allowed Host header values.

        Empty string returns an empty list — Host header validation is disabled.
        """
        return [host.strip() for host in self.trusted_hosts.split(",") if host.strip()]

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
        logger.info("Champagnefestival Backend Configuration")
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

        trusted_hosts = self.get_trusted_hosts_list()
        if not trusted_hosts:
            logger.warning("No TRUSTED_HOSTS configured — Host header validation is disabled!")
        else:
            # Logs a count only, not the configured values themselves.
            logger.info(f"Trusted Hosts: {len(trusted_hosts)} allowed host pattern(s) configured")

        logger.info(
            f"Rate limiting: {'enabled' if self.rate_limit_enabled else 'disabled'} ({self.rate_limit_default})"
        )
        logger.info(
            f"Sentry:        {'configured' if self.sentry_dsn else 'not configured'}"
            + (f" (traces_sample_rate={self.sentry_traces_sample_rate})" if self.sentry_dsn else "")
        )
        logger.info("=" * 60)


settings = Settings()
