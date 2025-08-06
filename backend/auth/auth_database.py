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
    """Initialise la base de données avec toutes les tables nécessaires"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Création de la table utilisateurs
        create_utilisateurs_query = """
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
        
        # Création de la table field_name
        create_field_name_query = """
        CREATE TABLE IF NOT EXISTS field_name (
            id INT(11) NOT NULL AUTO_INCREMENT,
            name VARCHAR(50) NOT NULL,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
        
        # Création de la table templates
        create_templates_query = """
        CREATE TABLE IF NOT EXISTS templates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_by INT(11) NOT NULL,
            FOREIGN KEY (created_by) REFERENCES utilisateurs(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
        
        # Création de la table mappings
        create_mappings_query = """
        CREATE TABLE IF NOT EXISTS mappings (
            id INT(11) NOT NULL AUTO_INCREMENT,
            template_id INT NOT NULL,
            field_id INT(11) NOT NULL,
            `left` FLOAT NOT NULL,
            top FLOAT NOT NULL,
            width FLOAT NOT NULL,
            height FLOAT NOT NULL,
            manual BOOLEAN NOT NULL,
            created_by INT(11) NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY (template_id) REFERENCES templates(id),
            FOREIGN KEY (field_id) REFERENCES field_name(id),
            FOREIGN KEY (created_by) REFERENCES utilisateurs(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
        
        # Création de la table facture
        create_facture_query = """
        CREATE TABLE IF NOT EXISTS facture (
            id INT(11) NOT NULL AUTO_INCREMENT,
            fournisseur VARCHAR(255) NOT NULL,
            numFacture VARCHAR(100) NOT NULL,
            tauxTVA DECIMAL(15,2) NOT NULL,
            montantHT DECIMAL(15,2) NOT NULL,
            montantTVA DECIMAL(15,2) NOT NULL,
            montantTTC DECIMAL(15,2) NOT NULL,
            dateFacturation DATE NOT NULL,
            date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by INT(11) NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY (created_by) REFERENCES utilisateurs(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
        
        # Exécution des requêtes de création des tables
        cursor.execute(create_utilisateurs_query)
        cursor.execute(create_field_name_query)
        cursor.execute(create_templates_query)
        cursor.execute(create_mappings_query)
        cursor.execute(create_facture_query)
        conn.commit()
        
        # Création d'un utilisateur admin par défaut si la table est vide
        cursor.execute("SELECT COUNT(*) FROM utilisateurs")
        count = cursor.fetchone()[0]
        
        if count == 0:
            admin_password = get_password_hash("admin123")
            insert_admin_query = """
            INSERT INTO utilisateurs (email, nom, prenom, mot_de_passe_hash, role)
            VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(insert_admin_query, ('admin@evoleo.com', 'Administrateur', 'Système', admin_password, 'admin'))
            conn.commit()
            logging.info("Utilisateur admin par défaut créé")
        
        # Insertion des données par défaut dans field_name si la table est vide
        cursor.execute("SELECT COUNT(*) FROM field_name")
        field_count = cursor.fetchone()[0]
        
        if field_count == 0:
            insert_field_data = """
            INSERT INTO field_name (id, name) VALUES
            (1, 'fournisseur'),
            (2, 'numeroFacture'),
            (3, 'tauxTVA'),
            (4, 'montantHT'),
            (5, 'montantTVA'),
            (6, 'montantTTC'),
            (7, 'dateFacturation')
            """
            cursor.execute(insert_field_data)
            conn.commit()
            logging.info("Données par défaut insérées dans field_name")
        
        cursor.close()
        conn.close()
        logging.info("Base de données initialisée avec succès")
        
    except Exception as e:
        logging.error(f"Erreur lors de l'initialisation de la base de données: {e}")
        raise

def get_user_by_email(email: str):
    """Récupère un utilisateur par son email"""
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        
        query = "SELECT * FROM utilisateurs WHERE email = %s"
        cursor.execute(query, (email,))
        user = cursor.fetchone()
        
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
        cursor = conn.cursor(dictionary=True)
        
        query = "SELECT * FROM utilisateurs WHERE id = %s"
        cursor.execute(query, (user_id,))
        user = cursor.fetchone()
        
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