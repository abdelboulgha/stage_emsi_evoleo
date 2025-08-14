import os
import logging
from typing import List, Dict, Any
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from ai_models.yolo_extractor import YOLOExtractor

logger = logging.getLogger(__name__)

class AIExtractionService:
    def __init__(self):
        self.yolo_extractor = None
        self.load_model()

    def load_model(self):
        """Charge le modèle YOLO via la classe YOLOExtractor"""
        try:
            self.yolo_extractor = YOLOExtractor()
            if not self.yolo_extractor.model:
                logger.error("Échec du chargement du modèle YOLO")
            else:
                logger.info("Modèle YOLO chargé avec succès")
        except Exception as e:
            logger.error(f"Erreur lors du chargement du modèle: {str(e)}")

    def extract_from_files(self, file_paths: List[str], confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """Extrait les données de plusieurs fichiers avec le modèle AI"""
        if not self.yolo_extractor or not self.yolo_extractor.model:
            return [{
                'file_path': file_path,
                'error': 'Modèle YOLO non chargé',
                'extracted_data': {},
                'success': False
            } for file_path in file_paths]
        
        try:
            results = self.yolo_extractor.extract_multiple_files(file_paths, confidence_threshold)
            return results
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction multiple: {str(e)}")
            return [{
                'file_path': file_path,
                'error': str(e),
                'extracted_data': {},
                'success': False
            } for file_path in file_paths]

    def extract_from_single_file(self, file_path: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """Extrait les données d'un seul fichier avec le modèle AI"""
        if not self.yolo_extractor or not self.yolo_extractor.model:
            return {
                'success': False,
                'error': 'Modèle YOLO non chargé',
                'extracted_data': {}
            }
        
        try:
            result = self.yolo_extractor.extract_from_file(file_path, confidence_threshold)
            return result
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction de {file_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'extracted_data': {}
            }

    def get_model_info(self) -> Dict[str, Any]:
        """Retourne les informations sur le modèle chargé"""
        if not self.yolo_extractor:
            return {
                'loaded': False,
                'error': 'Service non initialisé'
            }
        
        return self.yolo_extractor.get_model_info()

    def validate_model(self) -> bool:
        """Valide que le modèle est correctement chargé et fonctionnel"""
        if not self.yolo_extractor:
            return False
        
        return self.yolo_extractor.validate_model()
