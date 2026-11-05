import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base, SessionLocal, init_db_schema
from app.seed_data import seed_database
from app.routers import (
    auth, concepts, questions, detective, attempts, teacher, comparison, student, ai,
    admin, parent, parent_connect, course_orchestrator,
)
from app.services import parent_connect_scheduler

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
  allow_origins=[
        "https://udaan-plum.vercel.app",
        "https://udaan-git-master-pro-bab6.vercel.app",
        "http://localhost:5173",
    ],
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
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(parent.router, prefix=settings.API_V1_STR)
app.include_router(parent_connect.router, prefix=settings.API_V1_STR)
app.include_router(course_orchestrator.router, prefix=settings.API_V1_STR)
app.include_router(course_orchestrator.student_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
def _start_parent_connect_scheduler():
    """Start the in-process weekly scheduler; DB locking makes it safe to run
    on every application instance."""
    parent_connect_scheduler.start_scheduler()


@app.on_event("shutdown")
def _stop_parent_connect_scheduler():
    parent_connect_scheduler.stop_scheduler()


@app.get("/api/health", tags=["System"])
def health_check():
    return {
        "status": "online",
        "service": "udaan-backend",
        "version": settings.VERSION,
        "database": "sqlite_connected" if settings.DATABASE_URL.startswith("sqlite") else "postgres_connected"
    }


@app.get("/health", tags=["System"], include_in_schema=False)
def health_check_root_alias():
    """Root-level alias for hosting platforms and uptime probes.

    The canonical health endpoint is ``/api/health``; some deployment
    platforms default to probing ``/health``.
    """
    return health_check()

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
