from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, List
import json
import os
import pymupdf as fitz
from PIL import Image, ImageEnhance, ImageOps
import logging
from paddleocr import PaddleOCR
import numpy as np
# import cv2  # No longer needed for preprocessing
import base64
from io import BytesIO
import tempfile
import shutil
from math import hypot

# Configuration
MAPPING_FILE = 'fournisseur_mappings.json'
UPLOAD_DIR = 'uploads'
DEBUG_DIR = 'debug_images'

# Créer les dossiers nécessaires
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)

# Configuration du logging
logging.basicConfig(
    filename='invoice_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(message)s'
)

# Initialiser PaddleOCR avec les paramètres spécifiés
ocr = PaddleOCR(
    det=True,
    rec=True,
    use_angle_cls=False,
    det_algorithm='DB',
    det_db_box_thresh=0.45,
    lang='en',
    gpu_mem=3000,
    det_db_unclip_ratio=1.3,
    use_gpu=True
)

app = FastAPI(title="Invoice Extractor API", version="1.0.0")

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # URL de votre app React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modèles Pydantic
class FieldCoordinates(BaseModel):
    left: float
    top: float
    width: float
    height: float

class FieldMapping(BaseModel):
    field_map: Dict[str, Optional[FieldCoordinates]]

class EmetteurMapping(BaseModel):
    emetteur: str
    field_map: Dict[str, Optional[FieldCoordinates]]

class ExtractionResult(BaseModel):
    success: bool
    data: Dict[str, str]
    message: str
    debug_images: List[str] = []

# Utilitaires
def load_mapping() -> Dict:
    """Charger les mappings depuis le fichier JSON"""
    try:
        with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception as e:
        logging.error(f"Erreur lors du chargement des mappings: {e}")
        return {}

def save_mapping(mappings: Dict):
    """Sauvegarder les mappings dans le fichier JSON"""
    try:
        with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
            json.dump(mappings, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logging.error(f"Erreur lors de la sauvegarde des mappings: {e}")
        return False

def safe_crop_bounds(left: float, top: float, width: float, height: float, img_width: int, img_height: int):
    """Calculer les limites de crop sécurisées"""
    left = max(0, min(int(left), img_width - 1))
    top = max(0, min(int(top), img_height - 1))
    right = max(left + 1, min(int(left + width), img_width))
    bottom = max(top + 1, min(int(top + height), img_height))
    
    if right <= left:
        right = left + 1
    if bottom <= top:
        bottom = top + 1
        
    return left, top, right, bottom

def preprocess_image_cv(img: Image.Image) -> Image.Image:
    """Retourner l'image originale pour PaddleOCR (pas de préprocessing nécessaire)"""
    return img

def image_to_base64(img: Image.Image) -> str:
    """Convertir une image PIL en base64"""
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    img_str = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

def extract_text_with_paddleocr(img: Image.Image) -> str:
    """Extraire le texte d'une image avec PaddleOCR"""
    try:
        # Convertir PIL Image en numpy array
        img_array = np.array(img)
        
        # Utiliser PaddleOCR pour extraire le texte
        result = ocr.ocr(img_array, cls=False)
        
        # Extraire le texte de tous les résultats
        texts = []
        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2:
                    text = line[1][0]  # Le texte est dans le deuxième élément
                    confidence = line[1][1]  # La confiance est dans le troisième élément
                    texts.append(text)
        
        return ' '.join(texts).strip()
    except Exception as e:
        logging.error(f"Erreur lors de l'extraction OCR: {e}")
        return ""

def process_pdf_to_image(file_content: bytes) -> Image.Image:
    """Convertir un PDF en image en utilisant PyMuPDF"""
    try:
        doc = fitz.open(stream=file_content, filetype="pdf")
        page = doc[0]
        
        # Récupérer la matrice de transformation standard pour PaddleOCR
        mat = fitz.Matrix(1.0, 1.0)  # Résolution standard pour PaddleOCR
        pix = page.get_pixmap(matrix=mat)
        
        # Convertir en PIL Image
        img_data = pix.tobytes("png")
        img = Image.open(BytesIO(img_data))
        
        doc.close()
        return img
    except Exception as e:
        logging.error(f"Erreur lors de la conversion PDF: {e}")
        raise e

# Routes API
@app.get("/")
async def root():
    return {"message": "Invoice Extractor API"}

@app.get("/mappings")
async def get_mappings():
    """Récupérer tous les mappings"""
    mappings = load_mapping()
    return {"mappings": mappings}

@app.get("/mappings/{emetteur}")
async def get_mapping(emetteur: str):
    """Récupérer le mapping pour un émetteur spécifique"""
    mappings = load_mapping()
    if emetteur not in mappings:
        raise HTTPException(status_code=404, detail="Emetteur non trouvé")
    return {"emetteur": emetteur, "mapping": mappings[emetteur]}

@app.post("/mappings")
async def save_emetteur_mapping(mapping: EmetteurMapping):
    """Sauvegarder le mapping pour un émetteur"""
    mappings = load_mapping()
    
    # Convertir le mapping en format attendu
    field_map = {}
    for field, coords in mapping.field_map.items():
        if coords:
            field_map[field] = {
                'left': coords.left,
                'top': coords.top,
                'width': coords.width,
                'height': coords.height
            }
        else:
            field_map[field] = None
    
    mappings[mapping.emetteur] = {'field_map': field_map}
    
    if save_mapping(mappings):
        return {"message": f"Mapping sauvegardé pour {mapping.emetteur}"}
    else:
        raise HTTPException(status_code=500, detail="Erreur lors de la sauvegarde")

@app.post("/upload-for-dataprep")
async def upload_for_dataprep(file: UploadFile = File(...)):
    """Upload d'un fichier pour DataPrep et retour de l'image en base64"""
    try:
        # Lire le contenu du fichier
        file_content = await file.read()
        
        # Traiter selon le type de fichier
        if file.filename.lower().endswith('.pdf'):
            img = process_pdf_to_image(file_content)
            processed_img = preprocess_image_cv(img)
            
            return {
                "success": True,
                "image": image_to_base64(processed_img),
                "width": processed_img.width,
                "height": processed_img.height
            }
        
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
            processed_img = preprocess_image_cv(img)
            
            return {
                "success": True,
                "image": image_to_base64(processed_img),
                "width": processed_img.width,
                "height": processed_img.height
            }
        
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")
            
    except Exception as e:
        logging.error(f"Erreur lors de l'upload: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement: {str(e)}")

@app.post("/detect-ocr-boxes")
async def detect_ocr_boxes(file: UploadFile = File(...)):
    """Détecter automatiquement les boîtes OCR dans une image"""
    try:
        # Lire le contenu du fichier
        file_content = await file.read()
        
        # Traiter selon le type de fichier
        if file.filename.lower().endswith('.pdf'):
            img = process_pdf_to_image(file_content)
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")
        
        # Détecter les boîtes OCR
        ocr_boxes = detect_ocr_boxes_from_image(img)
        
        return {
            "success": True,
            "boxes": ocr_boxes,
            "width": img.width,
            "height": img.height
        }
        
    except Exception as e:
        logging.error(f"Erreur lors de la détection OCR: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la détection OCR: {str(e)}")

def detect_ocr_boxes_from_image(img: Image.Image) -> List[Dict]:
    """Détecter les boîtes OCR dans une image"""
    try:
        # Convertir PIL Image en numpy array
        img_array = np.array(img)
        
        # Utiliser PaddleOCR pour détecter les boîtes
        result = ocr.ocr(img_array, cls=False)
        
        boxes = []
        if result and result[0]:
            for i, line in enumerate(result[0]):
                if line and len(line) >= 2:
                    coords = line[0]  # Coordonnées de la boîte
                    text_info = line[1]
                    
                    if isinstance(text_info, tuple) and len(text_info) >= 2:
                        text = text_info[0]
                        confidence = text_info[1]
                        
                        # Filtrer pour les caractères latins et confiance élevée
                        if confidence >= 0.5 and text.strip():
                            # Convertir les coordonnées en format standard
                            left = min(coord[0] for coord in coords)
                            top = min(coord[1] for coord in coords)
                            right = max(coord[0] for coord in coords)
                            bottom = max(coord[1] for coord in coords)
                            width = right - left
                            height = bottom - top
                            
                            boxes.append({
                                'id': i,
                                'coords': {
                                    'left': left,
                                    'top': top,
                                    'width': width,
                                    'height': height
                                },
                                'text': text.strip(),
                                'confidence': confidence
                            })
        
        return boxes
        
    except Exception as e:
        logging.error(f"Erreur lors de la détection des boîtes OCR: {e}")
        return []

# Helper: Find closest OCR box to a target rectangle

def find_closest_ocr_box(target_rect, ocr_boxes):
    # target_rect: dict with left, top, width, height
    # ocr_boxes: list of (box, text, confidence)
    tx = target_rect['left'] + target_rect['width'] / 2
    ty = target_rect['top'] + target_rect['height'] / 2
    best_box = None
    best_dist = float('inf')
    for box in ocr_boxes:
        coords = box[0]  # 4 points
        # Compute center of OCR box
        bx = (coords[0][0] + coords[2][0]) / 2
        by = (coords[0][1] + coords[2][1]) / 2
        dist = hypot(tx - bx, ty - by)
        if dist < best_dist:
            best_dist = dist
            best_box = box
    return best_box

@app.post("/extract-data")
async def extract_data(
    emetteur: str = Form(...),
    file: UploadFile = File(...)
):
    """Extraire les données d'un PDF selon les mappings de l'émetteur (smart bounding box matching)"""
    try:
        # Vérifier si l'émetteur existe
        mappings = load_mapping()
        if emetteur not in mappings:
            raise HTTPException(status_code=404, detail=f"Emetteur '{emetteur}' non trouvé")
        
        field_map = mappings[emetteur]['field_map']
        
        # Lire et traiter le fichier
        file_content = await file.read()
        
        if file.filename.lower().endswith('.pdf'):
            img = process_pdf_to_image(file_content)
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")
        
        # Run OCR on the whole image
        img_array = np.array(img)
        ocr_result = ocr.ocr(img_array, cls=False)
        ocr_boxes = ocr_result[0] if ocr_result and len(ocr_result) > 0 else []
        
        # For each field, find the closest OCR box
        extracted_data = {}
        debug_images = []
        for field, coords in field_map.items():
            if coords is None:
                extracted_data[field] = ""
                continue
            best_box = find_closest_ocr_box(coords, ocr_boxes)
            if best_box and len(best_box) >= 2:
                text = best_box[1][0]
                extracted_data[field] = text
            else:
                extracted_data[field] = ""
        extracted_data['emetteur'] = emetteur
        logging.info(f'Données extraites pour {emetteur}: {extracted_data}')
        return ExtractionResult(
            success=True,
            data=extracted_data,
            message="Extraction réussie (smart bounding box)",
            debug_images=[]
        )
    except Exception as e:
        logging.error(f"Erreur lors de l'extraction: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'extraction: {str(e)}")

@app.post("/ocr-preview")
async def ocr_preview(
    left: float = Form(...),
    top: float = Form(...),
    width: float = Form(...),
    height: float = Form(...),
    image_data: str = Form(...)
):
    """Prévisualiser l'OCR pour une zone spécifique"""
    try:
        # Décoder l'image base64
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        img_bytes = base64.b64decode(image_data)
        img = Image.open(BytesIO(img_bytes))
        
        # Cropper la zone spécifiée
        img_w, img_h = img.size
        left_safe, top_safe, right_safe, bottom_safe = safe_crop_bounds(
            left, top, width, height, img_w, img_h
        )
        crop_box = (left_safe, top_safe, right_safe, bottom_safe)
        crop_img = img.crop(crop_box)
        
        # Préprocesser et faire l'OCR avec PaddleOCR
        processed_crop = preprocess_image_cv(crop_img)
        text = extract_text_with_paddleocr(processed_crop)
        
        return {
            "success": True,
            "text": text or "[Aucun texte trouvé]",
            "crop_image": image_to_base64(processed_crop)
        }
        
    except Exception as e:
        logging.error(f"Erreur lors de la prévisualisation OCR: {e}")
        return {
            "success": False,
            "text": f"[Erreur: {str(e)}]",
            "crop_image": None
        }

@app.delete("/mappings/{emetteur}")
async def delete_mapping(emetteur: str):
    """Supprimer un mapping d'émetteur"""
    mappings = load_mapping()
    if emetteur not in mappings:
        raise HTTPException(status_code=404, detail="Emetteur non trouvé")
    
    del mappings[emetteur]
    if save_mapping(mappings):
        return {"message": f"Mapping supprimé pour {emetteur}"}
    else:
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)