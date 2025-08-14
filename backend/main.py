# Standard library imports
import json
import logging
import os
import re
from datetime import date, datetime
from io import BytesIO
from typing import Any, Dict, List, Optional, Union
import math
import dateparser

# Third-party imports
import base64
import dbf
import numpy as np
import pymupdf as fitz
from fastapi import (
    Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from paddleocr import PaddleOCR
from PIL import Image, ImageEnhance, ImageOps
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv

# Database and ORM imports
from database.config import get_async_db, init_database
from database.models import Base
from services.template_service import TemplateService
from services.facture_service import FactureService
from services.ai_extraction_service import AIExtractionService

# Authentication modules
from auth.auth_routes import router as auth_router
from auth.auth_jwt import require_comptable_or_admin
from auth.auth_config import CORS_ORIGINS, CORS_ALLOW_CREDENTIALS

# Load environment variables
load_dotenv()

# =======================
# FastAPI Configuration
# =======================
app = FastAPI(title="Invoice Extractor API", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    filename=r'C:\Users\pc\Desktop\stage_emsi_2025\backend\invoice_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(message)s',
    force=True
)

# Initialize database
init_database()

# Include authentication routes
app.include_router(auth_router)

# Initialize PaddleOCR with specified parameters
ocr = PaddleOCR(
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    text_det_input_shape=[3, 1440, 1440],
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="PP-OCRv5_mobile_rec",
    precision="fp16",
    enable_mkldnn=True,
    text_det_unclip_ratio=1.3,
    text_rec_score_thresh=0.5
)

# Initialiser le service AI
ai_extraction_service = AIExtractionService()

# =======================
# Pydantic Models
# =======================
class FieldCoordinates(BaseModel):
    """Represents coordinates and dimensions of a field on a document."""
    left: float
    top: float
    width: float
    height: float
    manual: Optional[bool] = False


class FieldMapping(BaseModel):
    """Mapping of field names to their coordinates."""
    field_map: Dict[str, Optional[FieldCoordinates]]


class ExtractionResult(BaseModel):
    """Result of a document extraction process."""
    success: bool
    data: Dict[str, str]
    message: str


class SaveMappingRequest(BaseModel):
    template_id: str = "default"
    field_map: Dict[str, Optional[FieldCoordinates]]


class InvoiceUpdate(BaseModel):
    """Model for updating invoice data"""
    fournisseur: Optional[str] = None
    numFacture: Optional[str] = None
    dateFacturation: Optional[str] = None
    tauxTVA: Optional[float] = None
    montantHT: Optional[float] = None
    montantTVA: Optional[float] = None
    montantTTC: Optional[float] = None


class InvoiceCreate(BaseModel):
    """Model for creating invoice data"""
    fournisseur: str
    numFacture: str
    dateFacturation: str  # Changed from date to str for flexibility
    tauxTVA: float  # Changed from tva to tauxTVA
    montantHT: float
    montantTVA: float  # Added montantTVA
    montantTTC: float


class InvoiceResponse(BaseModel):
    """Model for invoice response"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


# =======================
# Utility Functions
# =======================
def image_to_base64(img: Image.Image) -> str:
    """Convertir une image PIL en base64"""
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    img_str = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"


# Add a single variable for PDF rendering scale
PDF_RENDER_SCALE = 2  # Change this value to affect all PDF image renderings

# Database connection function (for backward compatibility)
def get_connection():
    """
    Get a database connection from the connection pool.
    
    Returns:
        A database connection object
        
    Raises:
        Exception: If the connection pool is not available
        Error: If there's an error getting a connection
    """
    # For now, we'll use the ORM session, but this function is kept for compatibility
    # with the existing OCR extraction code
    try:
        # Import here to avoid circular imports
        from database.config import get_async_db
        from auth.auth_database import get_connection as get_mysql_connection
        return get_mysql_connection()
    except ImportError:
        # Fallback to original MySQL connection if ORM not available
        from auth.auth_database import get_connection as get_mysql_connection
        return get_mysql_connection()

def process_pdf_to_image(file_content: bytes) -> Image.Image:
    """Convertir un PDF en image en utilisant PyMuPDF"""
    try:
        doc = fitz.open(stream=file_content, filetype="pdf")
        page = doc[0]
        
        # Utiliser la variable PDF_RENDER_SCALE
        mat = fitz.Matrix(PDF_RENDER_SCALE, PDF_RENDER_SCALE)
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
            pix = page.get_pixmap(matrix=fitz.Matrix(PDF_RENDER_SCALE, PDF_RENDER_SCALE))
            img_data = pix.tobytes("png")
            img = Image.open(BytesIO(img_data))
            images.append(img)
        doc.close()
        return images
    except Exception as e:
        logging.error(f"Erreur lors de la conversion PDF en images: {e}")
        raise e


# =======================
# API Routes
# =======================
@app.post("/upload-for-dataprep")
async def upload_for_dataprep(
    file: UploadFile = File(...),
    page_index: int = Form(0),  
    current_user = Depends(require_comptable_or_admin)
):
    """Upload d'un fichier pour DataPrep, retour de l'image en base64, des boîtes OCR détectées, et l'image unwarped si disponible pour la page spécifiée"""
    try:
        file_content = await file.read()
       
        if file.filename.lower().endswith('.pdf'):
            # Open PDF with PyMuPDF
            pdf_document = fitz.open(stream=file_content, filetype="pdf")
           
            if page_index >= pdf_document.page_count:
                pdf_document.close()
                raise HTTPException(status_code=400, detail=f"Index de page invalide: {page_index}")
            if page_index < 0:
                pdf_document.close()
                raise HTTPException(status_code=400, detail="Index de page doit être positif")
            
            # Process only the specified page
            page = pdf_document.load_page(page_index)
          
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # Increase resolution
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            pdf_document.close()
            images = [img]
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            if page_index != 0:
                raise HTTPException(status_code=400, detail="L'index de page n'est valide que pour les fichiers PDF")
            img = Image.open(BytesIO(file_content)).convert('RGB')
            images = [img]
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")

        # Run OCR on the selected image
        img_array = np.array(images[0])
        result = ocr.predict(img_array)
       
        boxes = []
        unwarped_base64 = None
        unwarped_width = None
        unwarped_height = None
        for res in result:
            rec_polys = res.get('rec_polys', [])
            rec_texts = res.get('rec_texts', [])
            rec_scores = res.get('rec_scores', [])
            doc_pre_res = res.get('doc_preprocessor_res', {})
            original_points = doc_pre_res.get('original_points') if isinstance(doc_pre_res, dict) else None
            doc_img = None
            for key in ['doc_img', 'output_img', 'rot_img']:
                if key in doc_pre_res:
                    doc_img = doc_pre_res[key]
                    break
            if doc_img is not None and unwarped_base64 is None:
                pil_img = Image.fromarray(doc_img)
                buffer = BytesIO()
                pil_img.save(buffer, format='PNG')
                unwarped_base64 = f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"
                unwarped_width = pil_img.width
                unwarped_height = pil_img.height
            for i, (poly, text, score) in enumerate(zip(rec_polys, rec_texts, rec_scores)):
                if score is None or not text.strip():
                    continue
                mapped_poly = original_points[i] if original_points and i < len(original_points) else poly
                x_coords = [float(pt[0]) for pt in mapped_poly]
                y_coords = [float(pt[1]) for pt in mapped_poly]
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
        response = {
            "success": True,
            "image": image_to_base64(images[0]) if images else None,
            "width": images[0].width if images else None,
            "height": images[0].height if images else None,
            "boxes": boxes,
            "box_count": len(boxes),
            "unwarped_image": unwarped_base64,
            "unwarped_width": unwarped_width,
            "unwarped_height": unwarped_height,
            "page_index": page_index
        }
      
        return response
    except Exception as e:
        logging.error(f"Erreur lors de l'upload: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement: {str(e)}")


@app.post("/pdf-page-previews")
async def pdf_page_previews(
    file: UploadFile = File(...),
    current_user = Depends(require_comptable_or_admin)
):
    """Génère des aperçus en base64 pour toutes les pages d'un PDF"""
    try:
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Le fichier doit être un PDF")
        
        file_content = await file.read()
        pdf_document = fitz.open(stream=file_content, filetype="pdf")
    
        pages = []

        for page_num in range(pdf_document.page_count):
            page = pdf_document.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))  # Lower resolution for previews
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Convert to base64
            buffer = BytesIO()
            img.save(buffer, format='PNG')
            img_str = base64.b64encode(buffer.getvalue()).decode()
            base64_img = f"data:image/png;base64,{img_str}"
            
            pages.append({
                "page_number": page_num,
                "image": base64_img,
                "width": img.width,
                "height": img.height
            })
        
        pdf_document.close()
        
        return {
            "success": True,
            "total_pages": len(pages),
            "pages": pages
        }
        
    except Exception as e:
        logging.error(f"Erreur lors de la génération des aperçus: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération des aperçus: {str(e)}")


@app.post("/save-mapping")
async def save_mapping(
    request: SaveMappingRequest,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Save field mappings to the database using ORM"""
    try:
        template_service = TemplateService(db)
        success = await template_service.save_mapping(
            template_name=request.template_id,  # template_id is actually the template name
            field_map=request.field_map, 
            current_user_id=current_user["id"]
        )
        
        if success:
            return {"success": True, "message": "Mapping saved successfully"}
        else:
            return {"success": False, "message": "Failed to save mapping"}
            
    except Exception as e:
        logging.error(f"Error saving mapping: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving mapping: {str(e)}")


@app.get("/load-mapping/{template_id}")
async def load_mapping(
    template_id: str,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Load field mappings from the database using ORM"""
    try:
        template_service = TemplateService(db)
        result = await template_service.load_mapping(template_id)
        return result
        
    except Exception as e:
        logging.error(f"Error loading mapping: {e}")
        raise HTTPException(status_code=500, detail=f"Error loading mapping: {str(e)}")


@app.post("/mappings")
async def save_field_mapping(
    request: SaveMappingRequest,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """
    Save field mappings for a template using ORM
    
    Args:
        request: SaveMappingRequest containing template_id and field_map
        current_user: Authenticated user from JWT token
        db: Database session
        
    Returns:
        JSON response with success/error status
    """
    try:
        template_service = TemplateService(db)
        
        # Convert Pydantic model to dict and handle FieldCoordinates objects
        field_map = {}
        for field_name, coords in request.field_map.items():
            if coords is not None:
                if isinstance(coords, dict):
                    field_map[field_name] = coords
                else:
                    field_map[field_name] = coords.dict()
        
        print(f"Saving mapping for template: {request.template_id}")
        logging.debug(f"Field map: {field_map}")
        
        success = await template_service.save_mapping(
            template_name=request.template_id,  # template_id is actually the template name
            field_map=field_map,
            current_user_id=current_user['id']
        )
        
        if success:
            return {
                "success": True,
                "message": "Mapping saved successfully",
                "template_id": request.template_id,
                "fields_saved": list(field_map.keys())
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to save mapping")
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        error_msg = f"Unexpected error saving mapping: {str(e)}"
        logging.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@app.get("/mappings")
async def get_mappings(
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Get all templates and mappings for the current user using ORM"""
    try:
        template_service = TemplateService(db)
        result = await template_service.get_all_templates(current_user["id"])
        return result
        
    except Exception as e:
        logging.error(f"Error getting mappings: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting mappings: {str(e)}")


@app.delete("/mappings/{template_id}")
async def delete_mapping(
    template_id: str,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Delete a template and all its mappings using ORM"""
    try:
        template_service = TemplateService(db)
        result = await template_service.delete_template(template_id, current_user["id"])
        return result
        
    except Exception as e:
        logging.error(f"Error deleting mapping: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting mapping: {str(e)}")


@app.post("/create-facture")
async def create_facture(
    facture_data: dict,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Create a new invoice using ORM"""
    try:
        facture_service = FactureService(db)
        result = await facture_service.create_facture(facture_data, current_user["id"])
        return result
        
    except Exception as e:
        logging.error(f"Error creating invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating invoice: {str(e)}")


@app.get("/factures")
async def get_factures(
    skip: int = 0,
    limit: int = 100,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Get invoices for the current user using ORM"""
    try:
        facture_service = FactureService(db)
        result = await facture_service.get_factures(current_user["id"], skip, limit)
        return result
        
    except Exception as e:
        logging.error(f"Error getting invoices: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting invoices: {str(e)}")


@app.put("/factures/{facture_id}")
async def update_facture(
    facture_id: int,
    invoice_update: InvoiceUpdate,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Update an invoice using ORM"""
    try:
        facture_service = FactureService(db)
        update_data = invoice_update.dict(exclude_unset=True)
        result = await facture_service.update_facture(facture_id, update_data, current_user["id"])
        return result
        
    except Exception as e:
        logging.error(f"Error updating invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating invoice: {str(e)}")


@app.delete("/factures/{facture_id}")
async def delete_facture(
    facture_id: int,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Delete an invoice using ORM"""
    try:
        facture_service = FactureService(db)
        result = await facture_service.delete_facture(facture_id, current_user["id"])
        return result
        
    except Exception as e:
        logging.error(f"Error deleting invoice: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting invoice: {str(e)}")


# =======================
# OCR Extraction Functions (keeping existing logic)
# =======================

@app.post("/upload-basic")
async def upload_basic(file: UploadFile = File(...)):
    """Upload d'un fichier pour preview rapide (pas d'OCR, juste image(s) base64, width, height)"""
    try:
        file_content = await file.read()
        if file.filename.lower().endswith('.pdf'):
            images = process_pdf_to_images(file_content)
            if not images:
                return {"success": False, "message": "No images extracted from PDF."}
            return {
                "success": True,
                "image": image_to_base64(images[0]),
                "width": images[0].width,
                "height": images[0].height,
                "images": [image_to_base64(img) for img in images],
                "widths": [img.width for img in images],
                "heights": [img.height for img in images]
            }
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
            # Resize image to match PDF dimensions (1191x1684)
            target_size = (1191, 1684)
            if img.size != target_size:
                img = img.resize(target_size, Image.Resampling.LANCZOS)
            return {
                "success": True,
                "image": image_to_base64(img),
                "width": img.width,
                "height": img.height,
                "images": [image_to_base64(img)],
                "widths": [img.width],
                "heights": [img.height]
            }
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")
    except Exception as e:
        logging.error(f"Erreur lors de l'upload basic: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement: {str(e)}")

# ... (keep all your existing OCR extraction functions here)
# These functions don't need database access, so they can remain as is


@app.post("/ocr-preview")
async def ocr_preview(
    file: UploadFile = File(...),
    template_id: str = Form(None),
):
    MIN_CONFIDENCE = 0.75
    HORIZONTAL_VERTICAL_TOL = 10        # horizontal search: vertical tolerance (px)
    HORIZONTAL_MAX_DIST = 600       # horizontal search: max distance to right (px)
    VERTICAL_MAX_Y = 100              # vertical search: max distance under keyword (px)
    VERTICAL_HORZ_TOL = 50            # vertical search: horizontal tolerance (px)

    try:
        # --- Read file to PIL image ---
        file_content = await file.read()
        if file.filename and file.filename.lower().endswith('.pdf'):
            images = process_pdf_to_images(file_content)
            img = images[0] if images else None
        elif file.filename and file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")

        if img is None:
            raise HTTPException(status_code=400, detail="No image available for extraction.")

        img_array = np.array(img)
        result = ocr.predict(img_array)

        # --- Build detected_boxes with consistent keys ---
        detected_boxes = []
        for res in result:
            rec_polys = res.get('rec_polys', [])
            rec_texts = res.get('rec_texts', [])
            rec_scores = res.get('rec_scores', [])
            for poly, text, score in zip(rec_polys, rec_texts, rec_scores):
                if score is None or score < MIN_CONFIDENCE or not text or not text.strip():
                    continue
                x_coords = [p[0] for p in poly]
                y_coords = [p[1] for p in poly]
                left = float(min(x_coords))
                right = float(max(x_coords))
                top = float(min(y_coords))
                bottom = float(max(y_coords))
                width = right - left
                height = bottom - top
                detected_boxes.append({
                    'left': left,
                    'top': top,
                    'right': right,
                    'bottom': bottom,
                    'width': width,
                    'height': height,
                    'center_x': (left + right) / 2.0,
                    'center_y': (top + bottom) / 2.0,
                    'text': text.strip(),
                    'score': float(score)
                })

        print(f"Detected {len(detected_boxes)} boxes after filtering (conf >= {MIN_CONFIDENCE})")

        # -------------------------
        # Helpers: number & keyword
        # -------------------------
        def extract_number(text: str):
            """Robust number parser (handles , and . as thousand/decimal separators)."""
            if not text or re.search(r'[A-Za-zÀ-ÿ]', text) and not re.search(r'\d', text):
                # If text contains letters and no digits -> not a number
                pass
            cleaned = re.sub(r'[^\d\-,\.]', '', text)
            if cleaned == '':
                return None
            # If both present, decide which is decimal by last occurrence
            if ',' in cleaned and '.' in cleaned:
                if cleaned.rfind(',') > cleaned.rfind('.'):
                    cleaned = cleaned.replace('.', '').replace(',', '.')
                else:
                    cleaned = cleaned.replace(',', '')
            elif ',' in cleaned:
                parts = cleaned.split(',')
                # If last part length == 2 -> probably decimal
                if len(parts[-1]) == 2:
                    cleaned = cleaned.replace(',', '.')
                else:
                    cleaned = cleaned.replace(',', '')
            # If too many dots, keep last as decimal
            if cleaned.count('.') > 1:
                parts = cleaned.split('.')
                cleaned = ''.join(parts[:-1]) + '.' + parts[-1]
            if cleaned in ('', '-', '.'):
                return None
            # Final digit check
            if not re.fullmatch(r'-?\d+(?:\.\d+)?', cleaned):
                return None
            try:
                return float(cleaned)
            except Exception:
                return None

        def is_valid_ht_keyword(text: str):
            if not text:
                return False
            s = text.upper().strip()
            patterns = [
                r'^SOUS[-\s]*TOTAL\b',
                r'\bTOTAL\s+HT\b',
                r'\bHT\b',
                r'\bHORS\s+TAXES\b',
                r'\bMONTANT\s+(TOTAL\s+)?HT\b',
                r'\bMONTANT\s+(TOTAL\s+)?HORS\s+TAXES\b',
                r'\bTOTAL\s+HORS\s*TAXES\b',
            ]
            return any(re.search(p, s) for p in patterns)

        def is_valid_tva_keyword(text: str):
            if not text:
                return False
            s = text.upper().strip()
            patterns = [
                r'\bTVA\b',
                r'\bT\.?V\.?A\b',
                r'\bMONTANT\s+TVA\b',
                r'\bTAXE\s+SUR\s+LA\s+VALEUR\s+AJOUT',
                r'\bMONTANT\s+TAXE\s+AJOUT',
            ]
            return any(re.search(p, s) for p in patterns)

        def is_total_keyword(text: str):
            if not text:
                return False
            return 'TOTAL' in text.upper()

        # -------------------------
        # Candidate search function
        # -------------------------
        def find_value_for_field(keyword_test_fn, is_tva=False, field_name=""):
            """
            Returns dict with keys: value (float), value_text, value_box, keyword_box, distance, search_type, is_total_keyword
            
            Search Logic:
            1. First, try to find horizontal matches for all keywords, prioritizing those containing 'TOTAL'
            2. If multiple horizontal matches exist, prefer the one with 'TOTAL' in the keyword
            3. Only if no horizontal matches are found for any keyword, try vertical search
            4. In vertical search, still prefer 'TOTAL' keywords
            5. For TVA, ignore candidate boxes containing '%'.
            """
            print(f"\n{'='*40}")
            print(f"Searching for field: {field_name}")
            print(f"Using keyword test function: {keyword_test_fn.__name__}")
            print("-"*40)
            
            keywords = [b for b in detected_boxes if keyword_test_fn(b['text'])]
            
            print(f"Found {len(keywords)} potential keywords:")
            for i, kw in enumerate(keywords, 1):
                print(f"  {i}. '{kw['text']}' (score: {kw['score']:.2f}) at ({kw['center_x']:.1f}, {kw['center_y']:.1f})")
            
            if not keywords:
                print("No matching keywords found!")
                return None

            total_kw = [k for k in keywords if is_total_keyword(k['text'])]
            other_kw = [k for k in keywords if k not in total_kw]

            # Process a set of keywords (list), return best match or None
            def process_keyword_set(klist, search_type='horizontal'):
                candidates = []
                
                for kw in klist:
                    kw_cy = kw['center_y']
                    kw_cx = kw['center_x']
                    
                    if search_type == 'horizontal':
                        # Horizontal search (to the right of keyword)
                        right_boxes = [b for b in detected_boxes if b['center_x'] > kw_cx]
                        right_boxes.sort(key=lambda b: (b['center_x'] - kw_cx))  # Sort by distance to right
                        
                        print(f"\n{'='*80}")
                        print(f"CHECKING HORIZONTAL MATCHES FOR: '{kw['text']}' at ({kw_cx:.1f}, {kw_cy:.1f})")
                        print(f"Searching up to {HORIZONTAL_MAX_DIST}px to the right, vertical tolerance: {HORIZONTAL_VERTICAL_TOL}px")
                        print(f"Found {len(right_boxes)} boxes to the right")
                        print("-"*80)
                        
                        # First pass: Collect all boxes and their status
                        all_boxes_info = []
                        for i, ob in enumerate(right_boxes, 1):
                            dx = ob['center_x'] - kw_cx
                            dy = ob['center_y'] - kw_cy
                            
                            # Debug info for each box being checked
                            debug_info = {
                                'index': i,
                                'text': ob['text'].strip(),
                                'pos': f"({ob['center_x']:.1f}, {ob['center_y']:.1f})",
                                'dx': dx,
                                'dy': dy,
                                'reasons': [],
                                'is_match': False,
                                'value': None
                            }
                            
                            # Check rejection reasons
                            if dx <= 0 or dx > HORIZONTAL_MAX_DIST:
                                debug_info['reasons'].append(f"x-distance {dx:.1f}px out of range (0-{HORIZONTAL_MAX_DIST})")
                            elif abs(dy) > HORIZONTAL_VERTICAL_TOL:
                                debug_info['reasons'].append(f"y-distance {dy:.1f}px exceeds tolerance")
                            elif is_tva and '%' in ob['text']:
                                debug_info['reasons'].append("contains '%' (TVA filter)")
                            else:
                                val = extract_number(ob['text'])
                                if val is not None:
                                    debug_info['is_match'] = True
                                    debug_info['value'] = val
                                    candidate = {
                                        'keyword_box': kw,
                                        'value_box': ob,
                                        'value': val,
                                        'value_text': ob['text'],
                                        'keyword_text': kw['text'],
                                        'distance': dx,
                                        'search_type': search_type,
                                        'is_total_keyword': is_total_keyword(kw['text'])
                                    }
                                    candidates.append(candidate)
                                    debug_info['reasons'].append(f"MATCH - value: {val}")
                                else:
                                    debug_info['reasons'].append("no valid number found")
                            
                            all_boxes_info.append(debug_info)
                        
                        if not candidates:
                            print("\n❌ NO VALID MATCHES FOUND IN HORIZONTAL SEARCH")
                        else:
                            print(f"\n✅ FOUND {len(candidates)} VALID MATCH(ES)")
                    
                    else:  # vertical search
                        kw_bottom = kw['bottom']
                        kw_cx = kw['center_x']
                        kw_cy = kw['center_y']
                        
                        for ob in detected_boxes:
                            if ob is kw:
                                continue
                                
                            # require box to be below keyword
                            y_distance = ob['top'] - kw_bottom
                            if y_distance <= 0 or y_distance > VERTICAL_MAX_Y:
                                continue
                                
                            # horizontal tolerance
                            if abs(ob['center_x'] - kw_cx) > VERTICAL_HORZ_TOL:
                                continue
                                
                            if is_tva and '%' in ob['text']:
                                continue
                                
                            val = extract_number(ob['text'])
                            if val is not None:
                                # Euclidean distance between centers
                                xdiff = ob['center_x'] - kw_cx
                                ydiff = (ob['center_y'] - kw_cy)
                                dist = math.hypot(xdiff, ydiff)
                                
                                candidates.append({
                                    'keyword_box': kw,
                                    'value_box': ob,
                                    'value': val,
                                    'value_text': ob['text'],
                                    'keyword_text': kw['text'],
                                    'distance': dist,
                                    'search_type': 'vertical',
                                    'is_total_keyword': is_total_keyword(kw['text'])
                                })
                
                if not candidates:
                    return None
                    
                # Sort candidates: first by whether they're from a TOTAL keyword, then by distance
                candidates.sort(key=lambda c: (0 if c['is_total_keyword'] else 1, c['distance']))
                return candidates[0]
            # First, try horizontal search for TOTAL keywords
            if total_kw:
                print("\nTrying horizontal search for TOTAL keywords...")
                result = process_keyword_set(total_kw, 'horizontal')
                if result:
                    print(f"Found match from TOTAL keyword: {result['value_text']}")
                    return result
            
            # Then try horizontal search for other keywords
            if other_kw:
                print("\nTrying horizontal search for other keywords...")
                result = process_keyword_set(other_kw, 'horizontal')
                if result:
                    print(f"Found match from other keyword: {result['value_text']}")
                    return result
            
            # If no horizontal matches found, try vertical search as fallback
            print("\nNo horizontal matches found, trying vertical search...")
            
            # First try vertical search with TOTAL keywords
            if total_kw:
                print("Trying vertical search for TOTAL keywords...")
                result = process_keyword_set(total_kw, 'vertical')
                if result:
                    print(f"Found vertical match from TOTAL keyword: {result['value_text']}")
                    return result
            
            # Finally, try vertical search with other keywords
            if other_kw:
                print("Trying vertical search for other keywords...")
                result = process_keyword_set(other_kw, 'vertical')
                if result:
                    print(f"Found vertical match from other keyword: {result['value_text']}")
                    return result
            
            print("No matching values found in any search direction")
            return None

        # -------------------------
        # Extract HT
        # -------------------------
        print("\n" + "="*60)
        print("🔍 SEARCHING FOR HT (HORS TAXES)")
        print("="*60)
        import time
        start_time = time.time()
        ht_match = find_value_for_field(is_valid_ht_keyword, is_tva=False, field_name="HT (Hors Taxes)")
        ht_time = time.time() - start_time
        if not ht_match:
            return {"success": False, "data": {}, "message": "Aucun mot-clé HT trouvé"}
        ht_extracted = ht_match['value']
        print(f"\n✅ SELECTED HT: {ht_extracted} (from '{ht_match['value_text']}', keyword: '{ht_match['keyword_text']}')")
        print(f"⏱️  HT extraction took: {ht_time:.4f} seconds")

        # -------------------------
        # Extract numFacture
        # -------------------------
        print("\n" + "="*60)
        print("🔍 SEARCHING FOR NUMERO FACTURE")
        print("="*60)
        start_time = time.time()
        
        def is_valid_num_facture_keyword(text: str):
            if not text:
                return False
            s = text.upper().strip()
            patterns = [
                r'\bFACTURE\s*[#:]?\s*',
                r'\bNUMERO?\s*[#:]?\s*',
                r'\bREF\s*[#:]?\s*',
                r'\bN°\s*'
            ]
            return any(re.search(p, s) for p in patterns)
        
        num_facture_match = find_value_for_field(is_valid_num_facture_keyword, is_tva=False, field_name="Numéro de facture")
        num_facture_time = time.time() - start_time
        
        if not num_facture_match:
            return {"success": False, "data": {}, "message": "Aucun numéro de facture trouvé"}
            
        num_facture_extracted = num_facture_match['value_text']
        print(f"\n✅ SELECTED NUMERO FACTURE: '{num_facture_extracted}' (keyword: '{num_facture_match['keyword_text']}')")
        print(f"⏱️  Numéro facture extraction took: {num_facture_time:.4f} seconds")

        # -------------------------
        # Extract TVA
        # -------------------------
        print("\n" + "="*60)
        print("🔍 SEARCHING FOR TVA")
        print("="*60)
        start_time = time.time()
        tva_match = find_value_for_field(is_valid_tva_keyword, is_tva=True, field_name="TVA")
        tva_time = time.time() - start_time
        if not tva_match:
            return {"success": False, "data": {}, "message": "Aucun mot-clé TVA trouvé"}
        tva_extracted = tva_match['value']
        print(f"\n✅ SELECTED TVA: {tva_extracted} (from '{tva_match['value_text']}', keyword: '{tva_match['keyword_text']}')")
        print(f"⏱️  TVA extraction took: {tva_time:.4f} seconds")

        # -------------------------
        # TTC and taux TVA
        # -------------------------
        print("\n" + "="*60)
        print("🧮 CALCULATING TTC AND TVA RATE")
        print("="*60)
        
        ttc_extracted = round(ht_extracted + tva_extracted, 2)
        print(f"HT: {ht_extracted:.2f} + TVA: {tva_extracted:.2f} = TTC: {ttc_extracted:.2f}")
        
        if ht_extracted != 0:
            raw_taux = (tva_extracted * 100.0) / ht_extracted
            # Round to nearest integer (0.5 rounds up)
            taux_tva = int(round(raw_taux))
            print(f"Raw TVA rate: {raw_taux:.2f}% -> Rounded to: {taux_tva}%")
        else:
            taux_tva = 0
            print("HT is zero, cannot calculate TVA rate")

        # -------------------------
        # numFacture extraction (left as-is, minimally adapted to detected_boxes)
        # -------------------------
        numfacture_value = None
        numfacture_box = None
        try:
            # Note: This part still uses raw SQL for now since it's complex
            # TODO: Migrate to ORM when possible
            connection = get_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute("SELECT id FROM field_name WHERE name = 'numerofacture'")
            row = cursor.fetchone()
            if row:
                numfacture_field_id = row['id']
                cursor.execute("""
                    SELECT `left`, `top`, `width`, `height`
                    FROM Mappings
                    WHERE template_id = %s AND field_id = %s
                    LIMIT 1
                """, (template_id, numfacture_field_id))
                mapping = cursor.fetchone()
                if mapping:
                    mapped_cx = float(mapping['left']) + float(mapping['width']) / 2
                    mapped_cy = float(mapping['top']) + float(mapping['height']) / 2

                    def is_valid_invoice_number(text):
                        text = text.strip()
                        patterns = [
                            r'(?i)(?:facture|fact|inv|no\.?\s*#?)\s*[\w\-\s/]*\d{2,}',
                            r'\b\d{4,}[\-\s/]?\d+\b',
                            r'\b[A-Z]{2,}[-\s]?\d+[-\s]?\d+\b',
                            r'\b\d{6,}\b'
                        ]
                        return any(re.search(p, text) for p in patterns)

                    def calculate_invoice_score(text):
                        digit_count = len(re.findall(r'\d', text))
                        max_consecutive = max((len(m) for m in re.findall(r'\d+', text)), default=0)
                        pattern_bonus = 2 if re.search(r'(n[°º]|no|num|ref|facture)\s*\d', text.lower()) else 0
                        return digit_count + max_consecutive + pattern_bonus

                    print("\n" + "="*60)
                    print("🔍 SEARCHING FOR INVOICE NUMBER")
                    print("="*60)
                    search_radius_x = 400  # Define search radius
                    search_radius_y = 100   # Define search radius
                    print(f"Mapped position: ({mapped_cx:.1f}, {mapped_cy:.1f})")
                    print(f"Search radius: {search_radius_x}px horizontal, {search_radius_y}px vertical")
                    
                    candidates = []
                    best_match = None  # Initialize best_match as None
                    for box in detected_boxes:
                        text = box["text"].strip()
                        is_valid = is_valid_invoice_number(text)
                        dist_x = abs(box["center_x"] - mapped_cx)
                        dist_y = abs(box["center_y"] - mapped_cy)
                        in_radius = dist_x <= search_radius_x and dist_y <= search_radius_y
                        
                        if not in_radius:
                            continue
                            
                        print(f"\nText: '{text}'")
                        print(f"  Position: ({box['center_x']:.1f}, {box['center_y']:.1f})")
                        print(f"  Valid format: {'✅' if is_valid else '❌'}")
                        print(f"  Distance from mapped: ({dist_x:.1f}, {dist_y:.1f})")
                        
                        if not is_valid:
                            continue
                            
                        # Apply weights: Y-axis distance is 3x more important than X-axis
                        weight_x = 1.0
                        weight_y = 10
                        distance = ((dist_x * weight_x) ** 2 + (dist_y * weight_y) ** 2) ** 0.5
                        candidates.append((distance, box))
                        print(f"  🎯 Candidate added with distance: {distance:.1f}")
                    
                    if candidates:
                        candidates.sort()
                        best_match = candidates[0][1]
                        print(f"\n🏆 Best match: '{best_match['text'].strip()}' with distance {candidates[0][0]:.1f}")
                        
                        # Only process best_match if we found valid candidates
                        numfacture_value = best_match["text"].strip()
                        numfacture_box = {
                            "left": best_match["left"],
                            "top": best_match["top"],
                            "width": best_match["width"],
                            "height": best_match["height"],
                            "manual": False
                        }
                    else:
                        print("\n❌ No valid invoice number candidates found within search radius")
        except Exception as e:
            import traceback
            print(f"Error extracting numFacture: {e}")
            print(traceback.format_exc())
        finally:
            if 'cursor' in locals() and cursor:
                cursor.close()
            if 'connection' in locals() and connection and getattr(connection, 'is_connected', lambda: True)():
                try:
                    connection.close()
                except Exception:
                    pass

        # -------------------------
        # Date extraction 
        # -------------------------
        print("\n" + "="*60)
        print("📅 EXTRACTING INVOICE DATE")
        print("="*60)
        date_extraction_start = time.time()
        datefacturation_value = None
        datefacturation_box = None
        try:
            connection = get_connection()
            cursor = connection.cursor(dictionary=True)
            cursor.execute("SELECT id FROM field_name WHERE name = 'datefacturation'")
            row = cursor.fetchone()
            if row:
                date_field_id = row['id']
                cursor.execute("""
                    SELECT `left`, `top`, `width`, `height`
                    FROM Mappings
                    WHERE template_id = %s AND field_id = %s
                    LIMIT 1
                """, (template_id, date_field_id))
                mapping = cursor.fetchone()
                if mapping:
                    mapped_cx = float(mapping['left']) + float(mapping['width']) / 2
                    mapped_cy = float(mapping['top']) + float(mapping['height']) / 2

                    def parse_date_try(text):
                        # First, try to extract date from common labeled formats
                        labeled_patterns = [
                            r'(?:date|date\s*facturation|date\s*échéance)[:\s]+([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4})',  # DD/MM/YYYY after label
                            r'(?:date|date\s*facturation|date\s*échéance)[:\s]+([0-9]{4}[/\-\.][0-9]{1,2}[/\-\.][0-9]{1,2})',  # YYYY/MM/DD after label
                            r'([0-9]{1,2}[/\-\.][0-9]{1,2}[/\-\.][0-9]{2,4})',  # Just DD/MM/YYYY
                            r'([0-9]{4}[/\-\.][0-9]{1,2}[/\-\.][0-9]{1,2})'   # Just YYYY/MM/DD
                        ]
                        
                        for pattern in labeled_patterns:
                            match = re.search(pattern, text, re.IGNORECASE)
                            if match:
                                date_str = match.group(1) if len(match.groups()) > 0 else match.group(0)
                                try:
                                    # Try parsing with day first (DD/MM/YYYY)
                                    try:
                                        return datetime.strptime(date_str, '%d/%m/%Y').date()
                                    except ValueError:
                                        pass
                                    # Try parsing with year first (YYYY/MM/DD)
                                    try:
                                        return datetime.strptime(date_str, '%Y/%m/%d').date()
                                    except ValueError:
                                        pass
                                except (ValueError, AttributeError):
                                    continue
                        
                        # For all other formats, use dateparser with French locale and specific settings
                        settings = {
                            'PREFER_DAY_OF_MONTH': 'first',  # Always use first day for month/year dates
                            'DATE_ORDER': 'DMY',            # Day/Month/Year order
                            'PREFER_LOCALE_DATE_ORDER': True,  # Respect locale preferences
                            'STRICT_PARSING': False,        # Be more lenient with formats
                            'RELATIVE_BASE': datetime.now()  # For relative dates
                        }
                        
                        try:
                            # First try parsing with French locale
                            dt = dateparser.parse(
                                text, 
                                languages=['fr'],
                                settings=settings
                            )
                            
                            # If that fails, try without language (fallback to English)
                            if not dt:
                                dt = dateparser.parse(text, settings=settings)
                            
                            if dt:
                                # Ensure we have a date object, not datetime
                                if hasattr(dt, 'date'):
                                    return dt.date()
                                return dt
                                
                        except Exception as e:
                            print(f"Date parsing error with dateparser: {e}")
                        
                        return None  # Return None if all parsing attempts fail
                        

                    # Search for candidate dates and score them by proximity & parseability
                    print("\n" + "="*60)
                    print("📅 SEARCHING FOR INVOICE DATE")
                    print("="*60)
                    search_radius_x = 200  # Define search radius
                    search_radius_y = 100  # Define search radius
                    print(f"Mapped position: ({mapped_cx:.1f}, {mapped_cy:.1f})")
                    print(f"Search radius: {search_radius_x}px horizontal, {search_radius_y}px vertical")
                    
                    best_score = -1.0
                    best_box = None
                    
                    for box in detected_boxes:
                        text = box['text'].strip()
                        has_digits = bool(re.search(r'\d', text))
                        
                        # Calculate distance from mapped position
                        dist_x = abs(box['center_x'] - mapped_cx)
                        dist_y = abs(box['center_y'] - mapped_cy)
                        in_radius = dist_x <= search_radius_x and dist_y <= search_radius_y
                        
                        if not in_radius:
                            continue
                            
                        print(f"\nText: '{text}'")
                        print(f"  Position: ({box['center_x']:.1f}, {box['center_y']:.1f})")
                        print(f"  Distance from mapped: ({dist_x:.1f}, {dist_y:.1f})")
                        
                        if not has_digits:
                            print("  ❌ No digits found")
                            continue
                            
                        # Try to parse the date
                        dt = parse_date_try(text)
                        print(f"  Parsed date: {dt}")
                        
                        if not dt:
                            print("  ❌ Could not parse as date")
                            continue
                            
                        # Calculate position-based score (inverse of distance)
                        dist_x = abs(box['center_x'] - mapped_cx)
                        dist_y = abs(box['center_y'] - mapped_cy)
                        total_score = 1.0 / (1.0 + 0.001 * (dist_x + dist_y))
                        
                        print(f"  Distance score: {total_score:.3f}")
                        
                        if total_score > best_score:
                            best_score = total_score
                            best_box = (box, dt)
                            print("  🏆 New best match!")
                    
                    if best_box:
                        print(f"\n🏆 Best date match: '{best_box[0]['text'].strip()}' with score {best_score:.3f}")

                    if best_box:
                        box, dt = best_box
                        datefacturation_value = dt.strftime('%Y-%m-%d')  # normalized output
                        datefacturation_box = {
                            "left": box["left"],
                            "top": box["top"],
                            "width": box["width"],
                            "height": box["height"],
                        }
        except Exception as e:
            print(f"Error extracting dateFacturation: {e}")
            print(traceback.format_exc())
        finally:
            # Calculate the time taken for date extraction
            datefacturation_time = time.time() - date_extraction_start
            print(f"⏱️  Date extraction took: {datefacturation_time:.4f} seconds")
            
            if 'cursor' in locals() and cursor:
                cursor.close()
            if 'connection' in locals() and connection and getattr(connection, 'is_connected', lambda: True)():
                try:
                    connection.close()
                except Exception:
                    pass

        # -------------------------
        # Prepare response
        # -------------------------
        print("\n" + "="*60)
        print("📊 EXTRACTION SUMMARY")
        print("="*60)
        print(f"📄 Invoice Number: {numfacture_value} (took {num_facture_time:.4f}s)")
        print(f"📅 Invoice Date: {datefacturation_value} (took {datefacturation_time:.4f}s)")
        print(f"💰 HT: {ht_extracted:.2f} (took {ht_time:.4f}s)")
        print(f"💸 TVA: {tva_extracted:.2f} (took {tva_time:.4f}s)")
        print(f"💵 TTC: {ttc_extracted:.2f} (calculated)")
        print("="*60)

        result_data = {
            "montantHT": ht_extracted,
            "montantTVA": tva_extracted,
            "montantTTC": ttc_extracted,
            "tauxTVA": taux_tva,
            "boxHT": {
                "left": ht_match['value_box']['left'],
                "top": ht_match['value_box']['top'],
                "width": ht_match['value_box']['width'],
                "height": ht_match['value_box']['height'],
            },
            "boxTVA": {
                "left": tva_match['value_box']['left'],
                "top": tva_match['value_box']['top'],
                "width": tva_match['value_box']['width'],
                "height": tva_match['value_box']['height'],
            },
            "numFacture": numfacture_value,
            "boxNumFacture": numfacture_box,
            "dateFacturation": datefacturation_value,
            "boxDateFacturation": datefacturation_box,
            "template_id": template_id
        }

        return {
            "success": True,
            "data": result_data,
            "message": "Extraction réussie"
        }

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logging.error(f"Error in ocr_preview: {str(e)}\n{error_details}")
        return {
            "success": False,
            "data": {"error": str(e), "traceback": error_details},
            "message": f"Erreur lors de l'extraction: {str(e)}"
        }


@app.post("/ajouter-facture", response_model=InvoiceResponse)
async def ajouter_facture(
    invoice: InvoiceCreate,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """
    Save invoice data to the database using ORM.
    
    Args:
        invoice: The invoice data to be saved
        current_user: The currently authenticated user (from dependency)
        db: Database session
        
    Returns:
        InvoiceResponse: A response containing success status, message, and invoice data
    """
    try:
        facture_service = FactureService(db)
        
        # Convert Pydantic model to dict for the service
        facture_data = {
            "fournisseur": invoice.fournisseur,
            "numFacture": invoice.numFacture,
            "dateFacturation": invoice.dateFacturation,
            "tauxTVA": invoice.tauxTVA,
            "montantHT": invoice.montantHT,
            "montantTVA": invoice.montantTVA,
            "montantTTC": invoice.montantTTC,
            "created_by": current_user["id"]
        }
        
        result = await facture_service.create_facture(facture_data, current_user["id"])
        
        if result["success"]:
            return InvoiceResponse(
                success=True,
                message="Facture enregistrée avec succès",
                data=result["facture"]
            )
        else:
            return InvoiceResponse(
                success=False,
                message=result["message"]
            )
            
    except Exception as e:
        logging.error(f"Error creating invoice: {e}")
        return InvoiceResponse(
            success=False,
            message=f"Erreur lors de la création de la facture: {str(e)}"
        )


@app.get("/download-dbf")
async def download_dbf():
    """Download the DBF file for FoxPro"""
    foxpro_dir = os.path.join(os.path.dirname(__file__), 'foxpro')
    dbf_path = os.path.join(foxpro_dir, "factures.dbf")
    if not os.path.exists(dbf_path):
        raise HTTPException(status_code=404, detail="Fichier DBF non trouvé")
    return FileResponse(
        path=dbf_path,
        filename="factures.dbf",
        media_type="application/octet-stream"
    )


@app.post("/save-corrected-data")
async def save_corrected_data(request: Request):
    """Sauvegarder les données corrigées par l'utilisateur pour FoxPro"""
    try:
        print("=== DEBUG save_corrected_data ===")
        
        # Récupérer le JSON brut pour diagnostiquer
        corrected_data = await request.json()
        print("Payload reçu dans save_corrected_data:", corrected_data)
        print("Type du payload:", type(corrected_data))
        print("Clés du payload:", list(corrected_data.keys()) if isinstance(corrected_data, dict) else "Pas un dict")
        
        # Utiliser la fonction save_extraction_for_foxpro pour assurer la cohérence
        save_extraction_for_foxpro(
            extracted_data={},  # Données extraites vides car on utilise les données corrigées
            confidence_scores={},  # Scores de confiance vides
            corrected_data=corrected_data
        )
        
        return {
            "success": True,
            "message": "Données corrigées sauvegardées pour FoxPro"
        }
        
    except Exception as e:
        logging.error(f"Erreur lors de la sauvegarde des données corrigées: {e}")
        return {
            "success": False,
            "message": f"Erreur lors de la sauvegarde: {str(e)}"
        }


@app.post("/launch-foxpro")
async def launch_foxpro():
    """Lancer FoxPro avec le formulaire de saisie"""
    try:
        import subprocess
        import platform
        
        # Vérifier si le fichier d'extraction existe dans le dossier foxpro
        foxpro_dir = os.path.join(os.path.dirname(__file__), 'foxpro')
        json_path = os.path.join(foxpro_dir, 'ocr_extraction.json')
        
        # Créer le dossier foxpro s'il n'existe pas
        os.makedirs(foxpro_dir, exist_ok=True)
        
        # Si pas de données extraites, créer un fichier JSON vide avec la structure attendue
        if not os.path.exists(json_path):
            # Créer un fichier JSON vide avec la structure attendue
            empty_data = {
                "fournisseur": "",
                "numFacture": "",
                "dateFacturation": "",
                "montantHT": 0.0,
                "montantTVA": 0.0,
                "montantTTC": 0.0,
                "tauxTVA": 0.0
            }
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(empty_data, f, ensure_ascii=False, indent=2)
            
            print(f"Fichier JSON vide créé: {json_path}")
        
        # Vérifier si le fichier DBF existe, sinon le créer
        dbf_path = os.path.join(foxpro_dir, 'factures.dbf')
        if not os.path.exists(dbf_path):
            try:
                # Créer un fichier DBF vide avec la bonne structure (compatible avec write_invoice_to_dbf)
                table = dbf.Table(
                    dbf_path,
                    'fournissr C(30); numfact C(15); datefact C(15); tauxtva N(5,2); mntht N(10,2); mnttva N(10,2); mntttc N(10,2)'
                )
                table.open(mode=dbf.READ_WRITE)
                table.close()
                print("Fichier factures.dbf créé automatiquement")
            except Exception as dbf_error:
                logging.error(f"Erreur lors de la création automatique du fichier DBF: {dbf_error}")
                return {
                    "success": False,
                    "message": f"Erreur lors de la création de la base de données: {str(dbf_error)}"
                }
        
        # Chercher FoxPro automatiquement
        foxpro_path = None
        
        # Emplacements courants
        possible_paths = [
            r"C:\Program Files (x86)\Microsoft Visual FoxPro 9\vfp9.exe",
            r"C:\Program Files\Microsoft Visual FoxPro 9\vfp9.exe",
            r"C:\Users\pc\Desktop\microsoft visual foxpro 9\microsoft visual foxpro 9\vfp9.exe"
        ]
        
        # Chercher dans les emplacements courants
        for path in possible_paths:
            if os.path.exists(path):
                foxpro_path = path
                break
        
        # Si pas trouvé, chercher avec where
        if not foxpro_path:
            try:
                import subprocess
                result = subprocess.run(['where', 'vfp9'], capture_output=True, text=True)
                if result.returncode == 0:
                    foxpro_path = result.stdout.strip().split('\n')[0]
            except:
                pass
        
        if not foxpro_path:
            return {
                "success": False,
                "message": "FoxPro 9 non trouvé. Veuillez l'installer ou vérifier le chemin."
            }
        
        # Lancer FoxPro avec le formulaire
        try:
            # Chemin vers le formulaire FoxPro (utiliser le fichier .prg, pas .FXP)
            form_path = os.path.join(foxpro_dir, 'formulaire_foxpro_final.prg')
            
            if not os.path.exists(form_path):
                return {
                    "success": False,
                    "message": "Formulaire FoxPro non trouvé."
                }
            
            # Lancer FoxPro avec le formulaire
            subprocess.Popen([foxpro_path, form_path], cwd=foxpro_dir)
            
            return {
                "success": True,
                "message": "FoxPro lancé avec succès"
            }
            
        except Exception as e:
            logging.error(f"Erreur lors du lancement de FoxPro: {e}")
            return {
                "success": False,
                "message": f"Erreur lors du lancement de FoxPro: {str(e)}"
            }
            
    except Exception as e:
        logging.error(f"Erreur lors du lancement de FoxPro: {e}")
        return {
            "success": False,
            "message": f"Erreur lors du lancement de FoxPro: {str(e)}"
        }


# =======================
# FoxPro Integration Functions
# =======================

def save_extraction_for_foxpro(extracted_data: Dict[str, str], confidence_scores: Dict[str, float], corrected_data: Dict[str, str] = None):
    """Sauvegarder les données extraites dans un fichier JSON pour FoxPro"""
    try:
        print(f"=== DEBUG save_extraction_for_foxpro ===")
        print(f"extracted_data reçu: {extracted_data}")
        print(f"corrected_data reçu: {corrected_data}")
        print(f"confidence_scores reçu: {confidence_scores}")
        
        # Utiliser les données corrigées si disponibles, sinon les données extraites
        if corrected_data is not None:
            data_to_use = corrected_data
            print(f"Utilisation des données corrigées: {data_to_use}")
        else:
            data_to_use = extracted_data
            print(f"Utilisation des données extraites: {data_to_use}")
        
        # Gérer les différents noms de champs possibles
        numero_facture = data_to_use.get("numeroFacture") or data_to_use.get("numFacture", "")
        print(f"Numéro facture trouvé: {numero_facture}")
        
        # Nettoyer le taux TVA - extraire juste le nombre
        taux_tva_raw = data_to_use.get("tauxTVA", "0")
        taux_tva_clean = "0"
        if taux_tva_raw:
            # Chercher un nombre dans la chaîne (ex: "Total TVA 20%" -> "20")
            match = re.search(r'(\d+(?:[.,]\d+)?)', str(taux_tva_raw))
            if match:
                taux_tva_clean = match.group(1)
        
        print(f"Taux TVA nettoyé: {taux_tva_clean}")
        
        # Créer un fichier JSON avec les données (corrigées ou extraites)
        print("Début construction foxpro_data...")
        
        foxpro_data = {
            "success": True,
            "data": extracted_data if extracted_data else {},
            "corrected_data": corrected_data,
            "confidence_scores": confidence_scores if confidence_scores else {},
            "timestamp": str(datetime.now()),
            "fields": {
                "fournisseur": data_to_use.get("fournisseur", ""),
                "dateFacturation": data_to_use.get("dateFacturation", ""),
                "numeroFacture": numero_facture,  # Use the processed numero_facture variable
                "tauxTVA": taux_tva_clean,
                "montantHT": data_to_use.get("montantHT", "0"),
                "montantTVA": data_to_use.get("montantTVA", "0"),
                "montantTTC": data_to_use.get("montantTTC", "0")
            }
        }
        print("foxpro_data construit avec succès")
        
        # Créer automatiquement le fichier JSON dans le dossier foxpro
        foxpro_dir = os.path.join(os.path.dirname(__file__), 'foxpro')
        os.makedirs(foxpro_dir, exist_ok=True)
        
        json_path = os.path.join(foxpro_dir, 'ocr_extraction.json')
        print(f"Écriture du fichier JSON: {json_path}")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(foxpro_data, f, ensure_ascii=False, indent=2)
        
        # Créer automatiquement le fichier texte simple pour FoxPro
        txt_path = os.path.join(foxpro_dir, 'ocr_extraction.txt')
        print(f"Écriture du fichier TXT: {txt_path}")
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(f"Date export: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Fournisseur: {data_to_use.get('fournisseur', '')}\n")
            f.write(f"Numéro Facture: {numero_facture}\n")  # Use the processed numero_facture variable
            f.write(f"Taux TVA: {taux_tva_clean}\n")
            f.write(f"Montant HT: {data_to_use.get('montantHT', '0')}\n")
            f.write(f"Montant TVA: {data_to_use.get('montantTVA', '0')}\n")
            f.write(f"Montant TTC: {data_to_use.get('montantTTC', '0')}\n")
        
        print("Fichiers ocr_extraction.json et ocr_extraction.txt créés automatiquement dans le dossier foxpro")
        
        # Créer aussi automatiquement le fichier DBF s'il n'existe pas
        try:
            write_invoice_to_dbf(data_to_use)
            print("Fichier factures.dbf créé/mis à jour automatiquement")
        except Exception as dbf_error:
            logging.warning(f"Impossible de créer le fichier DBF: {dbf_error}")
        
    except Exception as e:
        logging.error(f"Erreur lors de la sauvegarde pour FoxPro: {e}")


def write_invoice_to_dbf(invoice_data, dbf_path=None):
    """
    Ajoute une facture dans un fichier DBF compatible FoxPro.
    Si le fichier n'existe pas, il est créé automatiquement avec la bonne structure.
    """
    import os
    
    # Utiliser le chemin par défaut dans le dossier foxpro
    if dbf_path is None:
        foxpro_dir = os.path.join(os.path.dirname(__file__), 'foxpro')
        os.makedirs(foxpro_dir, exist_ok=True)
        dbf_path = os.path.join(foxpro_dir, 'factures.dbf')
    
    try:
        # Vérifier si le fichier existe et n'est pas vide
        if os.path.exists(dbf_path) and os.path.getsize(dbf_path) == 0:
            os.remove(dbf_path)
            print("Fichier DBF vide supprimé")
        
        # Créer le fichier DBF s'il n'existe pas
        if not os.path.exists(dbf_path):
            print("Création automatique du fichier factures.dbf")
            # Créer la table DBF avec une structure compatible FoxPro
            table = dbf.Table(
                dbf_path,
                'fournissr C(30); numfact C(15); datefact C(15); tauxtva N(5,2); mntht N(10,2); mnttva N(10,2); mntttc N(10,2)'
            )
            table.open(mode=dbf.READ_WRITE)
            table.close()
            print("Fichier factures.dbf créé avec succès")
        
        # Ouvrir la table existante
        table = dbf.Table(dbf_path)
        table.open(mode=dbf.READ_WRITE)
        
        # Ajouter la facture (mapping robuste)
        fournisseur = invoice_data.get('fournisseur', '')
        numero_facture = invoice_data.get('numeroFacture', invoice_data.get('numFacture', ''))
        date_facturation = invoice_data.get('dateFacturation', '')
        taux_tva = float(invoice_data.get('tauxTVA', 0))
        montant_ht = float(invoice_data.get('montantHT', 0))
        montant_tva = float(invoice_data.get('montantTVA', 0))
        montant_ttc = float(invoice_data.get('montantTTC', 0))

        table.append((
            fournisseur,
            numero_facture,
            date_facturation,
            taux_tva,
            montant_ht,
            montant_tva,
            montant_ttc
        ))
        table.close()
        
        print(f"Facture ajoutée au fichier DBF: {invoice_data.get('numeroFacture', 'N/A')}")
        
    except Exception as e:
        logging.error(f"Erreur lors de l'écriture dans le fichier DBF: {e}")
        
        try:
            
            try:
                table.close()
            except Exception:
                pass
            if os.path.exists(dbf_path):
                os.remove(dbf_path)
            # Recréer le fichier avec la même structure que celle utilisée pour l'append
            table = dbf.Table(
                dbf_path,
                'fournissr C(30); numfact C(15); datefact C(15); tauxtva N(5,2); mntht N(10,2); mnttva N(10,2); mntttc N(10,2)'
            )
            table.open(mode=dbf.READ_WRITE)
            table.close()
            table.append((
                invoice_data['fournisseur'],
                invoice_data.get('numeroFacture', invoice_data.get('numFacture', '')),
                invoice_data['dateFacturation'],
                float(invoice_data['tauxTVA']),
                float(invoice_data['montantHT']),
                float(invoice_data['montantTVA']),
                float(invoice_data['montantTTC'])
            ))
            table.close()
            print("Fichier DBF recréé et facture ajoutée avec succès")
        except Exception as retry_error:
            logging.error(f"Erreur fatale lors de la création du fichier DBF: {retry_error}")
            raise retry_error
    finally:
        if 'table' in locals():
            try:
                table.close()
            except Exception:
                pass


@app.post("/api/ai-extract")
async def ai_extract_invoices(files: List[UploadFile], confidence: float = 0.5):
    """Extrait les données de plusieurs factures avec le modèle AI"""
    try:
        logging.info(f"Début de l'extraction AI avec {len(files)} fichiers")
        
        # Vérifier que le service AI est initialisé
        if not ai_extraction_service:
            logging.error("Service AI non initialisé")
            return {"success": False, "error": "Service AI non initialisé"}
        
        # Vérifier que le modèle YOLO est chargé
        model_info = ai_extraction_service.get_model_info()
        logging.info(f"Info du modèle: {model_info}")
        
        if not ai_extraction_service.validate_model():
            logging.error("Modèle YOLO non valide")
            return {"success": False, "error": "Modèle YOLO non valide"}
        
        # Sauvegarder temporairement les fichiers
        temp_files = []
        for file in files:
            temp_path = f"temp_{file.filename}"
            with open(temp_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            temp_files.append(temp_path)
            logging.info(f"Fichier temporaire créé: {temp_path}")
        
        # Extraire avec le modèle AI
        logging.info("Début de l'extraction avec YOLO")
        results = ai_extraction_service.extract_from_files(temp_files, confidence)
        logging.info(f"Extraction terminée, {len(results)} résultats")
        
        # Nettoyer les fichiers temporaires
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                os.remove(temp_file)
                logging.info(f"Fichier temporaire supprimé: {temp_file}")
        
        return {"success": True, "results": results}
    
    except Exception as e:
        logging.error(f"Erreur lors de l'extraction AI: {str(e)}")
        import traceback
        logging.error(f"Traceback: {traceback.format_exc()}")
        return {"success": False, "error": str(e)}


@app.get("/api/ai-test")
async def test_ai_service():
    """Test simple du service AI"""
    try:
        if not ai_extraction_service:
            return {"success": False, "error": "Service AI non initialisé"}
        
        model_info = ai_extraction_service.get_model_info()
        is_valid = ai_extraction_service.validate_model()
        
        return {
            "success": True,
            "service_initialized": ai_extraction_service is not None,
            "model_info": model_info,
            "model_valid": is_valid
        }
    except Exception as e:
        logging.error(f"Erreur lors du test AI: {str(e)}")
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
