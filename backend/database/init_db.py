"""
Database initialization script using SQLAlchemy
"""
import asyncio
import logging
from sqlalchemy import text
from database.config import sync_engine, async_engine
from database.models import Base
from auth.auth_database import get_password_hash

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def update_database_schema():
    """Update database schema with new columns"""
    try:
        with sync_engine.connect() as conn:
            # Check and add created_at if it doesn't exist
            result = conn.execute(text(
                """
                SELECT COUNT(*)
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'templates'
                AND COLUMN_NAME = 'created_at'
                """
            ))
            
            if result.scalar() == 0:
                # Add the timestamp columns
                conn.execute(text(
                    """
                    ALTER TABLE templates
                    ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    """
                ))
                conn.commit()
                logger.info("Added timestamp columns to templates table")
                
    except Exception as e:
        logger.error(f"Error updating database schema: {e}")
        raise

async def update_database_schema_async():
    """Update database schema with new columns asynchronously"""
    try:
        async with async_engine.connect() as conn:
            # Check and add created_at if it doesn't exist
            result = await conn.execute(text(
                """
                SELECT COUNT(*)
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'templates'
                AND COLUMN_NAME = 'created_at'
                """
            ))
            
            if (await result.scalar()) == 0:
                # Add the timestamp columns
                await conn.execute(text(
                    """
                    ALTER TABLE templates
                    ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    """
                ))
                await conn.commit()
                logger.info("Added timestamp columns to templates table")
                
    except Exception as e:
        logger.error(f"Error updating database schema: {e}")
        raise


def init_sync_database():
    """Initialize database tables synchronously"""
    try:
        # Create all tables
        Base.metadata.create_all(bind=sync_engine) 
        logger.info("Database tables created")
        
        # Update schema if needed
        update_database_schema()
        
        # Insert default data
        insert_default_data()
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise


async def init_async_database():
    """Initialize database tables asynchronously"""
    try:
        # Create all tables
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created")
        
        # Update schema if needed
        await update_database_schema_async()
        
        # Insert default data
        await insert_default_data_async()
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise


def insert_default_data():
    """Insert default data into the database"""
    try:
        from sqlalchemy.orm import Session
        from .models import User, FieldName
        from .config import sync_engine
        
        with Session(sync_engine) as session:
            # Check if admin user exists
            admin = session.query(User).filter(User.email == "admin@evoleo.com").first()
            if not admin:
                # Create admin user
                admin = User(
                    email="admin@evoleo.com",
                    nom="Administrateur",
                    prenom="Système",
                    mot_de_passe_hash=get_password_hash("admin123"),
                    role="admin",
                    actif=True
                )
                session.add(admin)
                logger.info("Admin user created")
            
            # Check if field names exist
            if session.query(FieldName).count() == 0:
                # Insert default field names
                field_names = [
                    "numerofacture", "datefacturation", "fournisseur", 
                    "montantht", "montantttc", "tva",
                    "zone_ht", "zone_tva"
                ]
                
                for field_name in field_names:
                    field = FieldName(name=field_name)
                    session.add(field)
                
                logger.info("Default field names inserted")
            
            session.commit()
            
    except Exception as e:
        logger.error(f"Error inserting default data: {e}")
        if 'session' in locals():
            session.rollback()
        raise


async def insert_default_data_async():
    """Insert default data into the database asynchronously"""
    try:
        from sqlalchemy.ext.asyncio import AsyncSession
        from .models import User, FieldName
        from .config import async_engine
        
        async with AsyncSession(async_engine) as session:
            # Check if admin user exists
            result = await session.execute(text("SELECT COUNT(*) FROM utilisateurs"))
            if result.scalar() == 0:
                # Create admin user
                admin = User(
                    email="admin@evoleo.com",
                    nom="Administrateur",
                    prenom="Système",
                    mot_de_passe_hash=get_password_hash("admin123"),
                    role="admin",
                    actif=True
                )
                session.add(admin)
                logger.info("Admin user created")
            
            # Check if field names exist
            result = await session.execute(text("SELECT COUNT(*) FROM field_name"))
            if result.scalar() == 0:
                # Insert default field names
                field_names = [
                    "numerofacture", "datefacturation", "fournisseur", 
                    "montantht", "montantttc", "tva",
                    "zone_ht", "zone_tva"
                ]
                
                for field_name in field_names:
                    field = FieldName(name=field_name)
                    session.add(field)
                
                logger.info("Default field names inserted")
            
            await session.commit()
            
    except Exception as e:
        logger.error(f"Error inserting default data: {e}")
        if 'session' in locals():
            await session.rollback()
        raise


def init_database():
    """Main function to initialize database"""
    logger.info("Initializing database...")
    init_sync_database()
    logger.info("Database initialization complete")


async def init_database_async():
    """Main function to initialize database asynchronously"""
    logger.info("Initializing database asynchronously...")
    await init_async_database()
    logger.info("Database initialization complete")


# For backward compatibility
init_database_sync = init_sync_database
init_database_async = init_database_async


if __name__ == "__main__":
    # Run synchronous initialization
    init_database()
