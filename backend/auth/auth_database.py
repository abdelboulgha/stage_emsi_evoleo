import sqlite3
import logging
from passlib.context import CryptContext
from typing import Optional, List
import os
from .auth_config import DB_CONFIG, DEFAULT_ROLE, USE_SQLITE, SQLITE_DB_PATH

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
    """Obtient une connexion à la base de données"""
    if USE_SQLITE:
        return sqlite3.connect(SQLITE_DB_PATH)
    else:
        # Fallback vers MySQL si nécessaire
        import mysql.connector
        return mysql.connector.connect(**DB_CONFIG)

def init_database():
    """Initialise la base de données avec la table des utilisateurs"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        if USE_SQLITE:
            # Création de la table utilisateurs pour SQLite
            create_table_query = """
            CREATE TABLE IF NOT EXISTS utilisateurs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                mot_de_passe_hash TEXT NOT NULL,
                role TEXT DEFAULT 'comptable' CHECK (role IN ('admin', 'comptable')),
                date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actif INTEGER DEFAULT 1
            );
            """
        else:
            # Création de la table utilisateurs pour MySQL
            create_table_query = """
            CREATE TABLE IF NOT EXISTS utilisateurs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                nom VARCHAR(50) NOT NULL,
                prenom VARCHAR(50) NOT NULL,
                mot_de_passe_hash VARCHAR(255) NOT NULL,
                role ENUM('admin', 'comptable') DEFAULT 'comptable',
                date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actif BOOLEAN DEFAULT TRUE,
                INDEX idx_email (email),
                INDEX idx_role (role)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """
        
        cursor.execute(create_table_query)
        conn.commit()
        
        # Création d'un utilisateur admin par défaut si la table est vide
        cursor.execute("SELECT COUNT(*) FROM utilisateurs")
        count = cursor.fetchone()[0]
        
        if count == 0:
            admin_password = get_password_hash("admin123")
            if USE_SQLITE:
                insert_admin_query = """
                INSERT INTO utilisateurs (email, nom, prenom, mot_de_passe_hash, role)
                VALUES (?, ?, ?, ?, ?)
                """
                cursor.execute(insert_admin_query, ('admin@evoleo.com', 'Administrateur', 'Système', admin_password, 'admin'))
            else:
                insert_admin_query = """
                INSERT INTO utilisateurs (email, nom, prenom, mot_de_passe_hash, role)
                VALUES (%s, %s, %s, %s, %s)
                """
                cursor.execute(insert_admin_query, ('admin@evoleo.com', 'Administrateur', 'Système', admin_password, 'admin'))
            
            conn.commit()
            logging.info("Utilisateur admin par défaut créé")
        
        cursor.close()
        conn.close()
        logging.info("Base de données d'authentification initialisée avec succès")
        
    except Exception as e:
        logging.error(f"Erreur lors de l'initialisation de la base de données: {e}")
        raise



def get_user_by_email(email: str):
    """Récupère un utilisateur par son email"""
    try:
        conn = get_connection()
        if USE_SQLITE:
            cursor = conn.cursor()
            cursor.row_factory = sqlite3.Row
        else:
            cursor = conn.cursor(dictionary=True)
        
        if USE_SQLITE:
            query = "SELECT * FROM utilisateurs WHERE email = ?"
        else:
            query = "SELECT * FROM utilisateurs WHERE email = %s"
        
        cursor.execute(query, (email,))
        user = cursor.fetchone()
        
        if USE_SQLITE and user:
            user = dict(user)
        
        cursor.close()
        conn.close()
        
        return user
    except Exception as e:
        logging.error(f"Erreur lors de la récupération de l'utilisateur: {e}")
        return None

def get_user_by_id(user_id: int):
    """Récupère un utilisateur par son ID"""
    try:
        conn = get_connection()
        if USE_SQLITE:
            cursor = conn.cursor()
            cursor.row_factory = sqlite3.Row
        else:
            cursor = conn.cursor(dictionary=True)
        
        if USE_SQLITE:
            query = "SELECT * FROM utilisateurs WHERE id = ?"
        else:
            query = "SELECT * FROM utilisateurs WHERE id = %s"
        
        cursor.execute(query, (user_id,))
        user = cursor.fetchone()
        
        if USE_SQLITE and user:
            user = dict(user)
        
        cursor.close()
        conn.close()
        
        return user
    except Exception as e:
        logging.error(f"Erreur lors de la récupération de l'utilisateur: {e}")
        return None

def create_user(email: str, nom: str = None, prenom: str = None, password: str = None, role: str = DEFAULT_ROLE):
    """Crée un nouvel utilisateur"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Vérifier si l'email existe déjà
        if USE_SQLITE:
            cursor.execute("SELECT id FROM utilisateurs WHERE email = ?", (email,))
        else:
            cursor.execute("SELECT id FROM utilisateurs WHERE email = %s", (email,))
        
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return None, "Email déjà utilisé"
        
        # Utiliser des valeurs par défaut si nom et prenom sont None
        if nom is None:
            nom = "Utilisateur"
        if prenom is None:
            prenom = "Nouveau"
        
        # Hasher le mot de passe
        hashed_password = get_password_hash(password)
        
        # Insérer l'utilisateur
        if USE_SQLITE:
            insert_query = """
            INSERT INTO utilisateurs (email, nom, prenom, mot_de_passe_hash, role)
            VALUES (?, ?, ?, ?, ?)
            """
        else:
            insert_query = """
            INSERT INTO utilisateurs (email, nom, prenom, mot_de_passe_hash, role)
            VALUES (%s, %s, %s, %s, %s)
            """
        
        cursor.execute(insert_query, (email, nom, prenom, hashed_password, role))
        user_id = cursor.lastrowid
        
        conn.commit()
        cursor.close()
        conn.close()
        
        # Récupérer l'utilisateur créé
        return get_user_by_id(user_id), None
        
    except Exception as e:
        logging.error(f"Erreur lors de la création de l'utilisateur: {e}")
        return None, f"Erreur de base de données: {e}"

def update_user(user_id: int, **kwargs):
    """Met à jour un utilisateur"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Construire la requête de mise à jour
        update_fields = []
        values = []
        
        for field, value in kwargs.items():
            if value is not None:
                if field == "password":
                    update_fields.append("mot_de_passe_hash = %s")
                    values.append(get_password_hash(value))
                else:
                    update_fields.append(f"{field} = %s")
                    values.append(value)
        
        if not update_fields:
            cursor.close()
            conn.close()
            return False, "Aucun champ à mettre à jour"
        
        values.append(user_id)
        query = f"UPDATE utilisateurs SET {', '.join(update_fields)} WHERE id = %s"
        
        cursor.execute(query, values)
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return True, None
        
    except Exception as e:
        logging.error(f"Erreur lors de la mise à jour de l'utilisateur: {e}")
        return False, f"Erreur de base de données: {e}"

def get_all_users():
    """Récupère tous les utilisateurs (pour l'admin)"""
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        
        query = "SELECT id, email, nom, prenom, role, date_creation, actif FROM utilisateurs ORDER BY date_creation DESC"
        cursor.execute(query)
        users = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return users
    except Exception as e:
        logging.error(f"Erreur lors de la récupération des utilisateurs: {e}")
        return []

def authenticate_user(email: str, password: str):
    """Authentifie un utilisateur"""
    user = get_user_by_email(email)
    if not user:
        return None
    
    if not verify_password(password, user["mot_de_passe_hash"]):
        return None
    
    if not user["actif"]:
        return None
    
    return user 