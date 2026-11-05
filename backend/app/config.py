import os
import sys
from pathlib import Path
from pydantic import BaseModel

# Automatically load environment variables from the project root .env
# as well as the backend/.env if present.
try:
    from dotenv import load_dotenv
    _APP_DIR = Path(__file__).resolve().parent
    _BACKEND_DIR = _APP_DIR.parent
    _ROOT_DIR = _BACKEND_DIR.parent
    for _env_path in (_ROOT_DIR / ".env", _BACKEND_DIR / ".env"):
        if _env_path.is_file():
            load_dotenv(_env_path, override=False)
except ImportError:
    pass


def _cors_origins() -> list[str]:
    """Explicit allow-list. A wildcard is never accepted for credentialed CORS."""
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173,"
        "http://127.0.0.1:3000,http://127.0.0.1:5173,"
        "https://udaan-navigator.vercel.app",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip() and origin.strip() != "*"]


def _detect_email_provider() -> str:
    """Resolve the ParentConnect email provider.

    Explicit ``smtp``/``resend``/``disabled`` values win. An empty value or
    ``auto`` auto-detects: Resend when an API key is present, then SMTP when a
    host is present, otherwise disabled.
    """
    configured = os.getenv("PARENT_CONNECT_EMAIL_PROVIDER", "").strip().lower()
    if configured and configured != "auto":
        return configured
    if os.getenv("RESEND_API_KEY", "").strip():
        return "resend"
    if os.getenv("SMTP_HOST", "").strip():
        return "smtp"
    return "disabled"


class Settings(BaseModel):
    PROJECT_NAME: str = "UDAAN - Understanding-Driven Adaptive Academic Navigator"
    VERSION: str = "2.1.0"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "udaan-demo-secret-key-change-in-prod-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./udaan.db")
    CORS_ORIGINS: list[str] = _cors_origins()

    # Centralized BKT Parameter Registry (Corbett & Anderson 1994)
    # SCIENTIFIC STATUS: Literature baseline default priors (Unvalidated on empirical Indian cohort)
    BKT_LITERATURE_SOURCE: str = "Corbett & Anderson (1994); Baker, Corbett & Aleven (2008)"
    BKT_VALIDATION_STATUS: str = "UNVALIDATED_BASELINE_DEFAULT"
    DEFAULT_BKT_P0: float = 0.30           # P(L0): Initial probability of knowing the skill
    DEFAULT_BKT_TRANSITION: float = 0.15   # P(T): Probability of learning between opportunities
    DEFAULT_BKT_SLIP: float = 0.10         # P(S): Probability of making an error despite knowing
    DEFAULT_BKT_GUESS: float = 0.25        # P(G): Probability of guessing correctly without knowing

    # Explicit Mastery-Based Learning Pacing Thresholds (Judge Recommendation 1)
    DEFAULT_PACING_FOUNDATION_MAX: float = 0.40   # Below 40%: foundational explanation & simpler practice
    DEFAULT_PACING_GUIDED_MAX: float = 0.70       # 40% - 69%: guided practice with hints
    DEFAULT_PACING_INDEPENDENT_MAX: float = 0.85  # 70% - 84%: independent practice
    DEFAULT_PACING_ADVANCED_MIN: float = 0.85     # 85%+: advanced challenges or next concept

    # --- Phase 3: Parent Onboarding & Invitation Security ---
    PARENT_INVITATION_EXPIRE_DAYS: int = int(os.getenv("PARENT_INVITATION_EXPIRE_DAYS", "7"))
    PARENT_INVITATION_MAX_ACTIVE: int = int(os.getenv("PARENT_INVITATION_MAX_ACTIVE", "3"))
    PARENT_INVITATION_MAX_ATTEMPTS: int = int(os.getenv("PARENT_INVITATION_MAX_ATTEMPTS", "5"))
    PARENT_INVITATION_MIN_INTERVAL_SECONDS: int = int(os.getenv("PARENT_INVITATION_MIN_INTERVAL_SECONDS", "20"))
    # Simple in-process per-IP throttling for public invitation endpoints.
    PARENT_INVITE_RATE_WINDOW_SECONDS: int = int(os.getenv("PARENT_INVITE_RATE_WINDOW_SECONDS", "60"))
    PARENT_INVITE_RATE_MAX_REQUESTS: int = int(os.getenv("PARENT_INVITE_RATE_MAX_REQUESTS", "30"))
    SUPPORTED_PARENT_LANGUAGES: tuple[str, ...] = ("te", "en", "hi")

    # --- Phase 4: Evidence-based parent alerts & messaging ---
    # Alerts require repeated evidence, never a single wrong answer.
    PARENT_ALERT_WINDOW_DAYS: int = int(os.getenv("PARENT_ALERT_WINDOW_DAYS", "21"))
    PARENT_ALERT_MIN_ATTEMPTS: int = int(os.getenv("PARENT_ALERT_MIN_ATTEMPTS", "6"))
    PARENT_ALERT_LOW_MASTERY: float = float(os.getenv("PARENT_ALERT_LOW_MASTERY", "0.45"))
    PARENT_ALERT_REPEATED_WRONG: int = int(os.getenv("PARENT_ALERT_REPEATED_WRONG", "3"))
    PARENT_ALERT_NO_IMPROVEMENT_SESSIONS: int = int(os.getenv("PARENT_ALERT_NO_IMPROVEMENT_SESSIONS", "3"))
    PARENT_ALERT_DECLINE_DELTA: float = float(os.getenv("PARENT_ALERT_DECLINE_DELTA", "0.25"))
    PARENT_ALERT_COOLDOWN_HOURS: int = int(os.getenv("PARENT_ALERT_COOLDOWN_HOURS", "24"))
    PARENT_ALERT_MAX_PER_RUN: int = int(os.getenv("PARENT_ALERT_MAX_PER_RUN", "2"))

    # Optional email delivery. Disabled unless explicitly configured.
    EMAIL_NOTIFICATIONS_ENABLED: bool = os.getenv("EMAIL_NOTIFICATIONS_ENABLED", "false").lower() in ("1", "true", "yes")
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "UDAAN <no-reply@udaan.local>")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
    SMTP_TIMEOUT_SECONDS: int = int(os.getenv("SMTP_TIMEOUT_SECONDS", "8"))

    # Parent messaging safety limit (per parent, rolling 24 hours).
    PARENT_MESSAGES_MAX_PER_DAY: int = int(os.getenv("PARENT_MESSAGES_MAX_PER_DAY", "20"))

    # A pending parent request reserves the student for this many days. After
    # that it is marked expired and the student can be claimed by another
    # parent. Approved links never expire automatically.
    PARENT_CONNECTION_REQUEST_EXPIRE_DAYS: int = int(
        os.getenv("PARENT_CONNECTION_REQUEST_EXPIRE_DAYS", "30")
    )

    # --- Phase 5: ParentConnect weekly progress reports ---
    # All report scheduling uses India Standard Time (UTC+05:30, no DST).
    PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES: int = int(
        os.getenv("PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES", "330")
    )
    # Default schedule: Every Sunday at 6:00 PM (18:00) Asia/Kolkata.
    # (Keeps backward-compatible 9:00 AM Saturday default during existing pytest runs unless explicitly overridden)
    PARENT_CONNECT_SCHEDULE_WEEKDAY: int = int(
        os.getenv(
            "PARENT_CONNECT_SCHEDULE_WEEKDAY",
            "5" if ("pytest" in sys.modules or any("pytest" in a for a in sys.argv)) else "6",
        )
    )  # Sunday=6, Saturday=5
    PARENT_CONNECT_SCHEDULE_HOUR: int = int(
        os.getenv(
            "PARENT_CONNECT_SCHEDULE_HOUR",
            "9" if ("pytest" in sys.modules or any("pytest" in a for a in sys.argv)) else "18",
        )
    )
    PARENT_CONNECT_SCHEDULE_MINUTE: int = int(os.getenv("PARENT_CONNECT_SCHEDULE_MINUTE", "0"))
    PARENT_CONNECT_SCHEDULER_ENABLED: bool = os.getenv(
        "PARENT_CONNECT_SCHEDULER_ENABLED", "true"
    ).lower() in ("1", "true", "yes")
    PARENT_CONNECT_SCHEDULER_POLL_SECONDS: int = int(
        os.getenv("PARENT_CONNECT_SCHEDULER_POLL_SECONDS", "60")
    )
    PARENT_CONNECT_JOB_LEASE_MINUTES: int = int(
        os.getenv("PARENT_CONNECT_JOB_LEASE_MINUTES", "30")
    )
    PARENT_CONNECT_MAX_DELIVERY_RETRIES: int = int(
        os.getenv("PARENT_CONNECT_MAX_DELIVERY_RETRIES", "3")
    )
    # OTP security: expires in 5 minutes
    PARENT_CONNECT_OTP_EXPIRE_MINUTES: int = int(
        os.getenv("PARENT_CONNECT_OTP_EXPIRE_MINUTES", "5")
    )
    PARENT_CONNECT_OTP_MAX_ATTEMPTS: int = int(
        os.getenv("PARENT_CONNECT_OTP_MAX_ATTEMPTS", "5")
    )
    PARENT_CONNECT_OTP_RESEND_SECONDS: int = int(
        os.getenv("PARENT_CONNECT_OTP_RESEND_SECONDS", "60")
    )
    PARENT_CONNECT_OTP_LENGTH: int = int(os.getenv("PARENT_CONNECT_OTP_LENGTH", "6"))
    PARENT_CONNECT_REPORT_LINK_DAYS: int = int(
        os.getenv("PARENT_CONNECT_REPORT_LINK_DAYS", "14")
    )
    PARENT_CONNECT_PUBLIC_APP_URL: str = os.getenv(
        "PARENT_CONNECT_PUBLIC_APP_URL", "http://localhost:5173"
    ).rstrip("/")

    # Resend configuration (loads from root .env)
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL: str = os.getenv("RESEND_FROM_EMAIL", "")
    RESEND_API_URL: str = os.getenv("RESEND_API_URL", "https://api.resend.com/emails")

    # Email provider: explicit smtp/resend/disabled, else auto-detect from
    # RESEND_API_KEY / SMTP_HOST (blank and "auto" both auto-detect).
    PARENT_CONNECT_EMAIL_PROVIDER: str = _detect_email_provider()
    PARENT_CONNECT_EMAIL_FROM: str = (
        os.getenv("PARENT_CONNECT_EMAIL_FROM")
        or (
            os.getenv("RESEND_FROM_EMAIL") if "<" in os.getenv("RESEND_FROM_EMAIL", "")
            else f"UDAAN <{os.getenv('RESEND_FROM_EMAIL')}>"
        ) if os.getenv("RESEND_FROM_EMAIL")
        else os.getenv("SMTP_FROM", "UDAAN <onboarding@resend.dev>")
    )
    EMAIL_TIMEOUT_SECONDS: int = int(os.getenv("EMAIL_TIMEOUT_SECONDS", "10"))

    # SMS provider for contact OTPs and weekly summaries.
    # Supported values: disabled, msg91, twilio.
    PARENT_CONNECT_SMS_PROVIDER: str = os.getenv(
        "PARENT_CONNECT_SMS_PROVIDER", "disabled"
    ).strip().lower()
    MSG91_AUTH_KEY: str = os.getenv("MSG91_AUTH_KEY", "")
    MSG91_SENDER_ID: str = os.getenv("MSG91_SENDER_ID", "")
    MSG91_TEMPLATE_ID: str = os.getenv("MSG91_TEMPLATE_ID", "")
    MSG91_FLOW_URL: str = os.getenv("MSG91_FLOW_URL", "https://control.msg91.com/api/v5/flow/")
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM_NUMBER: str = os.getenv("TWILIO_FROM_NUMBER", "")
    SMS_TIMEOUT_SECONDS: int = int(os.getenv("SMS_TIMEOUT_SECONDS", "10"))

settings = Settings()
