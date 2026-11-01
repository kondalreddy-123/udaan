from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def init_db_schema():
    from app import models  # Ensure all model tables are registered with Base.metadata
    Base.metadata.create_all(bind=engine)
    if settings.DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            # Check users columns
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
            if "class_name" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN class_name VARCHAR(100) DEFAULT 'Class 8 - Section A'"))
            if "grade" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN grade INTEGER DEFAULT 8"))
            
            # Check concept_masteries columns
            cm_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(concept_masteries)")).fetchall()]
            if "attempts_count" not in cm_cols:
                conn.execute(text("ALTER TABLE concept_masteries ADD COLUMN attempts_count INTEGER DEFAULT 0"))
            if "last_attempt_at" not in cm_cols:
                conn.execute(text("ALTER TABLE concept_masteries ADD COLUMN last_attempt_at DATETIME"))
            conn.commit()

init_db_schema()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
