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


def init_sync_database():
    """Initialize database tables synchronously"""
    try:
        # Create all tables
        Base.metadata.create_all(bind=sync_engine)
        logger.info("Database tables created successfully")
        
        # Insert default data
        insert_default_data()
        logger.info("Default data inserted successfully")
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise


async def init_async_database():
    """Initialize database tables asynchronously"""
    try:
        async with async_engine.begin() as conn:
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables created successfully")
        
        # Insert default data
        await insert_default_data_async()
        logger.info("Default data inserted successfully")
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise


def insert_default_data():
    """Insert default data into the database"""
    try:
        with sync_engine.connect() as conn:
            # Check if admin user exists
            result = conn.execute(text("SELECT COUNT(*) FROM utilisateurs"))
            if result.scalar() == 0:
                # Insert admin user
                admin_password = get_password_hash("admin123")
                conn.execute(text("""
                    INSERT INTO utilisateurs (email, nom, prenom, mot_de_passe_hash, role)
                    VALUES (:email, :nom, :prenom, :password, :role)
                """), {
                    "email": "admin@evoleo.com",
                    "nom": "Administrateur",
                    "prenom": "Système",
                    "password": admin_password,
                    "role": "admin"
                })
                logger.info("Admin user created")
            
            # Check if field names exist
            result = conn.execute(text("SELECT COUNT(*) FROM field_name"))
            if result.scalar() == 0:
                # Insert default field names
                field_names = [
                    "numerofacture", "datefacturation", "fournisseur", "montantht",
                    "montantttc", "tva", "devise", "notes", "statut"
                ]
                
                for field_name in field_names:
                    conn.execute(text("""
                        INSERT INTO field_name (name) VALUES (:name)
                    """), {"name": field_name})
                
                logger.info("Default field names inserted")
            
            conn.commit()
            
    except Exception as e:
        logger.error(f"Error inserting default data: {e}")
        raise


async def insert_default_data_async():
    """Insert default data into the database asynchronously"""
    try:
        async with async_engine.begin() as conn:
            # Check if admin user exists
            result = await conn.execute(text("SELECT COUNT(*) FROM utilisateurs"))
            if result.scalar() == 0:
                # Insert admin user
                admin_password = get_password_hash("admin123")
                await conn.execute(text("""
                    INSERT INTO utilisateurs (email, nom, prenom, mot_de_passe_hash, role)
                    VALUES (:email, :nom, :prenom, :password, :role)
                """), {
                    "email": "admin@evoleo.com",
                    "nom": "Administrateur",
                    "prenom": "Système",
                    "password": admin_password,
                    "role": "admin"
                })
                logger.info("Admin user created")
            
            # Check if field names exist
            result = await conn.execute(text("SELECT COUNT(*) FROM field_name"))
            if result.scalar() == 0:
                # Insert default field names
                field_names = [
                    "numerofacture", "datefacturation", "fournisseur", "montantht",
                    "montantttc", "tva", "devise", "notes", "statut"
                ]
                
                for field_name in field_names:
                    await conn.execute(text("""
                        INSERT INTO field_name (name) VALUES (:name)
                    """), {"name": field_name})
                
                logger.info("Default field names inserted")
            
    except Exception as e:
        logger.error(f"Error inserting default data: {e}")
        raise


def init_database():
    """Main function to initialize database"""
    try:
        init_sync_database()
        logger.info("Database initialization completed successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise


async def init_database_async():
    """Main function to initialize database asynchronously"""
    try:
        await init_async_database()
        logger.info("Database initialization completed successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise


if __name__ == "__main__":
    # Run synchronous initialization
    init_database()
