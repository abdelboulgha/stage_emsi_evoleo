import os
import logging
from typing import List, Dict, Any
import sys
import os
import asyncio
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from ai_models.yolo_extractor import YOLOExtractor

logger = logging.getLogger(__name__)

class AIExtractionService:
    def __init__(self):
        self.yolo_extractor = None
        self._model_validated = False
        self._validation_error = None
        self._executor = ThreadPoolExecutor(max_workers=4)  # Pool de threads pour le traitement parallèle
        self.load_model()
        # Valider le modèle une seule fois au démarrage
        self._validate_model_once()

    def load_model(self):
        """Charge le modèle YOLO via la classe YOLOExtractor"""
        try:
            self.yolo_extractor = YOLOExtractor()
            if not self.yolo_extractor.model:
                logger.error("Échec du chargement du modèle YOLO")
                self._validation_error = "Modèle YOLO non chargé"
            else:
                logger.info("Modèle YOLO chargé avec succès")
        except Exception as e:
            logger.error(f"Erreur lors du chargement du modèle: {str(e)}")
            self._validation_error = str(e)

    def _validate_model_once(self):
        """Valide le modèle une seule fois au démarrage et cache le résultat"""
        try:
            if self.yolo_extractor and self.yolo_extractor.model:
                self._model_validated = self.yolo_extractor.validate_model()
                if self._model_validated:
                    logger.info("✅ Modèle YOLO validé avec succès au démarrage")
                else:
                    logger.error("❌ Échec de la validation du modèle YOLO au démarrage")
                    self._validation_error = "Échec de la validation du modèle"
            else:
                self._model_validated = False
                self._validation_error = "Modèle non chargé"
        except Exception as e:
            logger.error(f"Erreur lors de la validation du modèle au démarrage: {str(e)}")
            self._model_validated = False
            self._validation_error = str(e)

    def extract_from_files(self, file_paths: List[str], confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Extrait les données de plusieurs fichiers avec le modèle AI en parallèle"""
        if not self._model_validated:
            return [{
                'file_path': file_path,
                'error': f'Modèle YOLO non valide: {self._validation_error}',
                'extracted_data': {},
                'success': False
            } for file_path in file_paths]
        
        try:
            # Utiliser le pool de threads pour traiter les fichiers en parallèle
            with ThreadPoolExecutor(max_workers=min(len(file_paths), 4)) as executor:
                # Soumettre toutes les tâches d'extraction
                future_to_file = {
                    executor.submit(self._extract_single_file_optimized, file_path, confidence_threshold): file_path
                    for file_path in file_paths
                }
                
                # Collecter les résultats au fur et à mesure qu'ils arrivent
                results = []
                for future in concurrent.futures.as_completed(future_to_file):
                    file_path = future_to_file[future]
                    try:
                        result = future.result()
                        result['file_path'] = file_path
                        results.append(result)
                        logger.info(f"✅ Extraction terminée pour: {file_path}")
                    except Exception as e:
                        logger.error(f"❌ Erreur lors de l'extraction de {file_path}: {str(e)}")
                        results.append({
                            'file_path': file_path,
                            'error': str(e),
                            'extracted_data': {},
                            'success': False
                        })
                
                # Trier les résultats selon l'ordre des fichiers d'entrée
                results.sort(key=lambda x: file_paths.index(x['file_path']))
                return results
                
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction multiple: {str(e)}")
            return [{
                'file_path': file_path,
                'error': str(e),
                'extracted_data': {},
                'success': False
            } for file_path in file_paths]

    def _extract_single_file_optimized(self, file_path: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """Version optimisée de l'extraction d'un seul fichier avec gestion d'erreur améliorée"""
        try:
            result = self.yolo_extractor.extract_from_file(file_path, confidence_threshold)
            return result
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction de {file_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'extracted_data': {},
                'detections': [],
                'total_detections': 0
            }

    def extract_from_single_file(self, file_path: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """Extrait les données d'un seul fichier avec le modèle AI"""
        if not self._model_validated:
            return {
                'success': False,
                'error': f'Modèle YOLO non valide: {self._validation_error}',
                'extracted_data': {}
            }
        
        return self._extract_single_file_optimized(file_path, confidence_threshold)

    def get_model_info(self) -> Dict[str, Any]:
        """Retourne les informations sur le modèle chargé"""
        if not self.yolo_extractor:
            return {
                'loaded': False,
                'error': 'Service non initialisé'
            }
        
        info = self.yolo_extractor.get_model_info()
        info['validated'] = self._model_validated
        if not self._model_validated:
            info['validation_error'] = self._validation_error
        return info

    def validate_model(self) -> bool:
        """Retourne le résultat de la validation effectuée au démarrage (pas de nouvelle validation)"""
        return self._model_validated

    def get_validation_status(self) -> Dict[str, Any]:
        """Retourne le statut détaillé de la validation du modèle"""
        return {
            'validated': self._model_validated,
            'validation_error': self._validation_error,
            'model_loaded': self.yolo_extractor is not None and self.yolo_extractor.model is not None
        }

    def __del__(self):
        """Nettoyage des ressources lors de la destruction de l'objet"""
        if hasattr(self, '_executor'):
            self._executor.shutdown(wait=True)
