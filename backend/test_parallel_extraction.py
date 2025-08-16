#!/usr/bin/env python3
"""
Script de test pour vérifier l'extraction parallèle OCR
"""

import os
import sys
import time
import logging
from pathlib import Path

# Ajouter le répertoire parent au path
sys.path.append(os.path.dirname(__file__))

from services.ai_extraction_service import AIExtractionService

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def test_parallel_extraction():
    """Test de l'extraction parallèle"""
    print("🧪 === TEST EXTRACTION PARALLÈLE ===")
    
    # Initialiser le service
    print("📡 Initialisation du service AI...")
    service = AIExtractionService()
    
    # Vérifier le statut
    validation_status = service.get_validation_status()
    print(f"📊 Statut de validation: {validation_status}")
    
    if not validation_status['validated']:
        print(f"❌ Modèle non valide: {validation_status['validation_error']}")
        return
    
    # Créer des fichiers de test (images factices)
    test_files = []
    test_dir = Path("test_images")
    test_dir.mkdir(exist_ok=True)
    
    print("🖼️ Création d'images de test...")
    for i in range(3):
        # Créer une image factice avec du texte
        import numpy as np
        import cv2
        
        # Créer une image blanche avec du texte
        img = np.ones((400, 600, 3), dtype=np.uint8) * 255
        
        # Ajouter du texte factice
        cv2.putText(img, f"Test Invoice {i+1}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        cv2.putText(img, "Amount: 100.00", (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
        cv2.putText(img, "Date: 01/01/2024", (50, 300), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
        
        test_file_path = test_dir / f"test_invoice_{i+1}.png"
        cv2.imwrite(str(test_file_path), img)
        test_files.append(str(test_file_path))
        print(f"  ✅ Image créée: {test_file_path}")
    
    # Test d'extraction séquentielle vs parallèle
    print("\n🔍 Test d'extraction séquentielle...")
    start_time = time.time()
    
    # Test séquentiel (ancienne méthode)
    sequential_results = []
    for file_path in test_files:
        result = service.extract_from_single_file(file_path)
        sequential_results.append(result)
    
    sequential_time = time.time() - start_time
    print(f"⏱️ Temps séquentiel: {sequential_time:.2f}s")
    
    # Test parallèle (nouvelle méthode)
    print("\n🚀 Test d'extraction parallèle...")
    start_time = time.time()
    
    parallel_results = service.extract_from_files(test_files)
    
    parallel_time = time.time() - start_time
    print(f"⏱️ Temps parallèle: {parallel_time:.2f}s")
    
    # Comparaison des performances
    if len(test_files) > 1:
        speedup = sequential_time / parallel_time
        print(f"🚀 Accélération: {speedup:.2f}x")
    
    # Affichage des résultats
    print(f"\n📊 Résultats séquentiels: {len(sequential_results)}")
    print(f"📊 Résultats parallèles: {len(parallel_results)}")
    
    # Nettoyage
    print("\n🧹 Nettoyage des fichiers de test...")
    for file_path in test_files:
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"  🗑️ Supprimé: {file_path}")
    
    if test_dir.exists():
        test_dir.rmdir()
        print(f"  🗑️ Répertoire supprimé: {test_dir}")
    
    print("\n✅ Test terminé!")

if __name__ == "__main__":
    test_parallel_extraction()
