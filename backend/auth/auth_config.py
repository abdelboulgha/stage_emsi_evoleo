import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

# Configuration JWT
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Configuration des cookies
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "False").lower() == "true"  # True en production (HTTPS)
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")  # "strict", "lax", ou "none"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", None)  # Domaine du cookie
COOKIE_PATH = "/"  # Chemin du cookie

# Configuration CORS
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
CORS_ALLOW_CREDENTIALS = True

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