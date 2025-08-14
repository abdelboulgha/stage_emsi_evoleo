#!/usr/bin/env python3
"""
Script de test pour vérifier le chargement du modèle YOLO
"""

import sys
import os

# Ajouter le répertoire parent au path
sys.path.append(os.path.dirname(__file__))

try:
    print("Test d'import du service AI...")
    from services.ai_extraction_service import AIExtractionService
    
    print("Service AI importé avec succès")
    
    print("Initialisation du service...")
    service = AIExtractionService()
    
    print("Service initialisé")
    
    print("Vérification du modèle...")
    model_info = service.get_model_info()
    print(f"Info du modèle: {model_info}")
    
    print("Validation du modèle...")
    is_valid = service.validate_model()
    print(f"Modèle valide: {is_valid}")
    
    print("Test réussi !")
    
except Exception as e:
    print(f"Erreur: {str(e)}")
    import traceback
    traceback.print_exc()
