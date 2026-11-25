import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Default to local SQLite database; seamlessly switches to Postgres if DATABASE_URL is set in .env
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./scaleworks.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """FastAPI dependency yielding an independent database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
