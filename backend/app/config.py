import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "UDAAN - Understanding-Driven Adaptive Academic Navigator"
    VERSION: str = "2.1.0"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "udaan-demo-secret-key-change-in-prod-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./udaan.db")
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://udaan-navigator.vercel.app",
        "*"
    ]

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

settings = Settings()
