
import os
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

db_url = os.getenv("DATABASE_URL")
print(f"DEBUG: DATABASE_URL at startup = {db_url}")

if not db_url:
    raise ValueError("❌ DATABASE_URL is not set in environment variables")


RAW_DATABASE_URL = os.getenv("DATABASE_URL")

if not RAW_DATABASE_URL:
    raise ValueError("❌ DATABASE_URL is not set in environment variables")


ASYNC_DATABASE_URL = RAW_DATABASE_URL.replace("mysql://", "mysql+asyncmy://", 1)
SYNC_DATABASE_URL  = RAW_DATABASE_URL.replace("mysql://", "mysql+pymysql://", 1)



# Async engine (used at runtime by FastAPI)
async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,             
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
    future=True,
)

# Sync engine (used for migrations / init scripts)
sync_engine = create_engine(
    SYNC_DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)


AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

SessionLocal = sessionmaker(
    bind=sync_engine,
    expire_on_commit=False,
)

Base = declarative_base()
metadata = MetaData()


async def get_async_db() -> AsyncSession:
    """Dependency for async DB session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

def get_sync_db():
    """Dependency for sync DB session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database():
    """Initialize database tables and default data (sync)"""
    from .init_db import init_database as init_db_func
    init_db_func()
