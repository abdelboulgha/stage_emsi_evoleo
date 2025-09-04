from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends, Request, Response
from .auth_config import (
    JWT_SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES,
    COOKIE_SECURE, COOKIE_SAMESITE, COOKIE_DOMAIN, COOKIE_PATH
)
from .auth_models import TokenData
from .auth_database import get_user_by_email
import logging

# --- Token utils ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        if email is None:
            return None
        return TokenData(email=email, role=role)
    except JWTError as e:
        logging.error(f"Erreur de décodage JWT: {e}")
        return None

# --- Cookie handling ---
COOKIE_NAME = "access_token"

def set_auth_cookie(response: Response, token: str, expire_minutes: int):
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,   # True in production with HTTPS
        samesite=COOKIE_SAMESITE,
        max_age=expire_minutes * 60,
        expires=expire_minutes * 60,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN
    )

def clear_auth_cookie(response: Response):
    response.delete_cookie(
        key=COOKIE_NAME,
        path=COOKIE_PATH,
        domain=COOKIE_DOMAIN
    )

# --- User resolution ---
def get_current_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token d'authentification manquant"
        )

    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré"
        )

    user = get_user_by_email(email=token_data.email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur non trouvé"
        )

    if not user["actif"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compte désactivé"
        )

    return user

def get_current_active_user(current_user=Depends(get_current_user)):
    if not current_user["actif"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Compte inactif"
        )
    return current_user

def require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé. Rôle administrateur requis."
        )
    return current_user

def require_comptable_or_admin(current_user=Depends(get_current_user)):
    if current_user["role"] not in ["comptable", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès refusé. Rôle comptable ou administrateur requis."
        )
    return current_user
