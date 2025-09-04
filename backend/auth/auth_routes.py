from fastapi import APIRouter, HTTPException, status, Depends, Response, Request
from fastapi.security import HTTPBearer
from datetime import timedelta
from typing import List
import logging

from .auth_models import UserCreate, UserLogin, Token, UserResponse, PasswordChange, UserUpdate, AuthResponse
from .auth_database import create_user, authenticate_user, get_all_users, update_user, get_user_by_id, verify_password, get_password_hash
from .auth_jwt import create_access_token, get_current_user, require_admin, require_comptable_or_admin, set_auth_cookie, clear_auth_cookie
from .auth_config import ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(prefix="/auth", tags=["authentification"])

@router.post("/register", response_model=AuthResponse)
async def register(user_data: UserCreate, response: Response):
    """Inscription d'un nouvel utilisateur"""
    try:
        # Créer l'utilisateur
        user, error = create_user(
            email=user_data.email,
            nom=user_data.nom,
            prenom=user_data.prenom,
            password=user_data.password,
            role=user_data.role or "comptable"
        )
        
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
        
        # Créer le token d'accès
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["email"], "role": user["role"]},
            expires_delta=access_token_expires
        )
        
        # Définir le cookie HttpOnly
        set_auth_cookie(response, access_token, ACCESS_TOKEN_EXPIRE_MINUTES)
        
        # Préparer la réponse utilisateur
        user_response = UserResponse(
            id=user["id"],
            email=user["email"],
            nom=user["nom"],
            prenom=user["prenom"],
            role=user["role"],
            date_creation=user["date_creation"],
            actif=user["actif"]
        )
        
        return AuthResponse(
            message="Inscription réussie",
            user=user_response
        )
        
    except Exception as e:
        logging.error(f"Erreur lors de l'inscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne du serveur"
        )
@router.post("/login", response_model=Token)
async def login(user_credentials: UserLogin, response: Response):
    """Connexion d'un utilisateur"""
    try:
        # Authentifier l'utilisateur
        user = authenticate_user(user_credentials.email, user_credentials.password)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email ou mot de passe incorrect",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Créer le token d'accès
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["email"], "role": user["role"]},
            expires_delta=access_token_expires
        )
        
        # Définir le cookie HttpOnly (optionnel)
        set_auth_cookie(response, access_token, ACCESS_TOKEN_EXPIRE_MINUTES)
        
        # Préparer la réponse utilisateur
        user_response = UserResponse(
            id=user["id"],
            email=user["email"],
            nom=user["nom"],
            prenom=user["prenom"],
            role=user["role"],
            date_creation=user["date_creation"],
            actif=user["actif"]
        )
        
        # Retourner aussi le JWT
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erreur lors de la connexion: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne du serveur"
        )

@router.post("/logout")
async def logout(response: Response):
    """Déconnexion de l'utilisateur"""
    try:
        # Supprimer le cookie d'authentification
        clear_auth_cookie(response)
        
        return {"message": "Déconnexion réussie"}
        
    except Exception as e:
        logging.error(f"Erreur lors de la déconnexion: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne du serveur"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user = Depends(get_current_user)):
    """Récupère les informations de l'utilisateur connecté"""
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        nom=current_user["nom"],
        prenom=current_user["prenom"],
        role=current_user["role"],
        date_creation=current_user["date_creation"],
        actif=current_user["actif"]
    )

@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user = Depends(get_current_user)
):
    """Change le mot de passe de l'utilisateur connecté"""
    try:
        # Using the already imported verify_password from auth_database
        
        # Vérifier l'ancien mot de passe
        if not verify_password(password_data.current_password, current_user["mot_de_passe_hash"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mot de passe actuel incorrect"
            )
        
        # Mettre à jour le mot de passe
        success, error = update_user(
            current_user["id"],
            password=password_data.new_password
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error
            )
        
        return {"message": "Mot de passe modifié avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erreur lors du changement de mot de passe: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne du serveur"
        )

# Routes administrateur
@router.get("/users", response_model=List[UserResponse])
async def get_users(current_user = Depends(require_admin)):
    """Récupère tous les utilisateurs (admin seulement)"""
    try:
        users = get_all_users()
        return [
            UserResponse(
                id=user["id"],
                email=user["email"],
                nom=user["nom"],
                prenom=user["prenom"],
                role=user["role"],
                date_creation=user["date_creation"],
                actif=user["actif"]
            )
            for user in users
        ]
    except Exception as e:
        logging.error(f"Erreur lors de la récupération des utilisateurs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne du serveur"
        )

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user_by_admin(
    user_id: int,
    user_update: UserUpdate,
    current_user = Depends(require_admin)
):
    """Met à jour un utilisateur (admin seulement)"""
    try:
        # Vérifier que l'utilisateur existe
        user = get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur non trouvé"
            )
        
        # Préparer les données de mise à jour
        update_data = {}
        if user_update.nom is not None:
            update_data["nom"] = user_update.nom
        if user_update.prenom is not None:
            update_data["prenom"] = user_update.prenom
        if user_update.role is not None:
            update_data["role"] = user_update.role
        if user_update.actif is not None:
            update_data["actif"] = user_update.actif
        
        # Mettre à jour l'utilisateur
        success, error = update_user(user_id, **update_data)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error
            )
        
        # Récupérer l'utilisateur mis à jour
        updated_user = get_user_by_id(user_id)
        
        return UserResponse(
            id=updated_user["id"],
            email=updated_user["email"],
            nom=updated_user["nom"],
            prenom=updated_user["prenom"],
            role=updated_user["role"],
            date_creation=updated_user["date_creation"],
            actif=updated_user["actif"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erreur lors de la mise à jour de l'utilisateur: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne du serveur"
        )

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, current_user = Depends(require_admin)):
    """Désactive un utilisateur (admin seulement)"""
    try:
        # Vérifier que l'utilisateur existe
        user = get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Utilisateur non trouvé"
            )
        
        # Empêcher la suppression de l'utilisateur connecté
        if user_id == current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vous ne pouvez pas désactiver votre propre compte"
            )
        
        # Désactiver l'utilisateur
        success, error = update_user(user_id, actif=False)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error
            )
        
        return {"message": "Utilisateur désactivé avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erreur lors de la désactivation de l'utilisateur: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne du serveur"
        ) 