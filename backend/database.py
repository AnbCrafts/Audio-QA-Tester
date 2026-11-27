import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# Default to local SQLite database; seamlessly switches to Postgres if DATABASE_URL is set in .env
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./inflect.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def run_schema_migrations():
    """Creates new tables, applies idempotent column additions, and seeds default workspace."""
    Base.metadata.create_all(bind=engine)
    default_limit = int(os.getenv("DEFAULT_ORG_DAILY_TOKEN_LIMIT", "500000"))

    with engine.begin() as conn:
        if DATABASE_URL.startswith("sqlite"):
            def _ensure_sqlite_col(table: str, col: str, col_type: str):
                cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()]
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))

            _ensure_sqlite_col("call_audits", "asset_id", "VARCHAR")
            _ensure_sqlite_col("call_audits", "org_id", "VARCHAR")
            _ensure_sqlite_col("call_audits", "cache_key", "VARCHAR")
            _ensure_sqlite_col("call_audits", "turns_count", "INTEGER NOT NULL DEFAULT 0")
            _ensure_sqlite_col("call_audits", "commitments_count", "INTEGER NOT NULL DEFAULT 0")
            for tbl in ("commitments", "audio_assets", "upload_sessions", "analysis_jobs", "audio_chunk_results"):
                _ensure_sqlite_col(tbl, "org_id", "VARCHAR")

            conn.execute(
                text(
                    "INSERT OR IGNORE INTO organizations (id, name, daily_token_limit, created_at) "
                    "VALUES ('default-org', 'Default Workspace', :lim, CURRENT_TIMESTAMP)"
                ),
                {"lim": default_limit},
            )
        else:
            conn.execute(text("ALTER TABLE call_audits ADD COLUMN IF NOT EXISTS asset_id VARCHAR"))
            conn.execute(text("ALTER TABLE call_audits ADD COLUMN IF NOT EXISTS org_id VARCHAR"))
            conn.execute(text("ALTER TABLE call_audits ADD COLUMN IF NOT EXISTS cache_key VARCHAR"))
            conn.execute(text("ALTER TABLE call_audits ADD COLUMN IF NOT EXISTS turns_count INTEGER NOT NULL DEFAULT 0"))
            conn.execute(text("ALTER TABLE call_audits ADD COLUMN IF NOT EXISTS commitments_count INTEGER NOT NULL DEFAULT 0"))
            for tbl in ("commitments", "audio_assets", "upload_sessions", "analysis_jobs", "audio_chunk_results"):
                conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS org_id VARCHAR"))

            conn.execute(
                text(
                    "INSERT INTO organizations (id, name, daily_token_limit, created_at) "
                    "VALUES ('default-org', 'Default Workspace', :lim, NOW()) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                {"lim": default_limit},
            )

        # Backfill org_id for legacy records
        for tbl in ("call_audits", "commitments", "audio_assets", "upload_sessions", "analysis_jobs", "audio_chunk_results"):
            conn.execute(text(f"UPDATE {tbl} SET org_id = 'default-org' WHERE org_id IS NULL"))

        # Backfill denormalized counts for existing call_audits
        conn.execute(
            text(
                "UPDATE call_audits SET turns_count = ("
                "SELECT COUNT(*) FROM transcript_segments WHERE transcript_segments.call_id = call_audits.id"
                ") WHERE turns_count = 0"
            )
        )
        conn.execute(
            text(
                "UPDATE call_audits SET commitments_count = ("
                "SELECT COUNT(*) FROM commitments WHERE commitments.call_id = call_audits.id"
                ") WHERE commitments_count = 0"
            )
        )

        # PostgreSQL GIN Full-Text Search index on spoken transcript text
        if not DATABASE_URL.startswith("sqlite"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_transcript_segments_fts "
                    "ON transcript_segments USING GIN (to_tsvector('english', coalesce(text, '')))"
                )
            )


def get_db():
    """FastAPI dependency yielding an independent database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
