import cv2
import numpy as np
import fitz  # PyMuPDF
import pytesseract
from ultralytics import YOLO
import os
import json
from typing import List, Dict, Any, Tuple
import logging
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor
import threading

logger = logging.getLogger(__name__)

class YOLOExtractor:
    """
    Classe pour l'extraction de données de factures utilisant YOLO + Tesseract OCR
    """
    
    def __init__(self, model_path: str = None):
        """
        Initialise l'extracteur YOLO
        
        Args:
            model_path: Chemin vers le fichier modèle YOLO (.pt)
        """
        self.model = None
        self.class_names = {
            0: "HT", 1: "TTC", 2: "TVA", 3: "date", 4: "fournisseur", 
            5: "numFacture", 6: "taux"
        }
        
        # Chemin par défaut du modèle
        if model_path is None:
            model_path = os.path.join(os.path.dirname(__file__), "best.pt")
        
        self.model_path = model_path
        self._ocr_executor = ThreadPoolExecutor(max_workers=8)  # Pool pour l'OCR parallèle
        self.load_model()
    
    def load_model(self) -> bool:
        """
        Charge le modèle YOLO
        
        Returns:
            bool: True si le modèle est chargé avec succès, False sinon
        """
        try:
            if os.path.exists(self.model_path):
                self.model = YOLO(self.model_path)
                logger.info(f"Modèle YOLO chargé avec succès depuis: {self.model_path}")
                return True
            else:
                logger.error(f"Fichier modèle non trouvé: {self.model_path}")
                return False
        except Exception as e:
            logger.error(f"Erreur lors du chargement du modèle: {str(e)}")
            return False

    def _extract_text_from_roi_parallel(self, roi_data: Tuple[np.ndarray, str, float, Tuple[int, int, int, int]]) -> Dict[str, Any]:
        """
        Extrait le texte d'une région d'intérêt en parallèle
        
        Args:
            roi_data: Tuple contenant (roi_image, class_name, confidence, bbox)
            
        Returns:
            Dict contenant les informations d'extraction
        """
        roi, class_name, confidence, bbox = roi_data
        
        try:
            if roi.size == 0:
                return {
                    'class': class_name,
                    'confidence': confidence,
                    'bbox': bbox,
                    'text': '',
                    'success': False,
                    'error': 'ROI vide'
                }
            
            # Convertir en niveaux de gris pour un meilleur OCR
            gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            
            # Appliquer un prétraitement pour améliorer l'OCR
            # Redimensionner pour une meilleure résolution
            gray_roi = cv2.resize(gray_roi, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            
            # Appliquer des filtres pour améliorer la qualité
            # Filtre gaussien pour réduire le bruit
            gray_roi = cv2.GaussianBlur(gray_roi, (1, 1), 0)
            
            # Seuillage adaptatif pour améliorer la lisibilité
            gray_roi = cv2.adaptiveThreshold(
                gray_roi, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )
            
            # Extraire le texte avec Tesseract avec configuration optimisée
            extracted_text = pytesseract.image_to_string(
                gray_roi, 
                config='--psm 6 --oem 3 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,€$%()/- '
            ).strip()
            
            return {
                'class': class_name,
                'confidence': confidence,
                'bbox': bbox,
                'text': extracted_text,
                'success': True,
                'error': None
            }
            
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction OCR de {class_name}: {str(e)}")
            return {
                'class': class_name,
                'confidence': confidence,
                'bbox': bbox,
                'text': '',
                'success': False,
                'error': str(e)
            }

    def extract_from_image(self, image_path: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """
        Extrait les données d'une image de facture avec OCR parallèle
        
        Args:
            image_path: Chemin vers l'image
            confidence_threshold: Seuil de confiance pour la détection
            
        Returns:
            Dict contenant les données extraites et les détections
        """
        try:
            # Charger l'image
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Impossible de charger l'image: {image_path}")
            
            # Exécuter la détection YOLO
            results = self.model(image, conf=confidence_threshold)
            
            # Extraire les données
            extracted_data = {}
            detections = []
            roi_tasks = []
            
            # Préparer toutes les tâches d'OCR en parallèle
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        # Coordonnées de la boîte englobante
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        confidence = float(box.conf[0].cpu().numpy())
                        class_id = int(box.cls[0].cpu().numpy())
                        class_name = self.class_names.get(class_id, f"Class_{class_id}")
                        
                        # Extraire la région d'intérêt
                        roi = image[y1:y2, x1:x2]
                        if roi.size > 0:
                            # Préparer la tâche d'OCR
                            roi_data = (roi, class_name, confidence, (int(x1), int(y1), int(x2), int(y2)))
                            roi_tasks.append(roi_data)
            
            # Exécuter toutes les tâches d'OCR en parallèle
            if roi_tasks:
                logger.info(f"🚀 Lancement de {len(roi_tasks)} tâches d'OCR en parallèle")
                
                # Utiliser le pool d'exécution pour traiter toutes les régions simultanément
                with ThreadPoolExecutor(max_workers=min(len(roi_tasks), 8)) as executor:
                    # Soumettre toutes les tâches
                    future_to_roi = {
                        executor.submit(self._extract_text_from_roi_parallel, roi_data): roi_data
                        for roi_data in roi_tasks
                    }
                    
                    # Collecter les résultats au fur et à mesure qu'ils arrivent
                    for future in concurrent.futures.as_completed(future_to_roi):
                        roi_data = future_to_roi[future]
                        try:
                            result = future.result()
                            detections.append(result)
                            
                            # Ajouter aux données extraites
                            if result['success'] and result['text']:
                                class_name = result['class']
                                if class_name not in extracted_data:
                                    extracted_data[class_name] = []
                                extracted_data[class_name].append(result['text'])
                            
                            logger.debug(f"✅ OCR terminé pour {result['class']}: '{result['text'][:20]}...'")
                            
                        except Exception as e:
                            logger.error(f"❌ Erreur lors de l'OCR de {roi_data[1]}: {str(e)}")
                            detections.append({
                                'class': roi_data[1],
                                'confidence': roi_data[2],
                                'bbox': roi_data[3],
                                'text': '',
                                'success': False,
                                'error': str(e)
                            })
            
            logger.info(f"🎯 Extraction terminée: {len(detections)} détections, {len(extracted_data)} classes")
            
            return {
                'success': True,
                'extracted_data': extracted_data,
                'detections': detections,
                'total_detections': len(detections)
            }
            
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction de l'image {image_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'extracted_data': {},
                'detections': [],
                'total_detections': 0
            }
    
    def extract_from_pdf(self, pdf_path: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """
        Extrait les données d'un PDF de facture (première page)
        
        Args:
            pdf_path: Chemin vers le PDF
            confidence_threshold: Seuil de confiance pour la détection
            
        Returns:
            Dict contenant les données extraites et les détections
        """
        try:
            # Convertir la première page du PDF en image
            doc = fitz.open(pdf_path)
            page = doc[0]  # Première page
            
            # Rendu de la page en image avec zoom pour une meilleure qualité
            mat = fitz.Matrix(2.0, 2.0)  # Zoom 2x
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            
            # Convertir en tableau numpy
            nparr = np.frombuffer(img_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            doc.close()
            
            if image is None:
                raise ValueError(f"Impossible de convertir le PDF en image: {pdf_path}")
            
            # Sauvegarder temporairement l'image pour l'extraction
            temp_image_path = f"temp_{os.path.basename(pdf_path)}.png"
            cv2.imwrite(temp_image_path, image)
            
            try:
                # Extraire les données de l'image
                result = self.extract_from_image(temp_image_path, confidence_threshold)
                result['source_type'] = 'pdf'
                return result
            finally:
                # Nettoyer le fichier temporaire
                if os.path.exists(temp_image_path):
                    os.remove(temp_image_path)
                    
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction du PDF {pdf_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'extracted_data': {},
                'detections': [],
                'total_detections': 0
            }
    
    def extract_from_file(self, file_path: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """
        Extrait les données d'un fichier (PDF ou image)
        
        Args:
            file_path: Chemin vers le fichier
            confidence_threshold: Seuil de confiance pour la détection
            
        Returns:
            Dict contenant les données extraites et les détections
        """
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext == '.pdf':
            return self.extract_from_pdf(file_path, confidence_threshold)
        elif file_ext in ['.png', '.jpg', '.jpeg', '.bmp', '.tiff']:
            return self.extract_from_image(file_path, confidence_threshold)
        else:
            return {
                'success': False,
                'error': f"Type de fichier non supporté: {file_ext}",
                'extracted_data': {},
                'detections': [],
                'total_detections': 0
            }
    
    def extract_multiple_files(self, file_paths: List[str], confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """
        Extrait les données de plusieurs fichiers
        
        Args:
            file_paths: Liste des chemins de fichiers
            confidence_threshold: Seuil de confiance pour la détection
            
        Returns:
            Liste des résultats d'extraction pour chaque fichier
        """
        results = []
        
        for file_path in file_paths:
            logger.info(f"Extraction en cours pour: {file_path}")
            result = self.extract_from_file(file_path, confidence_threshold)
            result['file_path'] = file_path
            results.append(result)
        
        return results
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Retourne les informations sur le modèle chargé
        
        Returns:
            Dict contenant les informations du modèle
        """
        if self.model is None:
            return {
                'loaded': False,
                'error': 'Modèle non chargé'
            }
        
        return {
            'loaded': True,
            'model_path': self.model_path,
            'class_names': self.class_names,
            'total_classes': len(self.class_names)
        }
    
    def validate_model(self) -> bool:
        """
        Valide que le modèle est correctement chargé et fonctionnel
        
        Returns:
            bool: True si le modèle est valide, False sinon
        """
        if self.model is None:
            return False
        
        try:
            # Test simple avec une image vide
            test_image = np.zeros((100, 100, 3), dtype=np.uint8)
            results = self.model(test_image, conf=0.1)
            return True
        except Exception as e:
            logger.error(f"Erreur de validation du modèle: {str(e)}")
            return False

    def cleanup(self):
        """Nettoie les ressources de l'extracteur"""
        try:
            if hasattr(self, '_ocr_executor'):
                self._ocr_executor.shutdown(wait=True)
                logger.info("Pool d'exécution OCR fermé")
        except Exception as e:
            logger.error(f"Erreur lors de la fermeture du pool d'exécution: {str(e)}")

    def __del__(self):
        """Destructeur pour nettoyer les ressources"""
        self.cleanup()

# Fonction utilitaire pour créer une instance de l'extracteur
def create_yolo_extractor(model_path: str = None) -> YOLOExtractor:
    """
    Crée et retourne une instance de YOLOExtractor
    
    Args:
        model_path: Chemin vers le fichier modèle YOLO
        
    Returns:
        Instance de YOLOExtractor
    """
    return YOLOExtractor(model_path)

if __name__ == "__main__":
    # Test de la classe
    extractor = YOLOExtractor()
    print("Informations du modèle:", extractor.get_model_info())
    print("Modèle valide:", extractor.validate_model())
    extractor.cleanup()
