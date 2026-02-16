from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite only
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and seed super admin if needed."""
    import os
    os.makedirs("data", exist_ok=True)

    Base.metadata.create_all(bind=engine)

    # Lightweight migration: add new columns to existing tables
    with engine.connect() as conn:
        for col, col_type in [
            ("server_url", "VARCHAR(500) DEFAULT ''"),
            ("server_api_token", "TEXT DEFAULT ''"),
            ("allowed_application_ids", "TEXT DEFAULT ''"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE tenant_assignments ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                conn.rollback()  # Column already exists

    from .auth.models import User, Role
    from .auth.utils import hash_password

    db = SessionLocal()
    try:
        # Create default super admin if no users exist
        if db.query(User).count() == 0:
            admin = User(
                username="admin",
                email="admin@localhost",
                hashed_password=hash_password("admin"),
                role=Role.SUPER_ADMIN,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("Default super admin created: admin / admin")
    finally:
        db.close()
