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
import pytesseract
import numpy as np
import cv2
from pdf2image import convert_from_bytes
import base64
from io import BytesIO
import tempfile
import shutil
import fitz

# Configuration
DPI = 300
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

def detect_pdf_type_and_dpi(file_bytes: bytes) -> tuple:
    """Détecter si le PDF est numérique ou scanné"""
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        page = doc[0]
        text = page.get_text('text').strip()
        doc.close()
        if text:
            return True, 300  # PDF numérique
        else:
            return False, 400  # PDF scanné
    except Exception:
        return False, 400

def preprocess_image_cv(img: Image.Image) -> Image.Image:
    """Préprocesseur d'image avec OpenCV pour améliorer l'OCR"""
    img_cv = np.array(img.convert('L'))
    h, w = img_cv.shape
    scale = 2
    img_cv = cv2.resize(img_cv, (w * scale, h * scale), interpolation=cv2.INTER_LINEAR)
    img_cv = cv2.bilateralFilter(img_cv, 11, 17, 17)
    img_cv = cv2.adaptiveThreshold(img_cv, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                   cv2.THRESH_BINARY, 15, 10)
    return Image.fromarray(img_cv)

def image_to_base64(img: Image.Image) -> str:
    """Convertir une image PIL en base64"""
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    img_str = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

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
            is_digital, dpi = detect_pdf_type_and_dpi(file_content)
            pages = convert_from_bytes(file_content, dpi=dpi)
            img = pages[0]
            processed_img = preprocess_image_cv(img)
            
            return {
                "success": True,
                "image": image_to_base64(processed_img),
                "is_digital": is_digital,
                "dpi": dpi,
                "width": processed_img.width,
                "height": processed_img.height
            }
        
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
            processed_img = preprocess_image_cv(img)
            
            return {
                "success": True,
                "image": image_to_base64(processed_img),
                "is_digital": False,
                "dpi": 400,
                "width": processed_img.width,
                "height": processed_img.height
            }
        
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")
            
    except Exception as e:
        logging.error(f"Erreur lors de l'upload: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement: {str(e)}")

@app.post("/extract-data")
async def extract_data(
    emetteur: str = Form(...),
    file: UploadFile = File(...)
):
    """Extraire les données d'un PDF selon les mappings de l'émetteur"""
    try:
        # Vérifier si l'émetteur existe
        mappings = load_mapping()
        if emetteur not in mappings:
            raise HTTPException(status_code=404, detail=f"Emetteur '{emetteur}' non trouvé")
        
        field_map = mappings[emetteur]['field_map']
        
        # Lire et traiter le fichier
        file_content = await file.read()
        
        if file.filename.lower().endswith('.pdf'):
            is_digital, dpi = detect_pdf_type_and_dpi(file_content)
            pages = convert_from_bytes(file_content, dpi=dpi)
            img = pages[0]
            processed_img = preprocess_image_cv(img)
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
            processed_img = preprocess_image_cv(img)
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")
        
        # Extraire les données
        extracted_data = {}
        debug_images = []
        img_w, img_h = processed_img.size
        
        for field, coords in field_map.items():
            if coords is None:
                extracted_data[field] = ""
                continue
                
            left = coords['left']
            top = coords['top']
            width = coords['width']
            height = coords['height']
            
            try:
                left_safe, top_safe, right_safe, bottom_safe = safe_crop_bounds(
                    left, top, width, height, img_w, img_h
                )
                crop_box = (left_safe, top_safe, right_safe, bottom_safe)
                crop_img = processed_img.crop(crop_box)
                
                # OCR sur la zone cropped
                text = pytesseract.image_to_string(crop_img).strip()
                extracted_data[field] = text
                
                # Sauvegarder l'image de debug
                debug_path = os.path.join(DEBUG_DIR, f"{field}_debug.png")
                crop_img.save(debug_path)
                debug_images.append(f"{field}_debug.png")
                
            except Exception as e:
                logging.error(f"Erreur lors de l'extraction du champ '{field}': {e}")
                extracted_data[field] = f"[Erreur: {str(e)}]"
        
        # Ajouter l'émetteur aux données extraites
        extracted_data['emetteur'] = emetteur
        
        # Logger les résultats
        logging.info(f'Données extraites pour {emetteur}: {extracted_data}')
        
        return ExtractionResult(
            success=True,
            data=extracted_data,
            message="Extraction réussie",
            debug_images=debug_images
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
        
        # Préprocesser et faire l'OCR
        processed_crop = preprocess_image_cv(crop_img)
        text = pytesseract.image_to_string(processed_crop).strip()
        
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