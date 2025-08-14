import cv2
import numpy as np
import fitz  # PyMuPDF
import pytesseract
from ultralytics import YOLO
import os
import json
from typing import List, Dict, Any, Tuple
import logging

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
    
    def extract_from_image(self, image_path: str, confidence_threshold: float = 0.5) -> Dict[str, Any]:
        """
        Extrait les données d'une image de facture
        
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
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        # Coordonnées de la boîte englobante
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                        confidence = float(box.conf[0].cpu().numpy())
                        class_id = int(box.cls[0].cpu().numpy())
                        class_name = self.class_names.get(class_id, f"Class_{class_id}")
                        
                        # Extraire le texte de la région détectée
                        roi = image[y1:y2, x1:x2]
                        if roi.size > 0:
                            # Convertir en niveaux de gris pour un meilleur OCR
                            gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                            
                            # Appliquer un prétraitement pour améliorer l'OCR
                            gray_roi = cv2.resize(gray_roi, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
                            
                            # Extraire le texte avec Tesseract
                            extracted_text = pytesseract.image_to_string(
                                gray_roi, 
                                config='--psm 6'
                            ).strip()
                            
                            # Stocker les informations de détection
                            detection_info = {
                                'class': class_name,
                                'confidence': confidence,
                                'bbox': (int(x1), int(y1), int(x2), int(y2)),
                                'text': extracted_text
                            }
                            detections.append(detection_info)
                            
                            # Ajouter aux données extraites
                            if class_name not in extracted_data:
                                extracted_data[class_name] = []
                            extracted_data[class_name].append(extracted_text)
            
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
