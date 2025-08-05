import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

# Configuration JWT
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configuration de la base de données MySQL
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "evoleo"
}

# Configuration des rôles
ROLES = {
    "ADMIN": "admin",
    "COMPTABLE": "comptable"
}

# Configuration par défaut
DEFAULT_ROLE = ROLES["COMPTABLE"] 