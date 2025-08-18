import logging
from passlib.context import CryptContext
from typing import Optional, List
import os
from .auth_config import DB_CONFIG, DEFAULT_ROLE

# Configuration du hachage des mots de passe
import hashlib
import secrets

def hash_password(password: str) -> str:
    """Génère le hash d'un mot de passe avec salt"""
    salt = secrets.token_hex(16)
    hash_obj = hashlib.sha256()
    hash_obj.update((password + salt).encode('utf-8'))
    return f"{salt}${hash_obj.hexdigest()}"

def verify_password_hash(plain_password: str, hashed_password: str) -> bool:
    """Vérifie si le mot de passe correspond au hash"""
    try:
        salt, hash_value = hashed_password.split('$')
        hash_obj = hashlib.sha256()
        hash_obj.update((plain_password + salt).encode('utf-8'))
        return hash_obj.hexdigest() == hash_value
    except:
        return False

# Utiliser directement hashlib pour éviter les problèmes avec bcrypt
def get_password_hash(password: str) -> str:
    return hash_password(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return verify_password_hash(plain_password, hashed_password)

def get_connection():
    """Obtient une connexion à la base de données MySQL"""
    import mysql.connector
    return mysql.connector.connect(**DB_CONFIG)

def init_database():
    """Initialize database with default data if needed"""
    try:
        from database.init_db import init_sync_database
        from database.models import Base
        from database.config import sync_engine
        
        # Create all tables
        Base.metadata.create_all(bind=sync_engine)
        logging.info("Database tables created successfully")
        
        # Insert default data
        init_sync_database()
        logging.info("Database initialization completed")
    except Exception as e:
        logging.error(f"Error initializing database: {e}")
        raise

def get_user_by_email(email: str):
    """Récupère un utilisateur par son email"""
    try:
        from database.models import User
        from database.config import SessionLocal
        
        db = SessionLocal()
        user = db.query(User).filter(User.email == email).first()
        db.close()
        
        if user:
            return {
                "id": user.id,
                "email": user.email,
                "nom": user.nom,
                "prenom": user.prenom,
                "mot_de_passe_hash": user.mot_de_passe_hash,
                "role": user.role,
                "date_creation": user.date_creation,
                "actif": user.actif
            }
        return None
    except Exception as e:
        logging.error(f"Erreur lors de la récupération de l'utilisateur: {e}")
        if 'db' in locals():
            db.close()
        return None

def get_user_by_id(user_id: int):
    """Récupère un utilisateur par son ID"""
    try:
        from database.models import User
        from database.config import SessionLocal
        
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        db.close()
        
        if user:
            return {
                "id": user.id,
                "email": user.email,
                "nom": user.nom,
                "prenom": user.prenom,
                "mot_de_passe_hash": user.mot_de_passe_hash,
                "role": user.role,
                "date_creation": user.date_creation,
                "actif": user.actif
            }
        return None
    except Exception as e:
        logging.error(f"Erreur lors de la récupération de l'utilisateur: {e}")
        if 'db' in locals():
            db.close()
        return None

def create_user(email: str, nom: str = None, prenom: str = None, password: str = None, role: str = DEFAULT_ROLE):
    """Crée un nouvel utilisateur"""
    try:
        from database.models import User
        from database.config import SessionLocal
        
        db = SessionLocal()
        
        # Vérifier si l'email existe déjà
        if db.query(User).filter(User.email == email).first():
            db.close()
            return None, "Email déjà utilisé"
        
        # Utiliser des valeurs par défaut si nom et prenom sont None
        if nom is None:
            nom = "Utilisateur"
        if prenom is None:
            prenom = "Nouveau"
        
        # Créer un nouvel utilisateur
        user = User(
            email=email,
            nom=nom,
            prenom=prenom,
            mot_de_passe_hash=get_password_hash(password),
            role=role
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Convertir l'utilisateur en dictionnaire
        user_dict = {
            "id": user.id,
            "email": user.email,
            "nom": user.nom,
            "prenom": user.prenom,
            "role": user.role,
            "date_creation": user.date_creation,
            "actif": user.actif
        }
        
        db.close()
        return user_dict, None
        
    except Exception as e:
        logging.error(f"Erreur lors de la création de l'utilisateur: {e}")
        if 'db' in locals():
            db.rollback()
            db.close()
        return None, f"Erreur de base de données: {e}"

def update_user(user_id: int, **kwargs):
    """Met à jour un utilisateur"""
    try:
        from database.models import User
        from database.config import SessionLocal
        
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            db.close()
            return False, "Utilisateur non trouvé"
        
        # Mettre à jour les champs fournis
        for field, value in kwargs.items():
            if value is not None:
                if field == "password":
                    user.mot_de_passe_hash = get_password_hash(value)
                elif hasattr(user, field):
                    setattr(user, field, value)
        
        db.commit()
        db.refresh(user)
        db.close()
        
        return True, None
        
    except Exception as e:
        logging.error(f"Erreur lors de la mise à jour de l'utilisateur: {e}")
        if 'db' in locals():
            db.rollback()
            db.close()
        return False, f"Erreur de base de données: {e}"

def get_all_users():
    """Récupère tous les utilisateurs (pour l'admin)"""
    try:
        from database.models import User
        from database.config import SessionLocal
        
        db = SessionLocal()
        users = db.query(User).order_by(User.date_creation.desc()).all()
        
        result = [{
            "id": user.id,
            "email": user.email,
            "nom": user.nom,
            "prenom": user.prenom,
            "role": user.role,
            "date_creation": user.date_creation,
            "actif": user.actif
        } for user in users]
        
        db.close()
        return result
    except Exception as e:
        logging.error(f"Erreur lors de la récupération des utilisateurs: {e}")
        if 'db' in locals():
            db.close()
        return []

def authenticate_user(email: str, password: str):
    """Authentifie un utilisateur"""
    try:
        from database.models import User
        from database.config import SessionLocal
        
        db = SessionLocal()
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            return None
            
        if not verify_password(password, user.mot_de_passe_hash):
            return None
            
        if not user.actif:
            return None
            
        # Return user as dict for compatibility
        return {
            "id": user.id,
            "email": user.email,
            "nom": user.nom,
            "prenom": user.prenom,
            "role": user.role,
            "date_creation": user.date_creation,
            "actif": user.actif,
            "mot_de_passe_hash": user.mot_de_passe_hash  # Needed for token generation
        }
    except Exception as e:
        logging.error(f"Erreur lors de l'authentification: {e}")
        return None
    finally:
        if 'db' in locals():
            db.close() 