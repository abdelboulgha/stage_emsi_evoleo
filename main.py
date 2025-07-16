from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
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
    use_doc_orientation_classify=False,  # Handle document-level rotation
    use_doc_unwarping=False,  # Correct perspective distortion
    use_textline_orientation=False,  # Improve line-level orientation
    precision="fp16",
    enable_mkldnn=True,
    text_rec_score_thresh=0.5
  
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
    """Extraire le texte d'une image avec PaddleOCR (nouveau format v3+)"""
    try:
        img_array = np.array(img)
        result = ocr.predict(img_array)
        texts = []
        for res in result:
            rec_texts = res.get('rec_texts', [])
            texts.extend([t for t in rec_texts if t])
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

def process_pdf_to_images(file_content: bytes) -> List[Image.Image]:
    """Convertir un PDF en une liste d'images (une par page) en utilisant PyMuPDF"""
    try:
        doc = fitz.open(stream=file_content, filetype="pdf")
        images = []
        for page_num in range(doc.page_count):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(1.0, 1.0))
            img_data = pix.tobytes("png")
            img = Image.open(BytesIO(img_data))
            images.append(img)
        doc.close()
        return images
    except Exception as e:
        logging.error(f"Erreur lors de la conversion PDF en images: {e}")
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
async def save_field_mapping(mapping: FieldMapping):
    """Sauvegarder un mapping sans exiger d'emetteur explicite"""
    mappings = load_mapping()
    import hashlib
    # Convert all FieldCoordinates to dicts for hashing and saving
    field_map_dict = {
        k: v.dict() if v else None
        for k, v in mapping.field_map.items()
    }
    field_map_json = json.dumps(field_map_dict, sort_keys=True)
    mapping_key = hashlib.md5(field_map_json.encode()).hexdigest()[:8]
    mappings[mapping_key] = {'field_map': field_map_dict}
    if save_mapping(mappings):
        return {"message": f"Mapping sauvegardé (clé: {mapping_key})"}
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
            images = process_pdf_to_images(file_content)
            # Always return both the first image and the list for compatibility
            return {
                "success": True,
                "image": image_to_base64(images[0]) if images else None,
                "width": images[0].width if images else None,
                "height": images[0].height if images else None,
                "images": [image_to_base64(img) for img in images],
                "widths": [img.width for img in images],
                "heights": [img.height for img in images]
            }
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
            processed_img = preprocess_image_cv(img)
            return {
                "success": True,
                "image": image_to_base64(processed_img),
                "width": processed_img.width,
                "height": processed_img.height,
                "images": [image_to_base64(processed_img)],
                "widths": [processed_img.width],
                "heights": [processed_img.height]
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
    """Détecter les boîtes OCR dans une image (nouveau format v3+)"""
    try:
        img_array = np.array(img)
        result = ocr.predict(img_array)
        boxes = []
        for res in result:
            rec_polys = res.get('rec_polys', [])
            rec_texts = res.get('rec_texts', [])
            rec_scores = res.get('rec_scores', [])
            for i, (poly, text, score) in enumerate(zip(rec_polys, rec_texts, rec_scores)):
                if score is None or score < 0.93 or not text.strip():
                    continue
                # Convert all coordinates and score to Python float
                x_coords = [float(pt[0]) for pt in poly]
                y_coords = [float(pt[1]) for pt in poly]
                left = float(min(x_coords))
                top = float(min(y_coords))
                width = float(max(x_coords) - left)
                height = float(max(y_coords) - top)
                boxes.append({
                    'id': int(i),
                    'coords': {
                        'left': left,
                        'top': top,
                        'width': width,
                        'height': height
                    },
                    'text': str(text).strip(),
                    'confidence': float(score)
                })
        return boxes
    except Exception as e:
        logging.error(f"Erreur lors de la détection des boîtes OCR: {e}")
        return []

@app.post("/extract-data")
async def extract_data(
    file: UploadFile = File(...)
):
    """Extraire les données d'un PDF en cherchant pour chaque champ le mapping dont la boîte est la plus proche d'une boîte OCR détectée."""
    try:
        mappings = load_mapping()
        file_content = await file.read()
        if file.filename.lower().endswith('.pdf'):
            img = process_pdf_to_image(file_content)
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")

        img_array = np.array(img)
        result = ocr.predict(img_array)
        detected_boxes = []
        for res in result:
            rec_polys = res.get('rec_polys', [])
            rec_texts = res.get('rec_texts', [])
            rec_scores = res.get('rec_scores', [])
            for poly, text, score in zip(rec_polys, rec_texts, rec_scores):
                if score is None or not text.strip():
                    continue
                x_coords = [pt[0] for pt in poly]
                y_coords = [pt[1] for pt in poly]
                left = min(x_coords)
                top = min(y_coords)
                width = max(x_coords) - left
                height = max(y_coords) - top
                detected_boxes.append({
                    'left': left,
                    'top': top,
                    'width': width,
                    'height': height,
                    'text': text
                })

        if not mappings:
            raise HTTPException(status_code=404, detail="Aucun mapping disponible")
        field_names = list(next(iter(mappings.values()))['field_map'].keys())

        def box_center(box):
            return (
                box['left'] + box['width'] / 2,
                box['top'] + box['height'] / 2
            )

        def box_distance(box1, box2):
            c1 = box_center(box1)
            c2 = box_center(box2)
            return hypot(c1[0] - c2[0], c1[1] - c2[1])

        extracted_data = {}
        mapping_keys_for_fields = {}
        for field in field_names:
            best_key = None
            best_score = float('inf')
            best_box = None
            for key, mapping in mappings.items():
                coords = mapping['field_map'].get(field)
                if coords is None:
                    continue
                min_dist = float('inf')
                closest_box = None
                for det_box in detected_boxes:
                    dist = box_distance(coords, det_box)
                    if dist < min_dist:
                        min_dist = dist
                        closest_box = det_box
                if min_dist < best_score:
                    best_score = min_dist
                    best_key = key
                    best_box = closest_box
            if best_box:
                extracted_data[field] = best_box['text']
                mapping_keys_for_fields[field] = best_key
            else:
                extracted_data[field] = ""
                mapping_keys_for_fields[field] = None
        extracted_data['mapping_keys'] = json.dumps(mapping_keys_for_fields)
        logging.info(f'Données extraites par champ: {extracted_data}')
        return ExtractionResult(
            success=True,
            data=extracted_data,
            message=f"Extraction réussie (par champ)",
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