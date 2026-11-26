import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

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


def run_schema_migrations():
    """Creates new tables and applies idempotent column additions to existing tables."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        if DATABASE_URL.startswith("sqlite"):
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(call_audits)")).fetchall()]
            if "asset_id" not in cols:
                conn.execute(text("ALTER TABLE call_audits ADD COLUMN asset_id VARCHAR"))
        else:
            conn.execute(text("ALTER TABLE call_audits ADD COLUMN IF NOT EXISTS asset_id VARCHAR"))


def get_db():
    """FastAPI dependency yielding an independent database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
