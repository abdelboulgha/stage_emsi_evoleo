from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .auth_config import JWT_SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, COOKIE_SECURE, COOKIE_SAMESITE, COOKIE_DOMAIN, COOKIE_PATH
from .auth_models import TokenData
from .auth_database import get_user_by_email
import logging

# Configuration du security scheme
security = HTTPBearer(auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Crée un token d'accès JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[TokenData]:
    """Vérifie et décode un token JWT"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        
        if email is None:
            return None
        
        token_data = TokenData(email=email, role=role)
        return token_data
    except JWTError as e:
        logging.error(f"Erreur de décodage JWT: {e}")
        return None

def set_auth_cookie(response: Response, token: str, expires_in_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES):
    """Définit le cookie HttpOnly pour le token d'authentification"""
    response.set_cookie(
        key="auth_token",
        value=token,
        max_age=expires_in_minutes * 60,  # Convertir en secondes
        httponly=True,  # Empêche l'accès via JavaScript
        secure=COOKIE_SECURE,    # Cookie uniquement via HTTPS en production
        samesite=COOKIE_SAMESITE,  # Protection CSRF
        path=COOKIE_PATH,        # Cookie disponible sur tout le site
        domain=COOKIE_DOMAIN     # Domaine du cookie (None pour localhost)
    )

def clear_auth_cookie(response: Response):
    """Supprime le cookie d'authentification"""
    response.delete_cookie(
        key="auth_token",
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN
    )

def get_token_from_request(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = None) -> Optional[str]:
    """Extrait le token depuis les cookies ou les headers"""
    # Essayer d'abord depuis les cookies (HttpOnly)
    token = request.cookies.get("auth_token")
    if token:
        return token
    
    # Fallback vers les headers Authorization (pour compatibilité)
    if credentials:
        return credentials.credentials
    
    return None

def get_current_user(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Récupère l'utilisateur actuel à partir du token (cookie ou header)"""
    token = get_token_from_request(request, credentials)
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token d'authentification manquant",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token_data = verify_token(token)
    
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = get_user_by_email(email=token_data.email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur non trouvé",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user["actif"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compte désactivé",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user

def get_current_active_user(current_user = Depends(get_current_user)):
    """Récupère l'utilisateur actuel actif"""
    if not current_user["actif"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Compte inactif"
        )
    return current_user

def require_admin(current_user = Depends(get_current_user)):
    """Vérifie que l'utilisateur actuel est un administrateur"""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé. Rôle administrateur requis."
        )
    return current_user

def require_comptable_or_admin(current_user = Depends(get_current_user)):
    """Vérifie que l'utilisateur actuel est un comptable ou un administrateur"""
    if current_user["role"] not in ["comptable", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé. Rôle comptable ou administrateur requis."
        )
    return current_user 