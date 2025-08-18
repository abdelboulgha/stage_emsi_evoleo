"""
Script to run database migrations
"""
import asyncio
import logging
from database.init_db import init_database, init_database_async

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migration():
    """Run database migration synchronously"""
    logger.info("Starting database migration...")
    init_database()
    logger.info("Database migration completed successfully")

async def run_migration_async():
    """Run database migration asynchronously"""
    logger.info("Starting async database migration...")
    await init_database_async()
    logger.info("Async database migration completed successfully")

if __name__ == "__main__":
    # Run synchronous migration by default
    run_migration()
    
    # To run async migration, uncomment the following:
    # asyncio.run(run_migration_async())
