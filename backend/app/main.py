import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base, SessionLocal, init_db_schema
from app.seed_data import seed_database
from app.routers import (
    auth, concepts, questions, detective, attempts, teacher, comparison, student, ai
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("udaan")

# Create tables & migrate columns
init_db_schema()

# Seed initial database
with SessionLocal() as db:
    try:
        seed_database(db)
        logger.info("Database initialized and seeded successfully.")
    except Exception as e:
        logger.error(f"Error seeding database: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API for UDAAN — Understanding-Driven Adaptive Academic Navigator",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(concepts.router, prefix=settings.API_V1_STR)
app.include_router(questions.router, prefix=settings.API_V1_STR)
app.include_router(detective.router, prefix=settings.API_V1_STR)
app.include_router(attempts.router, prefix=settings.API_V1_STR)
app.include_router(teacher.router, prefix=settings.API_V1_STR)
app.include_router(comparison.router, prefix=settings.API_V1_STR)
app.include_router(student.router, prefix=settings.API_V1_STR)
app.include_router(ai.router, prefix=settings.API_V1_STR)

@app.get("/api/health", tags=["System"])
def health_check():
    return {
        "status": "online",
        "service": "udaan-backend",
        "version": settings.VERSION,
        "database": "sqlite_connected" if settings.DATABASE_URL.startswith("sqlite") else "postgres_connected"
    }

@app.get("/", tags=["System"])
def root():
    return {
        "project": "UDAAN - Understanding-Driven Adaptive Academic Navigator",
        "status": "running",
        "api_documentation": "/docs",
        "health_check": "/api/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
