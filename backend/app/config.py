"""Application settings loaded from environment variables / .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # --- Required ---
    admin_token: str = ""
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
    cors_origins: list[str] = ["*"]
    """Allowed CORS origins.  In production restrict to your Cloudflare Pages
    domain, e.g. ["https://champagnefestival.be"].
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


settings = Settings()
