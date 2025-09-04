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
import time

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

# Authentication modules
from auth.auth_routes import router as auth_router
from auth.auth_jwt import require_comptable_or_admin
from auth.auth_config import CORS_ORIGINS, CORS_ALLOW_CREDENTIALS

# Load environment variables
if os.getenv("ENV") != "production":
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
    filename=r'invoice_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(message)s',
    force=True
)

# Initialize database
from database.init_db import init_database
init_database()  # Use synchronous initialization for simplicity

# Include authentication routes
app.include_router(auth_router)

# Initialize PaddleOCR with specified parameters
ocr = PaddleOCR(
    lang="fr",
  
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    text_det_input_shape=[3, 1440, 1440],
    precision="fp32",
    enable_mkldnn=True,
    text_det_unclip_ratio=1.3,
    text_rec_score_thresh=0.8,


)

# =======================
# Pydantic Models
# =======================
class FieldCoordinates(BaseModel):
    """Represents coordinates and dimensions of a field on a document."""
    left: float
    top: float
    width: float
    height: float
   





class FieldMapping(BaseModel):
    """Mapping of field names to their coordinates."""
    field_map: Dict[str, Any]  


class ExtractionResult(BaseModel):
    """Result of a document extraction process."""
    success: bool
    data: Dict[str, str]
    message: str


class SaveMappingRequest(BaseModel):
    template_id: str = "default"
    field_map: Dict[str, Any]  


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

def standardize_image_dimensions(img: Image.Image, target_width: int= 595*PDF_RENDER_SCALE, target_height: int=842*PDF_RENDER_SCALE) -> Image.Image:
    """
    Resize image to target dimensions while maintaining aspect ratio.
    Adds padding if necessary to match target dimensions exactly.
    """
    # Calculate aspect ratios
    img_ratio = img.width / img.height
    target_ratio = target_width / target_height
    
    # Resize to fit within target dimensions while maintaining aspect ratio
    if img_ratio > target_ratio:
        # Image is wider than target, fit to width
        new_width = target_width
        new_height = int(target_width / img_ratio)
    else:
        # Image is taller than target, fit to height
        new_height = target_height
        new_width = int(target_height * img_ratio)
    
    # Resize the image
    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Create new image with target size and paste the resized image
    result = Image.new('RGB', (target_width, target_height), (255, 255, 255))  # White background
    x = (target_width - new_width) // 2
    y = (target_height - new_height) // 2
    result.paste(img, (x, y))
    
    return result

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
        
        # Standardize the image dimensions
        img = standardize_image_dimensions(img)
        
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
          
            pix = page.get_pixmap(matrix=fitz.Matrix(PDF_RENDER_SCALE, PDF_RENDER_SCALE))  # Increase resolution
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            pdf_document.close()
            # Standardize the image dimensions
            img = standardize_image_dimensions(img)
            images = [img]
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            if page_index != 0:
                raise HTTPException(status_code=400, detail="L'index de page n'est valide que pour les fichiers PDF")
            img = Image.open(BytesIO(file_content)).convert('RGB')
            # Standardize the image dimensions
            img = standardize_image_dimensions(img)
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
            template_name=request.template_id,  
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
    request: dict,  # Using dict to handle dynamic field types
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """
    Save field mappings for a template using ORM
    
    Args:
        request: Dictionary containing template_id and field_map
        current_user: Authenticated user from JWT token
        db: Database session
        
    Returns:
        JSON response with success/error status
    """
    try:
        template_service = TemplateService(db)
        
        # Extract template_id and field_map from request
        template_id = request.get('template_id', 'default')
        field_map = request.get('field_map', {})
        
    
        processed_map = {}
        for field_name, value in field_map.items():
            if value is not None:
          
                if isinstance(value, dict) in value:
                    processed_map[field_name] = value
                # Handle coordinate fields
                elif hasattr(value, 'get') and all(k in value for k in ['left', 'top', 'width', 'height']):
                    processed_map[field_name] = {
                        'left': value.get('left', 0),
                        'top': value.get('top', 0),
                        'width': value.get('width', 0),
                        'height': value.get('height', 0),
                        
                    }
        
      
        logging.debug(f"Processed field map: {processed_map}")
        
        success = await template_service.save_mapping(
            template_name=template_id,
            field_map=processed_map,
            current_user_id=current_user['id']
        )
        
        if success:
            return {
                "success": True,
                "message": "Mapping saved successfully",
                "template_id": template_id,
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




@app.get("/factures")
async def get_factures(
    skip: int = 0,
    limit: int = 10,  # Default to 10 items per page
    page: Optional[int] = None,
    search: Optional[str] = None,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """
    Get invoices for the current user using ORM with optional search and pagination
    
    Query Parameters:
    - page: Page number (1-based). If provided, overrides 'skip'
    - skip: Number of records to skip (for pagination)
    - limit: Maximum number of records to return per page (default: 10)
    - search: Optional search term to filter invoices
    """
    try:
        # Calculate skip based on page number if provided
        if page is not None and page > 0:
            skip = (page - 1) * limit
            
        facture_service = FactureService(db)
        result = await facture_service.get_factures(
            current_user["id"], 
            skip=skip, 
            limit=limit, 
            search=search
        )
        
        # Add pagination metadata
        if result["success"]:
            total_items = result.get("total_count", 0)
            total_pages = max(1, (total_items + limit - 1) // limit)
            
            result["pagination"] = {
                "current_page": page if page is not None else (skip // limit) + 1,
                "total_pages": total_pages,
                "total_items": total_items,
                "items_per_page": limit,
                "has_next": (skip + limit) < total_items,
                "has_previous": skip > 0
            }
            
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



@app.post("/ocr-preview")
async def ocr_preview(
    file: UploadFile = File(...),
    template_id: str = Form(None),
):
    import time  # Ensure time module is available in this function
    MIN_CONFIDENCE = 0.8
   
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
            
        # Standardize the image dimensions before OCR processing
        img = standardize_image_dimensions(img)
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
 
        # -------------------------
        # Extract HT using position-based mapping
        # -------------------------
        ht_extracted = None
        ht_box = None
        ht_match = {'value_box': {'left': 0, 'top': 0, 'width': 0, 'height': 0}}
        try:
            # Get database connection and cursor
            connection = get_connection()
            cursor = connection.cursor(dictionary=True)
            
            # Get field ID for montantht
            cursor.execute("SELECT id FROM field_name WHERE name = 'montantht'")
            row = cursor.fetchone()
            if row:
                ht_field_id = row['id']
                cursor.execute("""
                    SELECT `left`, `top`, `width`, `height`
                    FROM Mappings
                    WHERE template_id = %s AND field_id = %s
                    LIMIT 1
                """, (template_id, ht_field_id))
                mapping = cursor.fetchone()
                if mapping:
                    # Define expansion amounts (in pixels)
                    expand_x = 100  # Increased from 10 to 100px for better detection
                    expand_y = 20    # Increased from 5 to 20px for better detection
                    
                    # Calculate expanded mapped box coordinates
                    mapped_left = float(mapping['left']) - expand_x
                    mapped_right = float(mapping['left']) + float(mapping['width']) + expand_x
                    mapped_top = float(mapping['top']) - expand_y
                    mapped_bottom = float(mapping['top']) + float(mapping['height']) + expand_y
                    
                    mapped_box = {
                        'left': mapped_left,
                        'top': mapped_top,
                        'right': mapped_right,
                        'bottom': mapped_bottom
                    }
                    
                    # Find the best matching box in the mapped area
                    best_match = None
                    best_score = -1
                    
                    for box in detected_boxes:
                        current_box = {
                            'left': box['left'],
                            'top': box['top'],
                            'right': box['left'] + box['width'],
                            'bottom': box['top'] + box['height']
                        }
                        
                        # Calculate overlap
                        x_overlap = max(0, min(mapped_box['right'], current_box['right']) - max(mapped_box['left'], current_box['left']))
                        y_overlap = max(0, min(mapped_box['bottom'], current_box['bottom']) - max(mapped_box['top'], current_box['top']))
                        overlap_area = x_overlap * y_overlap
                        
                        # Calculate area of current box
                        box_area = (current_box['right'] - current_box['left']) * (current_box['bottom'] - current_box['top'])
                        
                        # Calculate overlap ratio (how much of the box is within the mapped area)
                        if box_area > 0:
                            overlap_ratio = overlap_area / box_area
                            
                            # Try to extract a number from the box text
                            val = extract_number(box['text'])
                            if val is not None and overlap_ratio > 0.3:  # At least 30% overlap
                                # Calculate center distance for scoring
                                mapped_center_x = (mapped_box['left'] + mapped_box['right']) / 2
                                mapped_center_y = (mapped_box['top'] + mapped_box['bottom']) / 2
                                box_center_x = (current_box['left'] + current_box['right']) / 2
                                box_center_y = (current_box['top'] + current_box['bottom']) / 2
                                
                                # Calculate distance between centers
                                dx = box_center_x - mapped_center_x
                                dy = box_center_y - mapped_center_y
                                distance = (dx**2 + dy**2) ** 0.5
                                
                                # Calculate score (higher is better)
                                score = (overlap_ratio * 0.7) + (1 / (1 + distance) * 0.3)
                                
                                if score > best_score:
                                    best_score = score
                                    best_match = box
                                    ht_extracted = val
                                    ht_box = {
                                        "left": box['left'],
                                        "top": box['top'],
                                        "width": box['width'],
                                        "height": box['height'],
                                      
                                    }
                                    # Update ht_match with the found coordinates
                                    ht_match['value_box'].update({
                                        'left': float(box['left']),
                                        'top': float(box['top']),
                                        'width': float(box['width']),
                                        'height': float(box['height'])
                                    })
                    
                   
               
        except Exception as e:
            print(f"Error extracting HT: {e}")
            import traceback
            print(traceback.format_exc())
        finally:
            # Ensure cursor and connection are properly closed
            if 'cursor' in locals():
                cursor.close()
            if 'connection' in locals() and connection.is_connected():
                connection.close()
        
        if ht_extracted is None:
            return {"success": False, "data": {}, "message": "Aucune valeur HT trouvée dans la zone mappée"}

        # -------------------------
        # Extract TVA using position-based mapping
        # -------------------------
        tva_extracted = None
        tva_box = None
        tva_match = {'value_box': {'left': 0, 'top': 0, 'width': 0, 'height': 0}}
        tva_connection = None
        tva_cursor = None
        
        try:
            # Create new connection and cursor for TVA extraction
            tva_connection = get_connection()
            tva_cursor = tva_connection.cursor(dictionary=True, buffered=True)  # Use buffered cursor
            
            # Get field ID for tva
            tva_cursor.execute("SELECT id FROM field_name WHERE name = 'tva'")
            try:
                row = tva_cursor.fetchone()
                    
                if row and 'id' in row:
                    tva_field_id = row['id']
                    # Make sure to consume any remaining results
                    while tva_cursor.nextset():
                        pass
                    
                    # Execute mapping query
                    tva_cursor.execute("""
                        SELECT `left`, `top`, `width`, `height`
                        FROM Mappings
                        WHERE template_id = %s AND field_id = %s
                        LIMIT 1
                    """, (template_id, tva_field_id))
                    
                    # Fetch the mapping result
                    mapping = tva_cursor.fetchone()
                        
                    # Consume any remaining results
                    while tva_cursor.nextset():
                        pass
                if mapping:
                    # Define expansion amounts (in pixels)
                    expand_x = 10  # 10px horizontal expansion
                    expand_y = 5    # 5px vertical expansion
                    
                    # Calculate expanded mapped box coordinates
                    mapped_left = float(mapping['left']) - expand_x
                    mapped_right = float(mapping['left']) + float(mapping['width']) + expand_x
                    mapped_top = float(mapping['top']) - expand_y
                    mapped_bottom = float(mapping['top']) + float(mapping['height']) + expand_y
                    
                    mapped_box = {
                        'left': mapped_left,
                        'top': mapped_top,
                        'right': mapped_right,
                        'bottom': mapped_bottom
                    }
                    
                    # Find the best matching box in the mapped area
                    best_match = None
                    best_score = -1
                    
                    for box in detected_boxes:
                        current_box = {
                            'left': box['left'],
                            'top': box['top'],
                            'right': box['left'] + box['width'],
                            'bottom': box['top'] + box['height']
                        }
                        
                        # Skip if this is a percentage (TVA rate, not amount)
                        if '%' in box['text']:
                            continue
                            
                        # Calculate overlap
                        x_overlap = max(0, min(mapped_box['right'], current_box['right']) - max(mapped_box['left'], current_box['left']))
                        y_overlap = max(0, min(mapped_box['bottom'], current_box['bottom']) - max(mapped_box['top'], current_box['top']))
                        overlap_area = x_overlap * y_overlap
                        
                        # Calculate area of current box
                        box_area = (current_box['right'] - current_box['left']) * (current_box['bottom'] - current_box['top'])
                        
                        # Calculate overlap ratio (how much of the box is within the mapped area)
                        if box_area > 0:
                            overlap_ratio = overlap_area / box_area
                            
                            # Try to extract a number from the box text
                            val = extract_number(box['text'])
                            if val is not None and overlap_ratio > 0.3:  # At least 30% overlap
                                # Calculate center distance for scoring
                                mapped_center_x = (mapped_box['left'] + mapped_box['right']) / 2
                                mapped_center_y = (mapped_box['top'] + mapped_box['bottom']) / 2
                                box_center_x = (current_box['left'] + current_box['right']) / 2
                                box_center_y = (current_box['top'] + current_box['bottom']) / 2
                                
                                # Calculate distance between centers
                                dx = box_center_x - mapped_center_x
                                dy = box_center_y - mapped_center_y
                                distance = (dx**2 + dy**2) ** 0.5
                                
                                # Calculate score (higher is better)
                                score = (overlap_ratio * 0.7) + (1 / (1 + distance) * 0.3)
                                
                                if score > best_score:
                                    best_score = score
                                    best_match = box
                                    tva_extracted = val
                                    tva_box = {
                                        "left": box['left'],
                                        "top": box['top'],
                                        "width": box['width'],
                                        "height": box['height'],
                                       
                                    }
                                    # Update tva_match with the found coordinates
                                    tva_match['value_box'].update({
                                        'left': float(box['left']),
                                        'top': float(box['top']),
                                        'width': float(box['width']),
                                        'height': float(box['height'])
                                    })
                    
                    if not best_match:
                        print("No valid TVA value found in mapped area")
            except Exception as e:
                print(f"Error in TVA field ID query: {e}")
                import traceback
                traceback.print_exc()
                return {"success": False, "data": {}, "message": f"Erreur lors de l'extraction TVA: {str(e)}"}
                
        except Exception as e:
            print(f"Error extracting TVA: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "data": {}, "message": f"Erreur lors de l'extraction TVA: {str(e)}"}
            
        finally:
            # Clean up resources
            if 'tva_cursor' in locals() and tva_cursor is not None:
                try:
                    # Consume any remaining results
                    while tva_cursor.nextset():
                        pass
                except:
                    pass
                finally:
                    try:
                        tva_cursor.close()
                    except:
                        pass
            
            if 'tva_connection' in locals() and tva_connection is not None:
                try:
                    if tva_connection.is_connected():
                        tva_connection.close()
                except:
                    pass
        
        if tva_extracted is None:
            return {"success": False, "data": {}, "message": "Aucune valeur TVA trouvée dans la zone mappée"}

        # -------------------------
        # TTC and taux TVA
        # -------------------------
     
        
        ttc_extracted = round(ht_extracted + tva_extracted, 2)
     
        
        if ht_extracted != 0:
            raw_taux = (tva_extracted * 100.0) / ht_extracted
            # Round to nearest integer (0.5 rounds up)
            taux_tva = int(round(raw_taux))
         
        else:
            taux_tva = 0

        # -------------------------
        # Extract numFacture using position-based mapping
        # -------------------------
        numfacture_value = None
        numfacture_box = None
        numfacture_search_area = None
        numfacture_cursor = None
        try:
            # Create new connection and cursor for numFacture extraction
            numfacture_connection = get_connection()
            numfacture_cursor = numfacture_connection.cursor(dictionary=True)
            
            numfacture_cursor.execute("SELECT id FROM field_name WHERE name = 'numerofacture'")
            row = numfacture_cursor.fetchone()
            if row:
                numfacture_field_id = row['id']
                numfacture_cursor.execute("""
                    SELECT `left`, `top`, `width`, `height`
                    FROM Mappings
                    WHERE template_id = %s AND field_id = %s
                    LIMIT 1
                """, (template_id, numfacture_field_id))
                mapping = numfacture_cursor.fetchone()
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

                    

                   # print("\n" + "="*60)
                   # print("🔍 SEARCHING FOR INVOICE NUMBER")
                   # print("="*60)
                    numFacture_extraction_start = time.time()
                    # Define expansion amounts (in pixels)
                    expand_x = 10  # 10px horizontal expansion
                    expand_y = 5    # 5px vertical expansion
                    
                    # Calculate expanded mapped box coordinates
                    mapped_left = float(mapping['left']) - expand_x
                    mapped_right = float(mapping['left']) + float(mapping['width']) + expand_x
                    mapped_top = float(mapping['top']) - expand_y
                    mapped_bottom = float(mapping['top']) + float(mapping['height']) + expand_y
                    
                    # print(f"Mapped box (expanded): left={mapped_left:.1f}, top={mapped_top:.1f}, f"right={mapped_right:.1f}, bottom={mapped_bottom:.1f}") "
                         
                    
                    def boxes_intersect(box1, box2):
                        """Check if two boxes intersect or touch each other."""
                        return not (box1['right'] < box2['left'] or 
                                 box1['left'] > box2['right'] or 
                                 box1['bottom'] < box2['top'] or 
                                 box1['top'] > box2['bottom'])
                    
                    def calculate_box_distance(box1, box2):
                        """Calculate distance between two boxes with overlap handling.
                        
                        Returns:
                            tuple: (distance, overlap_area_ratio) where:
                                - distance: Minimum distance between box edges (0 if overlapping)
                                - overlap_area_ratio: Ratio of overlap area to smaller box area (0-1)
                        """
                        # Calculate horizontal distance and overlap
                        if box1['right'] < box2['left']:
                            dx = box2['left'] - box1['right']
                            h_overlap = 0
                        elif box2['right'] < box1['left']:
                            dx = box1['left'] - box2['right']
                            h_overlap = 0
                        else:
                            dx = 0
                            # Calculate horizontal overlap
                            h_overlap = min(box1['right'], box2['right']) - max(box1['left'], box2['left'])
                        
                        # Calculate vertical distance and overlap
                        if box1['bottom'] < box2['top']:
                            dy = box2['top'] - box1['bottom']
                            v_overlap = 0
                        elif box2['bottom'] < box1['top']:
                            dy = box1['top'] - box2['bottom']
                            v_overlap = 0
                        else:
                            dy = 0
                            # Calculate vertical overlap
                            v_overlap = min(box1['bottom'], box2['bottom']) - max(box1['top'], box2['top'])
                        
                        # Calculate overlap area and ratio
                        overlap_area = h_overlap * v_overlap if h_overlap > 0 and v_overlap > 0 else 0
                        area1 = (box1['right'] - box1['left']) * (box1['bottom'] - box1['top'])
                        area2 = (box2['right'] - box2['left']) * (box2['bottom'] - box2['top'])
                        smaller_area = min(area1, area2)
                        overlap_ratio = overlap_area / smaller_area if smaller_area > 0 else 0
                        
                        # Calculate center-to-center distance for ranking overlapping boxes
                        center1_x = (box1['left'] + box1['right']) / 2
                        center1_y = (box1['top'] + box1['bottom']) / 2
                        center2_x = (box2['left'] + box2['right']) / 2
                        center2_y = (box2['top'] + box2['bottom']) / 2
                        center_distance = ((center1_x - center2_x) ** 2 + (center1_y - center2_y) ** 2) ** 0.5
                        
                        # If boxes overlap, use a combination of multiple factors
                        if overlap_ratio > 0:
                            # 1. Normalize center distance by the diagonal of the mapped box
                            mapped_diag = ((mapped_box['right'] - mapped_box['left']) ** 2 + 
                                         (mapped_box['bottom'] - mapped_box['top']) ** 2) ** 0.5
                            norm_center_dist = center_distance / mapped_diag if mapped_diag > 0 else 0
                            
                            # 2. Calculate aspect ratio similarity (prefer boxes with similar aspect ratio to mapped box)
                            mapped_ar = (mapped_box['right'] - mapped_box['left']) / max(1, (mapped_box['bottom'] - mapped_box['top']))
                            box_ar = (box2['right'] - box2['left']) / max(1, (box2['bottom'] - box2['top']))
                           
                            
                            # 3. Position within mapped area (prefer boxes closer to the center)
                            mapped_center_x = (mapped_box['left'] + mapped_box['right']) / 2
                            mapped_center_y = (mapped_box['top'] + mapped_box['bottom']) / 2
                            box_center_x = (box2['left'] + box2['right']) / 2
                            box_center_y = (box2['top'] + box2['bottom']) / 2
                            
                            # Normalize position difference (0 to 1, where 0 is at center)
                            x_pos_ratio = abs(box_center_x - mapped_center_x) / max(1, (mapped_box['right'] - mapped_box['left']) / 2)
                            y_pos_ratio = abs(box_center_y - mapped_center_y) / max(1, (mapped_box['bottom'] - mapped_box['top']) / 2)
                            pos_score = 1 - ((x_pos_ratio + y_pos_ratio) / 2)  # 1 at center, decreasing towards edges
                            
                            # Combine all factors with weights
                            overlap_weight = 0.7  
                            center_dist_weight = 0.2
                            pos_weight = 0.1  
                            
                            # Calculate score (higher is better)
                            score = (overlap_ratio * overlap_weight) + \
                                   ((1 - norm_center_dist) * center_dist_weight) + \
                                   (pos_score * pos_weight)
                            
                            # Return score (higher is better) and overlap_ratio for reference
                            return (score, overlap_ratio)
                        
                        # For non-overlapping boxes, use edge-to-edge distance
                        return ((dx**2 + dy**2) ** 0.5, 0)
                    
                    candidates = []
                    best_match = None
                    
                    # Create expanded mapped box for intersection test
                    mapped_box = {
                        'left': mapped_left,
                        'top': mapped_top,
                        'right': mapped_right,
                        'bottom': mapped_bottom
                    }
                    
                    for box in detected_boxes:
                        text = box["text"].strip()
                        is_valid = is_valid_invoice_number(text)
                        
                        # Create a copy of the box with explicit coordinates for clarity
                        current_box = {
                            'left': box['left'],
                            'top': box['top'],
                            'right': box['left'] + box['width'],
                            'bottom': box['top'] + box['height']
                        }
                        
                        # Check if boxes intersect
                        if not boxes_intersect(mapped_box, current_box):
                            continue
                            
                        # Calculate distance and overlap between boxes
                        distance, overlap_ratio = calculate_box_distance(mapped_box, current_box)
                        
                        # Calculate box centers for reference
                        mapped_center_x = (mapped_box['left'] + mapped_box['right']) / 2
                        mapped_center_y = (mapped_box['top'] + mapped_box['bottom']) / 2
                        box_center_x = (current_box['left'] + current_box['right']) / 2
                        box_center_y = (current_box['top'] + current_box['bottom']) / 2
                        
                   
                        
                        if is_valid:
                            candidates.append({
                                'distance': distance,
                                'overlap_ratio': overlap_ratio,
                                'box': box,
                                'text': text,
                                'center_x': box_center_x,
                                'center_y': box_center_y
                            })
                    
                    # Sort candidates by score (descending - higher score is better)
                    if candidates:
                        candidates.sort(key=lambda x: -x['distance'])  # Negative for descending sort
                        best_match = candidates[0]
                        
                     
                        for i, cand in enumerate(candidates[:3], 1):
                            overlap_info = f"{cand['overlap_ratio']*100:.1f}% overlap" if cand['overlap_ratio'] > 0 else "no overlap"
                      
                        
                        # Only process best_match if we found valid candidates
                        numfacture_value = best_match["text"].strip()
                        numfacture_box = {
                            "left": best_match["box"]["left"],
                            "top": best_match["box"]["top"],
                            "width": best_match["box"]["width"],
                            "height": best_match["box"]["height"],
                       
                        }
                        
                        # Use the same expansion values for visualization as used in detection
                        numfacture_search_area = {
                            "left": mapped_left,
                            "top": mapped_top,
                            "width": mapped_right - mapped_left,
                            "height": mapped_bottom - mapped_top,
                            "type": "search_area"  # Add type to identify it in frontend
                        }
                        num_facture_time = time.time() - numFacture_extraction_start
                     
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
        # Date extraction (using box-based matching)
        # -------------------------
   
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
                    # Define expansion amounts (in pixels)
                    expand_x = 20  # 20px horizontal expansion
                    expand_y = 10   # 10px vertical expansion
                    
                    # Calculate expanded mapped box coordinates
                    mapped_left = float(mapping['left']) - expand_x
                    mapped_right = float(mapping['left']) + float(mapping['width']) + expand_x
                    mapped_top = float(mapping['top']) - expand_y
                    mapped_bottom = float(mapping['top']) + float(mapping['height']) + expand_y
                    
                    mapped_cx = float(mapping['left']) + float(mapping['width']) / 2
                    mapped_cy = float(mapping['top']) + float(mapping['height']) / 2
                    
                  #  print(f"Mapped box (expanded): left={mapped_left:.1f}, top={mapped_top:.1f}, right={mapped_right:.1f}, bottom={mapped_bottom:.1f}")
                    
                    def parse_date_try(text):
                        text = text.strip()
                        # Skip if text is too short or doesn't contain digits
                        if len(text) < 3 or not any(c.isdigit() for c in text):
                            return None
                            
                        # For very short texts, ensure they look like dates (contain / or - or .)
                        if len(text) < 5 and not any(sep in text for sep in ['/', '-', '.']):
                            return None
                            
                        # Clean the text (keep only date-like patterns)
                        clean_text = re.sub(r'[^0-9/\-\.\s]', ' ', text.lower())
                        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                        
                        # Use dateparser with more flexible settings
                        settings = {
                            'DATE_ORDER': 'DMY',
                            'PREFER_DAY_OF_MONTH': 'first',
                            'STRICT_PARSING': False,
                            'REQUIRE_PARTS': ['month', 'year'],
                            'PARSERS': ['relative-time', 'absolute-time', 'custom-formats', 'timestamp'],
                            'PREFER_LOCALE_DATE_ORDER': True,
                            'RELATIVE_BASE': datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                        }
                        
                        # Add common date formats to help with parsing
                        custom_formats = [
                            '%m/%Y',    # 3/2025
                            '%m/%y',    # 3/25
                            '%d/%m/%Y', # 01/03/2025
                            '%d-%m-%Y', # 01-03-2025
                            '%d.%m.%Y', # 01.03.2025
                            '%Y/%m/%d', # 2025/03/01
                            '%Y-%m-%d', # 2025-03-01
                        ]
                        
                        # Try with custom formats first
                        for fmt in custom_formats:
                            try:
                                dt = datetime.strptime(clean_text, fmt)
                                if 1900 <= dt.year <= 2100 and 1 <= dt.month <= 12:
                                    return dt.date()
                            except ValueError:
                                continue
                        
                        dt = dateparser.parse(clean_text, languages=['fr'], settings=settings)
                        if dt:
                            # Ensure the date is within reasonable bounds
                            if 1900 <= dt.year <= 2100 and 1 <= dt.month <= 12:
                                return dt.date()
                        
                        return None  # No valid date found
                    
                    def boxes_intersect(box1, box2):
                        """Check if two boxes intersect or touch each other."""
                        return not (box1['right'] < box2['left'] or 
                                 box1['left'] > box2['right'] or 
                                 box1['bottom'] < box2['top'] or 
                                 box1['top'] > box2['bottom'])
                    
                    def calculate_box_distance(box1, box2):
                        """Calculate distance between two boxes with overlap handling."""
                        # Calculate horizontal and vertical overlap
                        h_overlap = max(0, min(box1['right'], box2['right']) - max(box1['left'], box2['left']))
                        v_overlap = max(0, min(box1['bottom'], box2['bottom']) - max(box1['top'], box2['top']))
                        
                        # Calculate overlap area and ratio
                        overlap_area = h_overlap * v_overlap
                        area1 = (box1['right'] - box1['left']) * (box1['bottom'] - box1['top'])
                        area2 = (box2['right'] - box2['left']) * (box2['bottom'] - box2['top'])
                        smaller_area = min(area1, area2)
                        overlap_ratio = overlap_area / smaller_area if smaller_area > 0 else 0
                        
                        # Calculate center-to-center distance for ranking
                        center1_x = (box1['left'] + box1['right']) / 2
                        center1_y = (box1['top'] + box1['bottom']) / 2
                        center2_x = (box2['left'] + box2['right']) / 2
                        center2_y = (box2['top'] + box2['bottom']) / 2
                        center_distance = math.sqrt((center1_x - center2_x) ** 2 + (center1_y - center2_y) ** 2)
                        
                        # If boxes overlap, use a combination of multiple factors
                        if overlap_ratio > 0:
                            # 1. Normalize center distance by the diagonal of the mapped box
                            mapped_diag = math.sqrt((mapped_box['right'] - mapped_box['left']) ** 2 + 
                                                 (mapped_box['bottom'] - mapped_box['top']) ** 2)
                            norm_center_dist = center_distance / mapped_diag if mapped_diag > 0 else 0
                            
                            # 2. Calculate aspect ratio similarity
                            mapped_ar = (mapped_box['right'] - mapped_box['left']) / max(1, (mapped_box['bottom'] - mapped_box['top']))
                            box_ar = (box2['right'] - box2['left']) / max(1, (box2['bottom'] - box2['top']))
                            ar_similarity = 1 - (abs(mapped_ar - box_ar) / max(mapped_ar, box_ar))
                            
                            # 3. Position within mapped area (prefer boxes closer to the center)
                            mapped_center_x = (mapped_box['left'] + mapped_box['right']) / 2
                            mapped_center_y = (mapped_box['top'] + mapped_box['bottom']) / 2
                            box_center_x = (box2['left'] + box2['right']) / 2
                            box_center_y = (box2['top'] + box2['bottom']) / 2
                            
                            # Normalize position difference (0 to 1, where 0 is at center)
                            x_pos_ratio = abs(box_center_x - mapped_center_x) / max(1, (mapped_box['right'] - mapped_box['left']) / 2)
                            y_pos_ratio = abs(box_center_y - mapped_center_y) / max(1, (mapped_box['bottom'] - mapped_box['top']) / 2)
                            pos_score = 1 - ((x_pos_ratio + y_pos_ratio) / 2)  # 1 at center, decreasing towards edges
                            
                            # Combine all factors with weights
                            overlap_weight = 2
                            center_dist_weight = 0.2
                            pos_weight = 0.1  
                            
                            # Calculate score (higher is better)
                            score = (overlap_ratio * overlap_weight) + \
                                   ((1 - norm_center_dist) * center_dist_weight) + \
                                   (pos_score * pos_weight)
                            
                            return (score, overlap_ratio)
                        
                        # For non-overlapping boxes, use edge-to-edge distance (lower is better)
                        dx = max(0, max(box1['left'], box2['left']) - min(box1['right'], box2['right']))
                        dy = max(0, max(box1['top'], box2['top']) - min(box1['bottom'], box2['bottom']))
                        distance = math.sqrt(dx**2 + dy**2)
                        
                        # Normalize distance by the diagonal of the mapped box
                        mapped_diag = math.sqrt((mapped_box['right'] - mapped_box['left']) ** 2 + 
                                             (mapped_box['bottom'] - mapped_box['top']) ** 2)
                        normalized_distance = distance / mapped_diag if mapped_diag > 0 else 1.0
                        
                        # Convert to a score where higher is better
                        score = 1.0 / (1.0 + normalized_distance)
                        
                        return (score, 0.0)
                    
                    # Create expanded mapped box for intersection test
                    mapped_box = {
                        'left': mapped_left,
                        'top': mapped_top,
                        'right': mapped_right,
                        'bottom': mapped_bottom
                    }
                    
                    candidates = []
                    
                    for box in detected_boxes:
                        text = box["text"].strip()
                        
                        # Create a copy of the box with explicit coordinates for clarity
                        current_box = {
                            'left': box['left'],
                            'top': box['top'],
                            'right': box['left'] + box['width'],
                            'bottom': box['top'] + box['height']
                        }
                        
                        # Check if boxes intersect
                        if not boxes_intersect(mapped_box, current_box):
                            continue
                            
                        # Calculate distance and overlap between boxes
                        score, overlap_ratio = calculate_box_distance(mapped_box, current_box)
                        
                        # Try to parse the date
                        dt = parse_date_try(text)
                        
                        # Calculate box centers for reference
                   
                        box_center_x = (current_box['left'] + current_box['right']) / 2
                        box_center_y = (current_box['top'] + current_box['bottom']) / 2
                        
                  
                        candidates.append({
                            'score': score,
                            'overlap_ratio': overlap_ratio,
                            'box': box,
                            'text': text,
                            'date': dt,
                            'center_x': box_center_x,
                            'center_y': box_center_y
                        })
                    
                    # Sort candidates by score (descending - higher score is better)
                    if candidates:
                        candidates.sort(key=lambda x: -x['score'])
                        
                 
                    
                        best_match = candidates[0]
                     
                        
                        datefacturation_value = best_match['date'].strftime('%Y-%m-%d')  # normalized output
                        datefacturation_box = {
                            "left": best_match["box"]["left"],
                            "top": best_match["box"]["top"],
                            "width": best_match["box"]["width"],
                            "height": best_match["box"]["height"],
                        }
        except Exception as e:
            print(f"\n=== ERROR in dateFacturation extraction ===")
            print(f"Error type: {type(e).__name__}")
            print(f"Error message: {str(e)}")
            import traceback
            traceback.print_exc()
            

            if 'cursor' in locals() and cursor:
                try:
                    print(f"Cursor has results: {cursor.with_rows}")
                except:
                    print("Could not check cursor status")
        finally:
            # Clean up resources
            if 'cursor' in locals() and cursor:
                try:
                    # Consume any remaining results
                    while cursor.nextset():
                        pass
                except Exception as e:
                    print(f"Error consuming cursor results: {e}")
                try:
                    cursor.close()
                except Exception as e:
                    print(f"Error closing cursor: {e}")
                    
            if 'connection' in locals() and connection:
                try:
                    if getattr(connection, 'is_connected', lambda: False)():
                        connection.close()
                except Exception as e:
                    print(f"Error closing connection: {e}")

        # -------------------------
        # Prepare response
        # -------------------------
      
        result_data = {
            "montantHT": ht_extracted,
            "montantTVA": tva_extracted,
            "montantTTC": ttc_extracted,
            "tauxTVA": taux_tva,
            "numFacture": numfacture_value,
            "boxHT": {
                "left": ht_match['value_box']['left'],
                "top": ht_match['value_box']['top'],
                "width": ht_match['value_box']['width'],
                "height": ht_match['value_box']['height']
            },
            "boxTVA": {
                "left": tva_match['value_box']['left'],
                "top": tva_match['value_box']['top'],
                "width": tva_match['value_box']['width'],
                "height": tva_match['value_box']['height']
            },
            "boxNumFacture": numfacture_box,
            "boxNumFactureSearchArea": numfacture_search_area,
            "dateFacturation": datefacturation_value,
            "boxDateFacturation": datefacturation_box,
            "template_id": template_id,
            # Debug info
            "ht_match": {
                "search_area": ht_match.get('search_area'),
                "keyword_box": ht_match.get('keyword_box'),
                "value_box": ht_match.get('value_box')
            },
            "tva_match": {
                "search_area": tva_match.get('search_area'),
                "keyword_box": tva_match.get('keyword_box'),
                "value_box": tva_match.get('value_box')
            }
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


class CheckDuplicateRequest(BaseModel):
    """Request model for checking duplicate invoices"""
    invoices: List[Dict[str, Any]]


@app.post("/check-duplicate-invoices")
async def check_duplicate_invoices(
    request: CheckDuplicateRequest,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """
    Check if any of the provided invoices already exist in the database
    
    Returns:
        List of indices of duplicate invoices
    """
    try:
        facture_service = FactureService(db)
        duplicate_indices = await facture_service.check_duplicate_invoices(
            request.invoices, current_user["id"]
        )
        return {"duplicates": duplicate_indices}
    except Exception as e:
        logging.error(f"Error checking for duplicate invoices: {e}")
        return {"duplicates": []}


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
          
        else:
            data_to_use = extracted_data
          
        
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
