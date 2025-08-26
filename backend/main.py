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
from database.config import get_async_db, init_database, AsyncSessionLocal
from database.models import Base
from services.template_service import TemplateService
from services.facture_service import FactureService

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
    filename=r'C:\Users\wadii\Desktop\stage_emsi_evoleo\backend\invoice_debug.log',
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
    manual: Optional[bool] = False


class ManualInputField(BaseModel):
    """Represents a manually input field value."""
    manualValue: str
    isValid: Optional[bool] = True


class FieldMapping(BaseModel):
    """Mapping of field names to their coordinates."""
    field_map: Dict[str, Any]  # Can be FieldCoordinates or ManualInputField


class ExtractionResult(BaseModel):
    """Result of a document extraction process."""
    success: bool
    data: Dict[str, str]
    message: str


class SaveMappingRequest(BaseModel):
    template_id: str = "default"
    field_map: Dict[str, Any]  # Can be FieldCoordinates or ManualInputField


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
          
            pix = page.get_pixmap(matrix=fitz.Matrix(PDF_RENDER_SCALE, PDF_RENDER_SCALE))  # Increase resolution
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
        logging.error(f"Error generating PDF page previews: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating PDF page previews: {str(e)}")


@app.get("/load-mapping/{template_id}")
async def load_mapping(
    template_id: str,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)
):
    """Load field mappings from the database using ORM"""
    try:
        # Get the async session from the database dependency
        async with db as session:
            template_service = TemplateService(session)
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
        
        # Process the field map to handle both coordinate and manual input fields
        processed_map = {}
        for field_name, value in field_map.items():
            if value is not None:
                # Handle manual input fields (like fournisseur and serial)
                if isinstance(value, dict) and 'manualValue' in value:
                    processed_map[field_name] = value
                # Handle coordinate fields
                elif hasattr(value, 'get') and all(k in value for k in ['left', 'top', 'width', 'height']):
                    processed_map[field_name] = {
                        'left': value.get('left', 0),
                        'top': value.get('top', 0),
                        'width': value.get('width', 0),
                        'height': value.get('height', 0),
                        'manual': value.get('manual', False)
                    }
        
        print(f"Saving mapping for template: {template_id}")
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
            response = {
                "success": True,
                "boxes": detected_boxes,
                "width": img.width,
                "height": img.height,
                "image": f"data:image/jpeg;base64,{image_to_base64(img)}",
                "zone_ht_boxes": [{"text": box['text'], "score": box['score']} for box in zone_ht_boxes],
                "zone_tva_boxes": [{"text": box['text'], "score": box['score']} for box in zone_tva_boxes]
            }
            return response
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
   
    # Initialize field_map at the beginning
    field_map = {}
    
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
        
        # Helper function to find boxes within a zone
        def find_boxes_in_zone(boxes, zone_coords, min_overlap=0.5):
            if not zone_coords or 'left' not in zone_coords:
                return []
                
            zone_left = zone_coords.get('left', 0)
            zone_top = zone_coords.get('top', 0)
            zone_right = zone_left + zone_coords.get('width', 0)
            zone_bottom = zone_top + zone_coords.get('height', 0)
            
            zone_area = zone_coords.get('width', 0) * zone_coords.get('height', 0)
            if zone_area == 0:
                return []
                
            result_boxes = []
            
            for box in boxes:
                box_left = box['left']
                box_top = box['top']
                box_right = box['right']
                box_bottom = box['bottom']
                
                # Calculate intersection
                inter_left = max(zone_left, box_left)
                inter_top = max(zone_top, box_top)
                inter_right = min(zone_right, box_right)
                inter_bottom = min(zone_bottom, box_bottom)
                
                if inter_right <= inter_left or inter_bottom <= inter_top:
                    continue  # No overlap
                    
                inter_area = (inter_right - inter_left) * (inter_bottom - inter_top)
                box_area = (box_right - box_left) * (box_bottom - box_top)
                
                # Calculate overlap ratio
                overlap_ratio = inter_area / box_area if box_area > 0 else 0
                
                if overlap_ratio >= min_overlap:
                    result_boxes.append(box)
            
            # Sort boxes by Y position (top to bottom) and then X position (left to right)
            result_boxes.sort(key=lambda b: (b['top'], b['left']))
            return result_boxes
        
        # Get template mappings if template_id is provided
        zone_ht_boxes = []
        zone_tva_boxes = []
        
        if template_id:
            try:
                print(f"[DEBUG] Loading template with ID: {template_id}")
                # Get the database session
                async with AsyncSessionLocal() as session:
                    try:
                        template_service = TemplateService(session)
                        template_response = await template_service.load_mapping(template_id)
                        await session.commit()
                    except Exception as e:
                        await session.rollback()
                        raise e
                
                print(f"[DEBUG] Template response type: {type(template_response)}")
                print(f"[DEBUG] Template response content: {json.dumps(template_response, default=str, indent=2)}")
                
                if template_response and template_response.get('status') == 'success':
                    # Get the mappings from the response
                    mappings = template_response.get('mappings', {})
                    print(f"[DEBUG] Mappings type: {type(mappings)}")
                    print(f"[DEBUG] Mappings content: {json.dumps(mappings, default=str, indent=2)}")
                    
                    # Extract field map correctly
                    if mappings and isinstance(mappings, dict):
                        # Get the first mapping (assuming it's the correct one)
                        field_map = list(mappings.values())[0] if mappings else {}
                        
                        print(f"[DEBUG] Field map: {json.dumps(field_map, default=str, indent=2)}")
                        print(f"[DEBUG] Field map keys: {list(field_map.keys())}")
                        
                        # Process zone_ht
                        if 'zone_ht' in field_map and field_map['zone_ht']:
                            zone_ht_coords = field_map['zone_ht']
                            print(f"[DEBUG] zone_ht coordinates: {zone_ht_coords}")
                            print(f"[DEBUG] Type of zone_ht_coords: {type(zone_ht_coords)}")
                            
                            if isinstance(zone_ht_coords, dict) and all(k in zone_ht_coords for k in ['left', 'top', 'width', 'height']):
                                zone_ht_boxes = find_boxes_in_zone(detected_boxes, zone_ht_coords)
                                print(f"[DEBUG] Found {len(zone_ht_boxes)} boxes in zone_ht")
                            else:
                                print(f"[ERROR] Invalid zone_ht coordinates: {zone_ht_coords}")
                        else:
                            print("[DEBUG] zone_ht not found in template or has no coordinates")
                    
                    # Process zone_tva
                    if 'zone_tva' in field_map and field_map['zone_tva']:
                        zone_tva_coords = field_map['zone_tva']
                        print(f"[DEBUG] zone_tva coordinates: {zone_tva_coords}")
                        print(f"[DEBUG] Type of zone_tva_coords: {type(zone_tva_coords)}")
                        
                        if isinstance(zone_tva_coords, dict) and all(k in zone_tva_coords for k in ['left', 'top', 'width', 'height']):
                            zone_tva_boxes = find_boxes_in_zone(detected_boxes, zone_tva_coords)
                            print(f"[DEBUG] Found {len(zone_tva_boxes)} boxes in zone_tva")
                            for i, box in enumerate(zone_tva_boxes):
                                print(f"[DEBUG] zone_tva box {i+1}: {box['text']} (conf: {box.get('score', 'N/A')})")
                        else:
                            print(f"[ERROR] Invalid zone_tva coordinates: {zone_tva_coords}")
                    else:
                        print("[DEBUG] zone_tva not found in template or has no coordinates")
                        print("[DEBUG] zone_tva not found in template or has no coordinates")
            except Exception as e:
                error_msg = f"Error processing template zones: {str(e)}"
                print(f"[ERROR] {error_msg}")
                logging.warning(error_msg, exc_info=True)
                
        print(f"[DEBUG] Final zone_ht_boxes count: {len(zone_ht_boxes)}")
        print(f"[DEBUG] Final zone_tva_boxes count: {len(zone_tva_boxes)}")


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
        def calculate_overlap_area(box1, box2):
            """Calculate the overlap area between two boxes."""
            x_overlap = max(0, min(box1['right'], box2['right']) - max(box1['left'], box2['left']))
            y_overlap = max(0, min(box1['bottom'], box2['bottom']) - max(box1['top'], box2['top']))
            return x_overlap * y_overlap

        def find_value_for_field(keyword_test_fn, is_tva=False, field_name=""):
            """
            Returns dict with keys: value (float), value_text, value_box, keyword_box, distance, search_type, is_total_keyword
            
            Search Logic:
            1. Expand the keyword box horizontally to the right (300px) to create a search area
            2. Find all boxes that overlap with this expanded area
            3. Filter out non-numeric boxes and apply TVA filters
            4. Select the box with maximum overlap with the search area
            5. If no matches, fall back to vertical search
            """
            # print(f"\n{'='*40}")
            # print(f"Searching for field: {field_name}")
            # print(f"Using keyword test function: {keyword_test_fn.__name__}")
            # print("-"*40)
            
            keywords = [b for b in detected_boxes if keyword_test_fn(b['text'])]
            
            # print(f"Found {len(keywords)} potential keywords:")
            # for i, kw in enumerate(keywords, 1):
            #     print(f"  {i}. '{kw['text']}' (score: {kw['score']:.2f}) at ({kw['center_x']:.1f}, {kw['center_y']:.1f})")
            
            if not keywords:
                # print("No matching keywords found!")
                return None

            total_kw = [k for k in keywords if is_total_keyword(k['text'])]
            other_kw = [k for k in keywords if k not in total_kw]

            # Process a set of keywords (list), return best match or None
            def process_keyword_set(klist, search_type='horizontal'):
                candidates = []
                
                for kw in klist:
                    if search_type == 'horizontal':
                        # Calculate expanded search area 
                        vertical_padding = -5  # Add some vertical padding
                        search_area = {
                            'left': kw['left'],
                            'top': kw['top'] - vertical_padding,  # Expand vertically
                            'right': kw['right'] + 450,  # Expand  to the right
                            'bottom': kw['bottom'] + vertical_padding,  # Expand vertically
                            'width': kw['width'] + 450,
                            'height': kw['height'] + (2 * vertical_padding)
                        }
                        
                        # Print search area header (commented out)
                        # print(f"\n{'='*60}")
                        # print(f"🔍 SEARCHING FOR {'HT' if not is_tva else 'TVA'}")
                        # print("="*60)
                        # print(f"Mapped box (expanded): left={search_area['left']:.1f}, top={search_area['top']:.1f}, right={search_area['right']:.1f}, bottom={search_area['bottom']:.1f}")
                        
                        # Find all boxes that overlap with the search area
                        potential_boxes = []
                        for ob in detected_boxes:
                            if ob is kw:  # Skip the keyword itself
                                continue
                                
                            # Calculate distance from keyword to box
                            box_center_x = (ob['left'] + ob['right']) / 2
                            box_center_y = (ob['top'] + ob['bottom']) / 2
                            
                            # Calculate distance from keyword right edge to box center
                            kw_right = kw['right']
                            kw_center_y = (kw['top'] + kw['bottom']) / 2
                            
                            # Distance from keyword right to box center
                            dx = box_center_x - kw_right
                            dy = box_center_y - kw_center_y
                            distance = (dx**2 + dy**2) ** 0.5
                            
                            # Check if box is to the right of the keyword and within vertical range
                            is_to_right = ob['left'] > kw['right']
                            is_in_vertical_range = (
                                ob['bottom'] > search_area['top'] and 
                                ob['top'] < search_area['bottom']
                            )
                            
                            if is_to_right and is_in_vertical_range:
                                overlap_area = calculate_overlap_area(search_area, ob)
                                potential_boxes.append((ob, overlap_area, distance))
                        
                        # Process potential matches
                        for ob, overlap_area, distance in potential_boxes:
                            # Skip non-numeric boxes
                            val = extract_number(ob['text'])
                            if val is None:
                                continue
                                
                            # Skip TVA boxes with %
                            if is_tva and '%' in ob['text']:
                                continue
                            
                            # Calculate overlap percentage
                            value_box_area = (ob['right'] - ob['left']) * (ob['bottom'] - ob['top'])
                            overlap_pct = (overlap_area / value_box_area) * 100 if value_box_area > 0 else 0
                            
                            # Calculate score with max horizontal distance of 400px
                            max_horizontal_distance = 600
                            distance_score = 1 - min(distance / max_horizontal_distance, 1) 
                            
                            # Combine scores (60% overlap, 40% distance)
                            score = (overlap_pct/100 * 0.6) + (distance_score * 0.4)
                            
                            # Print detailed match info (commented out)
                            # print(f"\nText: '{ob['text']}'")
                            # print(f"  Box: ({ob['left']:.0f},{ob['top']:.0f}) to ({ob['right']:.0f},{ob['bottom']:.0f})")
                            # print(f"  Center: ({box_center_x:.0f}, {box_center_y:.0f}) | Keyword right: ({kw_right:.0f}, {kw_center_y:.0f})")
                            # print(f"  Overlap: {overlap_pct:.1f}% | Distance from keyword: {distance:.1f}px | Score: {score:.6f}")
                            
                            candidates.append({
                                'keyword_box': kw,
                                'value_box': ob,
                                'value': val,
                                'value_text': ob['text'],
                                'keyword_text': kw['text'],
                                'distance': distance,
                                'search_type': search_type,
                                'is_total_keyword': is_total_keyword(kw['text']),
                                'search_area': search_area,
                                'score': score,
                                'overlap_pct': overlap_pct
                            })
                        
                        if not candidates:
                            print("\n❌ NO VALID MATCHES FOUND")
                        else:
                            # Sort by score (descending)
                            candidates.sort(key=lambda c: -c['score'])
                            
                            # print("\n" + "="*60)
                            # print("🏆 CANDIDATE SELECTION SUMMARY")
                            # print("="*60)
                            # print(f"Found {len(candidates)} valid candidates")
                            # print("\nTop 3 candidates:")
                            # for i, c in enumerate(candidates[:3], 1):
                            #     print(f"{i}. '{c['value_text']}' | {c['overlap_pct']:.1f}% overlap | Score: {c['score']:.6f}")
                            
                            best_match = candidates[0]
                            # print("\n" + "-"*60)
                            # print(f"🏆 SELECTED: '{best_match['value_text']}'")
                            # print(f"   - Overlap: {best_match['overlap_pct']:.1f}%")
                            # print(f"   - Score: {best_match['score']:.6f}")
                            # print(f"   - Position: ({best_match['value_box']['center_x']:.0f}, {best_match['value_box']['center_y']:.0f})")
                    
                    else:  # vertical search
                        # Calculate expanded search area 
                        horizontal_padding = 20  # Add some horizontal padding
                        search_area = {
                            'left': kw['left'] - horizontal_padding,  # Expand horizontally
                            'top': kw['bottom'],  # Start from bottom of keyword
                            'right': kw['right'] + horizontal_padding,  # Expand horizontally
                            'bottom': kw['bottom'] + 50,  # Expand downward
                            'width': kw['width'] + (2 * horizontal_padding),
                            'height': 50
                        }
                        
                        # Print search area header (commented out)
                        # print(f"\n{'='*60}")
                        # print(f"🔍 VERTICAL SEARCH FOR {'HT' if not is_tva else 'TVA'}")
                        # print("="*60)
                        # print(f"Mapped box (expanded): left={search_area['left']:.1f}, top={search_area['top']:.1f}, right={search_area['right']:.1f}, bottom={search_area['bottom']:.1f}")
                        
                        # Find all boxes that overlap with the search area
                        potential_boxes = []
                        for ob in detected_boxes:
                            if ob is kw:  # Skip the keyword itself
                                continue
                                
                            # Check if box is below the keyword and within horizontal range
                            is_below = ob['top'] > kw['bottom']
                            is_in_horizontal_range = (
                                ob['right'] > search_area['left'] and 
                                ob['left'] < search_area['right']
                            )
                            
                            if is_below and is_in_horizontal_range:
                                overlap_area = calculate_overlap_area(search_area, ob)
                                if overlap_area > 0:
                                    # Calculate distance from keyword to box
                                    box_center_x = (ob['left'] + ob['right']) / 2
                                    box_center_y = (ob['top'] + ob['bottom']) / 2
                                    
                                    # Calculate horizontal distance from keyword center
                                    kw_center_x = (kw['left'] + kw['right']) / 2
                                    kw_bottom = kw['bottom']
                                    
                                    # Distance from keyword bottom to box center
                                    dx = box_center_x - kw_center_x
                                    dy = box_center_y - kw_bottom
                                    distance = (dx**2 + dy**2) ** 0.5
                                    
                                    potential_boxes.append((ob, overlap_area, distance))
                        
                        # Process potential matches
                        for ob, overlap_area, distance in potential_boxes:
                            # Skip non-numeric boxes
                            val = extract_number(ob['text'])
                            if val is None:
                                continue
                                
                            # Skip TVA boxes with %
                            if is_tva and '%' in ob['text']:
                                continue
                            
                            # Calculate overlap percentage
                            value_box_area = (ob['right'] - ob['left']) * (ob['bottom'] - ob['top'])
                            overlap_pct = (overlap_area / value_box_area) * 100 if value_box_area > 0 else 0
                            
                            # Calculate score with max vertical distance of 400px
                            max_vertical_distance = 400
                            distance_score = 1 - min(distance / max_vertical_distance, 1)  
                            
                            # Combine scores (60% overlap, 40% distance)
                            score = (overlap_pct/100 * 0.6) + (distance_score * 0.4)
                            
                            # Print detailed match info (commented out)
                            # print(f"\nText: '{ob['text']}'")
                            # print(f"  Box: ({ob['left']:.0f},{ob['top']:.0f}) to ({ob['right']:.0f},{ob['bottom']:.0f})")
                            # print(f"  Center: ({box_center_x:.0f}, {box_center_y:.0f}) | Keyword right: ({kw_center_x:.0f}, {kw_bottom:.0f})")
                            # print(f"  Overlap: {overlap_pct:.1f}% | Distance from keyword: {distance:.1f}px | Score: {score:.6f}")
                            
                            candidates.append({
                                'keyword_box': kw,
                                'value_box': ob,
                                'value': val,
                                'value_text': ob['text'],
                                'keyword_text': kw['text'],
                                'distance': distance,
                                'search_type': 'vertical',
                                'is_total_keyword': is_total_keyword(kw['text']),
                                'search_area': search_area,
                                'score': score,
                                'overlap_pct': overlap_pct
                            })
                
                if not candidates:
                    return None
                    
                # Sort candidates by score (highest first), then by whether they're from a TOTAL keyword
                candidates.sort(key=lambda c: (-c['score'], 0 if c['is_total_keyword'] else 1))
                
                # If we have any candidates from TOTAL keywords, return the highest scoring one
                total_candidates = [c for c in candidates if c['is_total_keyword']]
                if total_candidates:
                    #print(f"\n🏆 SELECTED FROM TOTAL KEYWORDS: '{total_candidates[0]['value_text']}' (Score: {total_candidates[0]['score']:.6f})")
                    return total_candidates[0]
                    
                # Otherwise return the highest scoring candidate overall
                if candidates:
                    return candidates[0]
                    
                return None
            # First, try horizontal search for TOTAL keywords
            if total_kw:
                #print("\nTrying horizontal search for TOTAL keywords...")
                result = process_keyword_set(total_kw, 'horizontal')
                if result:
                   # print(f"Found match from TOTAL keyword: {result['value_text']}")
                    return result
            
            # Then try horizontal search for other keywords
            if other_kw:
              #  print("\nTrying horizontal search for other keywords...")
                result = process_keyword_set(other_kw, 'horizontal')
                if result:
                  #  print(f"Found match from other keyword: {result['value_text']}")
                    return result
            
            # If no horizontal matches found, try vertical search as fallback
           # print("\nNo horizontal matches found, trying vertical search...")
            
            # First try vertical search with TOTAL keywords
            if total_kw:
                print("Trying vertical search for TOTAL keywords...")
                result = process_keyword_set(total_kw, 'vertical')
                if result:
                   # print(f"Found vertical match from TOTAL keyword: {result['value_text']}")
                    return result
            
            # Finally, try vertical search with other keywords
            if other_kw:
               # print("Trying vertical search for other keywords...")
                result = process_keyword_set(other_kw, 'vertical')
                if result:
                   # print(f"Found vertical match from other keyword: {result['value_text']}")
                    return result
            
           # print("No matching values found in any search direction")
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
                                        "manual": False
                                    }
                                    # Update ht_match with the found coordinates
                                    ht_match['value_box'].update({
                                        'left': float(box['left']),
                                        'top': float(box['top']),
                                        'width': float(box['width']),
                                        'height': float(box['height'])
                                    })
                    
                    if not best_match:
                        print("\n=== DEBUG: No valid HT value found in mapped area ===")
                        print(f"Best score achieved: {best_score}")
                        print(f"Number of boxes checked: {len(detected_boxes)}")
                        print(f"Mapped box area: {mapped_box}")
                        print("Potential issues:")
                        print("1. No boxes with numeric values found in the mapped area")
                        print("2. Boxes found but overlap ratio too low (needs >30%)")
                        print("3. OCR might not have detected text in this area")
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
                                        "manual": False
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
        # print("\n" + "="*60)
        # print("🧮 CALCULATING TTC AND TVA RATE")
        # print("="*60)
        
        ttc_extracted = round(ht_extracted + tva_extracted, 2)
       # print(f"HT: {ht_extracted:.2f} + TVA: {tva_extracted:.2f} = TTC: {ttc_extracted:.2f}")
        
        if ht_extracted != 0:
            raw_taux = (tva_extracted * 100.0) / ht_extracted
            # Round to nearest integer (0.5 rounds up)
            taux_tva = int(round(raw_taux))
            #print(f"Raw TVA rate: {raw_taux:.2f}% -> Rounded to: {taux_tva}%")
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

                    def calculate_invoice_score(text):
                        digit_count = len(re.findall(r'\d', text))
                        max_consecutive = max((len(m) for m in re.findall(r'\d+', text)), default=0)
                        pattern_bonus = 2 if re.search(r'(n[°º]|no|num|ref|facture)\s*\d', text.lower()) else 0
                        return digit_count + max_consecutive + pattern_bonus

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
                        
                      #  print(f"\nText: '{text}'")
                      #  print(f"  Box: ({current_box['left']:.0f},{current_box['top']:.0f}) to ({current_box['right']:.0f},{current_box['bottom']:.0f})")
                      #  print(f"  Center: ({box_center_x:.0f}, {box_center_y:.0f}) | Mapped center: ({mapped_center_x:.0f}, {mapped_center_y:.0f})")
                      #  print(f"  Valid format: {'✅' if is_valid else '❌'}")
                      #  if overlap_ratio > 0:
                       #     print(f"  Overlap: {overlap_ratio*100:.1f}% | Score: {distance:.10f}")
                        #else:
                         #   print(f"  Edge distance: {distance:.1f} px")
                        
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
                        
                     #   print("\n" + "="*60)
                     #   print("🏆 CANDIDATE SELECTION SUMMARY")
                     #   print("="*60)
                     #   print(f"Found {len(candidates)} valid candidates")
                     #   print("\nTop 3 candidates:")
                        for i, cand in enumerate(candidates[:3], 1):
                            overlap_info = f"{cand['overlap_ratio']*100:.1f}% overlap" if cand['overlap_ratio'] > 0 else "no overlap"
                       #     print(f"{i}. '{cand['text']}' | {overlap_info} | Score: {cand['distance']:.10f}")
                        
                      #  print("\n" + "-"*60)
                      #  print(f"🏆 SELECTED: '{best_match['text'].strip()}'")
                      #  print(f"   - Overlap: {best_match['overlap_ratio']*100:.1f}%" if best_match['overlap_ratio'] > 0 else "   - No overlap")
                      #  print(f"   - Score: {best_match['distance']:.10f}")
                      #  print(f"   - Position: ({best_match['center_x']:.0f}, {best_match['center_y']:.0f})")
                        
                        # Only process best_match if we found valid candidates
                        numfacture_value = best_match["text"].strip()
                        numfacture_box = {
                            "left": best_match["box"]["left"],
                            "top": best_match["box"]["top"],
                            "width": best_match["box"]["width"],
                            "height": best_match["box"]["height"],
                            "manual": False
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
        #print("\n" + "="*60)
        #print("📅 EXTRACTING INVOICE DATE")
        #print("="*60)
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
                        
                    #    print(f"\nText: '{text}'")
                     #   print(f"  Box: ({current_box['left']:.0f},{current_box['top']:.0f}) to ({current_box['right']:.0f},{current_box['bottom']:.0f})")
                      #  print(f"  Center: ({box_center_x:.0f}, {box_center_y:.0f}) | Mapped center: ({mapped_center_x:.0f}, {mapped_center_y:.0f})")
                        
                     
                       # print(f"  ✅ Parsed date: {dt}")
                        
                       # if overlap_ratio > 0:
                       #     print(f"  Overlap: {overlap_ratio*100:.1f}% | Score: {score:.4f}")
                       # else:
                       #     print(f"  Edge distance score: {score:.4f}")
                        
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
                        
                     #   print("\n" + "="*60)
                     #   print("🏆 DATE CANDIDATE SELECTION SUMMARY")
                     #   print("="*60)
                     #   print(f"Found {len(candidates)} valid date candidates")
                     #   print("\nTop 3 candidates:")
                        for i, cand in enumerate(candidates[:3], 1):
                            overlap_info = f"{cand['overlap_ratio']*100:.1f}% overlap" if cand['overlap_ratio'] > 0 else "no overlap"
                           #print(f"{i}. '{cand['text']}' | {cand['date']} | {overlap_info} | Score: {cand['score']:.4f}")
                        
                        best_match = candidates[0]
                      #  print("\n" + "-"*60)
                      #  print(f"🏆 SELECTED: '{best_match['text'].strip()}'")
                      #  print(f"   - Date: {best_match['date']}")
                      #  if best_match['overlap_ratio'] > 0:
                      #      print(f"   - Overlap: {best_match['overlap_ratio']*100:.1f}%")
                      #  print(f"   - Score: {best_match['score']:.4f}")
                      #  print(f"   - Position: ({best_match['center_x']:.0f}, {best_match['center_y']:.0f})")
                        
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
            
            # Log the current state of variables
            print("\n=== DEBUG: dateFacturation extraction state ===")
            print(f"Template ID: {template_id}")
            print(f"Connection active: {'connection' in locals() and connection and getattr(connection, 'is_connected', lambda: False)()}")
            print(f"Cursor exists: {'cursor' in locals() and cursor is not None}")
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
       # print("\n" + "="*60)
       # print(" EXTRACTION SUMMARY")
       # print("📊 EXTRACTION SUMMARY")
       # print("="*60)
       # print(f"📄 Invoice Number: {numfacture_value} (took {num_facture_time:.4f}s)")
       # print(f"📅 Invoice Date: {datefacturation_value} (took {datefacturation_time:.4f}s)")
       # print(f"💰 HT: {ht_extracted:.2f} (took {ht_time:.4f}s)")
       # print(f"💸 TVA: {tva_extracted:.2f} (took {tva_time:.4f}s)")
       # print(f"💵 TTC: {ttc_extracted:.2f} (calculated)")
        # Get zone mappings from field_map if available
        zone_HT_mapping = {}
        zone_tva_mapping = {}
        
        if field_map:
            if 'zone_ht' in field_map and field_map['zone_ht']:
                zone_HT_mapping = {
                    'left': field_map['zone_ht'].get('left', 0),
                    'top': field_map['zone_ht'].get('top', 0),
                    'width': field_map['zone_ht'].get('width', 0),
                    'height': field_map['zone_ht'].get('height', 0)
                }
            if 'zone_tva' in field_map and field_map['zone_tva']:
                zone_tva_mapping = {
                    'left': field_map['zone_tva'].get('left', 0),
                    'top': field_map['zone_tva'].get('top', 0),
                    'width': field_map['zone_tva'].get('width', 0),
                    'height': field_map['zone_tva'].get('height', 0)
                }

        # Prepare response with extracted data
        result_data = {
            "montantHT": float(ht_extracted) if ht_extracted is not None else None,
            "montantTVA": float(tva_extracted) if tva_extracted is not None else None,
            "montantTTC": float(ttc_extracted) if ttc_extracted is not None else None,
            "tauxTVA": float(taux_tva) if taux_tva is not None else None,
            "numFacture": numfacture_value,
            "boxHT": {
                "left": ht_match['value_box'].get('left', 0),
                "top": ht_match['value_box'].get('top', 0),
                "width": ht_match['value_box'].get('width', 0),
                "height": ht_match['value_box'].get('height', 0)
            },
            "boxTVA": {
                "left": tva_match['value_box'].get('left', 0),
                "top": tva_match['value_box'].get('top', 0),
                "width": tva_match['value_box'].get('width', 0),
                "height": tva_match['value_box'].get('height', 0)
            },
            "boxNumFacture": numfacture_box or {},
            "boxNumFactureSearchArea": numfacture_search_area or {},
            "dateFacturation": datefacturation_value,
            "boxDateFacturation": datefacturation_box or {},
            "template_id": template_id,
            "zone_HT_mapping": zone_HT_mapping,
            "zone_tva_mapping": zone_tva_mapping
        }
        
        # Add zone boxes to the response
        response_data = {
            "success": True,
            "data": result_data,
            "message": "Extraction réussie",
            "zone_results": {
                "zone_ht_boxes": zone_ht_boxes,
                "zone_tva_boxes": zone_tva_boxes
            }
        }
        return response_data

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
