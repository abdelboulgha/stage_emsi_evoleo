from database.models import SousValeurs
from sqlalchemy.future import select
# Endpoint to fetch sous_valeurs for a given facture_id
from fastapi import Query
# Standard library imports
import base64
import json
import logging
import os
import re
import time
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List, Optional
import math

# Third-party imports
import dbf
import numpy as np
import pymupdf as fitz
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from paddleocr import PaddleOCR
from PIL import Image, ImageOps
from pydantic import BaseModel

# Database and ORM imports
from database.config import get_async_db, AsyncSessionLocal
from database.init_db import init_database
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
    filename='invoice_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(message)s',
    force=True
)

# Initialize database

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



class SousValeurCreate(BaseModel):
    """Model for creating sous_valeur data"""
    id: int | None = None  # Optional for update
    HT: float
    TVA: float
    TTC: float

class InvoiceUpdate(BaseModel):
    """Model for updating invoice data"""
    fournisseur: Optional[str] = None
    numFacture: Optional[str] = None
    dateFacturation: Optional[str] = None
    tauxTVA: Optional[float] = None
    montantHT: Optional[float] = None
    montantTVA: Optional[float] = None
    montantTTC: Optional[float] = None
    sous_valeurs: Optional[List[SousValeurCreate]] = None  

class InvoiceCreate(BaseModel):
    """Model for creating facture data"""
    fournisseur: str
    numFacture: str
    dateFacturation: str  # Changed from date to str for flexibility
    tauxTVA: float  
    montantHT: float
    montantTVA: float  
    montantTTC: float
    sous_valeurs: List[SousValeurCreate] = []  # List de sous_valeurs


class InvoiceResponse(BaseModel):
    """Model for facture response"""
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


def standardize_image_dimensions(img: Image.Image, target_width: int = 1191, target_height: int = 1684) -> Image.Image:
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
            # Standardize the image dimensions
            img = standardize_image_dimensions(img)
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
    """Update an invoice and its sous_valeurs using ORM"""
    try:

        logging.debug(f"[DEBUG] update_facture called for facture_id={facture_id}")
        facture_service = FactureService(db)
        update_data = invoice_update.dict(exclude_unset=True)
    
        logging.debug(f"[DEBUG] update_data before sous_valeurs pop: {update_data}")

        # Check for sous_valeurs in the update payload
        sous_valeurs_update = update_data.pop("sous_valeurs", None)
    
        logging.debug(f"[DEBUG] sous_valeurs_update: {sous_valeurs_update}")
        result = await facture_service.update_facture(facture_id, update_data, current_user["id"])
    
        logging.debug(f"[DEBUG] result from facture_service.update_facture: {result}")

        # If sous_valeurs are provided, update only those with matching id
        if sous_valeurs_update is not None:
            
            logging.debug(f"[DEBUG] Updating sous_valeurs for facture_id={facture_id}")
            from sqlalchemy import update as sqlalchemy_update
            # Fetch existing sous_valeurs for this facture
            existing_result = await db.execute(select(SousValeurs).where(SousValeurs.facture_id == facture_id))
            existing_svs = {sv.id: sv for sv in existing_result.scalars().all()}

            # Only update sous_valeurs with matching id
            for sv in sous_valeurs_update:
                sv_id = sv.get("id")
                if not sv_id:
                   
                    logging.warning(f"[WARNING] sous_valeur update payload missing 'id': {sv}")
                    continue
                if sv_id in existing_svs:
                    
                    logging.debug(f"[DEBUG] Updating sous_valeur id={sv_id} with {sv}")
                    await db.execute(
                        sqlalchemy_update(SousValeurs)
                        .where(SousValeurs.id == sv_id)
                        .values(HT=sv["HT"], TVA=sv["TVA"], TTC=sv["TTC"])
                    )
            await db.commit()
            
            logging.debug(f"[DEBUG] sous_valeurs updated in DB")
            result["sous_valeurs_updated"] = True
    
        logging.debug(f"[DEBUG] Returning result: {result}")
        return result
    except Exception as e:
        print(f"[ERROR] Error updating invoice: {e}")
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
# -------------------------
# Date parsing function for extraction
# -------------------------
def parse_date_try(text: str):
    """
    Try to parse a date from a string using multiple formats and heuristics.
    Returns the date as a string in YYYY-MM-DD format if successful, else None.
    """
    import re
    from datetime import datetime
    if not text:
        return None
    # Remove unwanted characters
    cleaned = re.sub(r'[^\dA-Za-zÀ-ÿ/\-.]', '', text)
    # Common date formats
    date_formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d",
        "%d.%m.%Y", "%d %m %Y", "%d %b %Y", "%d %B %Y",
        "%d/%m/%y", "%d-%m-%y", "%Y%m%d", "%d%m%Y"
    ]
    # Try direct parsing
    for fmt in date_formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    # Try to extract date-like substrings
    date_regexes = [
        r'(\d{2}[/-]\d{2}[/-]\d{4})',
        r'(\d{4}[/-]\d{2}[/-]\d{2})',
        r'(\d{2}[/-]\d{2}[/-]\d{2})',
        r'(\d{8})',
        r'(\d{2}\.\d{2}\.\d{4})',
        r'(\d{1,2}[/-]\d{4})',  # mm/yyyy or m/yyyy
    ]
    for regex in date_regexes:
        match = re.search(regex, cleaned)
        if match:
            date_str = match.group(1)
            # Special handling for mm/yyyy or m/yyyy
            if re.fullmatch(r'\d{1,2}[/-]\d{4}', date_str):
                # Convert to 01/mm/yyyy
                parts = re.split(r'[/-]', date_str)
                month = parts[0].zfill(2)
                year = parts[1]
                return f"{year}-{month}-01"
            for fmt in date_formats:
                try:
                    dt = datetime.strptime(date_str, fmt)
                    return dt.strftime("%Y-%m-%d")
                except Exception:
                    continue
    return None
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
   
    MIN_CONFIDENCE = 0.8
   
    # Initialize field_map at the beginning
    field_map = {}
    
    try:
      
        file_content = await file.read()
      
        
        if file.filename and file.filename.lower().endswith('.pdf'):
          
            images = process_pdf_to_images(file_content)
            img = images[0] if images else None
           
        elif file.filename and file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
       
            try:
                img = Image.open(BytesIO(file_content)).convert('RGB')
             
                
                # Standardize the image dimensions
                img = standardize_image_dimensions(img)
              
                
            except Exception as e:
              
                raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")
        else:
            error_msg = f"Unsupported file type: {file.filename}"
           
            raise HTTPException(status_code=400, detail=error_msg)

        if img is None:
            error_msg = "No image available for extraction"
           
            raise HTTPException(status_code=400, detail=error_msg)
            
   
        img_array = np.array(img)
        result = ocr.predict(img_array)

        # --- Build detected_boxes with consistent keys ---
        detected_boxes = []
  
        
        for i, res in enumerate(result):
            rec_polys = res.get('rec_polys', [])
            rec_texts = res.get('rec_texts', [])
            rec_scores = res.get('rec_scores', [])
        
            
            for j, (poly, text, score) in enumerate(zip(rec_polys, rec_texts, rec_scores)):
                if score is None or score < MIN_CONFIDENCE or not text or not text.strip():
                    if j < 5:  
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
            
                    'text': text.strip(),
                    
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
             
                # Get the database session
                async with AsyncSessionLocal() as session:
                    try:
                        template_service = TemplateService(session)
                        template_response = await template_service.load_mapping(template_id)
                        await session.commit()
                    except Exception as e:
                        await session.rollback()
                        raise e
                
           
                
                if template_response and template_response.get('status') == 'success':
                    # Get the mappings from the response
                    mappings = template_response.get('mappings', {})
                   
                    
                    # Extract field map correctly
                    if mappings and isinstance(mappings, dict):
                        # Get the first mapping (assuming it's the correct one)
                        field_map = list(mappings.values())[0] if mappings else {}
                        
                      
                        
                        # Process zone_ht
                        if 'zone_ht' in field_map and field_map['zone_ht']:
                            zone_ht_coords = field_map['zone_ht']
                         
                            
                            if isinstance(zone_ht_coords, dict) and all(k in zone_ht_coords for k in ['left', 'top', 'width', 'height']):
                                zone_ht_boxes = find_boxes_in_zone(detected_boxes, zone_ht_coords)
                               
                    
                    # Process zone_tva
                    if 'zone_tva' in field_map and field_map['zone_tva']:
                        zone_tva_coords = field_map['zone_tva']
                     
                        
                        if isinstance(zone_tva_coords, dict) and all(k in zone_tva_coords for k in ['left', 'top', 'width', 'height']):
                            zone_tva_boxes = find_boxes_in_zone(detected_boxes, zone_tva_coords)
                         
            except Exception as e:
                error_msg = f"Error processing template zones: {str(e)}"
                print(f"[ERROR] {error_msg}")
                logging.warning(error_msg, exc_info=True)
                
    


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
        # Candidate search function
        # -------------------------
        def calculate_overlap_area(box1, box2):
            """Calculate the overlap area between two boxes."""
            x_overlap = max(0, min(box1['right'], box2['right']) - max(box1['left'], box2['left']))
            y_overlap = max(0, min(box1['bottom'], box2['bottom']) - max(box1['top'], box2['top']))
            return x_overlap * y_overlap

        



        # -------------------------
        # Generic field extraction function
        # -------------------------
        def extract_field_by_mapping(field_db_name, template_id, detected_boxes, extract_value_fn, expand_x=10, expand_y=5, box_filter_fn=None):
            extracted_value = None
            box_info = None
            match_info = {'value_box': {'left': 0, 'top': 0, 'width': 0, 'height': 0}}
            try:
              
                connection = get_connection()
                cursor = connection.cursor(dictionary=True)
                cursor.execute(f"SELECT id FROM field_name WHERE name = %s", (field_db_name,))
                row = cursor.fetchone()
             
                if row:
                    field_id = row['id']
                    cursor.execute("""
                        SELECT `left`, `top`, `width`, `height`
                        FROM Mappings
                        WHERE template_id = %s AND field_id = %s
                        LIMIT 1
                    """, (template_id, field_id))
                    mapping = cursor.fetchone()
             
                    if mapping:
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
                    
                        best_match = None
                        best_score = -1
                       
                        # Consider boxes as candidates if they overlap at all with the search area
                        candidate_boxes = []
                        for box in detected_boxes:
                            current_box = {
                                'left': box['left'],
                                'top': box['top'],
                                'right': box['left'] + box['width'],
                                'bottom': box['top'] + box['height']
                            }
                            # Check if box overlaps with the expanded search area
                            x_overlap = max(0, min(mapped_box['right'], current_box['right']) - max(mapped_box['left'], current_box['left']))
                            y_overlap = max(0, min(mapped_box['bottom'], current_box['bottom']) - max(mapped_box['top'], current_box['top']))
                            overlap_area = x_overlap * y_overlap
                            if overlap_area > 0:
                                candidate_boxes.append(box)
                     
                        for box in candidate_boxes:
                          
                            if box_filter_fn and not box_filter_fn(box):
                          
                                continue
                            current_box = {
                                'left': box['left'],
                                'top': box['top'],
                                'right': box['left'] + box['width'],
                                'bottom': box['top'] + box['height']
                            }
                            x_overlap = max(0, min(mapped_box['right'], current_box['right']) - max(mapped_box['left'], current_box['left']))
                            y_overlap = max(0, min(mapped_box['bottom'], current_box['bottom']) - max(mapped_box['top'], current_box['top']))
                            overlap_area = x_overlap * y_overlap
                            box_area = (current_box['right'] - current_box['left']) * (current_box['bottom'] - current_box['top'])
                            if box_area > 0:
                                overlap_ratio = overlap_area / box_area
                                val = extract_value_fn(box['text'])
                              
                                if val is not None and overlap_ratio > 0.3:
                                    mapped_center_x = (mapped_box['left'] + mapped_box['right']) / 2
                                    mapped_center_y = (mapped_box['top'] + mapped_box['bottom']) / 2
                                    box_center_x = (current_box['left'] + current_box['right']) / 2
                                    box_center_y = (current_box['top'] + current_box['bottom']) / 2
                                    # Calculate Euclidean distance
                                    distance = ((box_center_x - mapped_center_x) ** 2 + (box_center_y - mapped_center_y) ** 2) ** 0.5
                                    score = (overlap_ratio * 0.7) + (1 / (1 + distance) * 0.3)
                                  
                                    if score > best_score:
                                        best_score = score
                                        best_match = box
                                        extracted_value = val
                                        box_info = {
                                            "left": box['left'],
                                            "top": box['top'],
                                            "width": box['width'],
                                            "height": box['height'],
                                            "manual": False
                                        }
                                        match_info['value_box'].update({
                                            'left': float(box['left']),
                                            'top': float(box['top']),
                                            'width': float(box['width']),
                                            'height': float(box['height'])
                                        })
                       
            except Exception as e:
                print(f"Error extracting {field_db_name}: {e}")
                print(traceback.format_exc())
            finally:
                if 'cursor' in locals():
                    cursor.close()
                # Add search area info (correct indentation)
                if 'mapping' in locals() and mapping:
                    match_info['search_area'] = {
                        'left': mapped_left,
                        'top': mapped_top,
                        'width': mapped_right - mapped_left,
                        'height': mapped_bottom - mapped_top
                    }
                if 'connection' in locals() and connection.is_connected():
                    connection.close()
            return extracted_value, box_info, match_info

        # Use the generic function for each field
        ht_extracted, ht_box, ht_match = extract_field_by_mapping(
            field_db_name='montantht',
            template_id=template_id,
            detected_boxes=detected_boxes,
            extract_value_fn=extract_number,
            expand_x= 20,
            expand_y=10
        )
        if ht_extracted is None:
            return {"success": False, "data": {}, "message": "Aucune valeur HT trouvée dans la zone mappée"}

        tva_extracted, tva_box, tva_match = extract_field_by_mapping(
            field_db_name='tva',
            template_id=template_id,
            detected_boxes=detected_boxes,
            extract_value_fn=extract_number,
            expand_x=20,
            expand_y=10,
            box_filter_fn=lambda box: '%' not in box['text']
        )
        if tva_extracted is None:
            return {"success": False, "data": {}, "message": "Aucune valeur TVA trouvée dans la zone mappée"}

        # Only consider boxes with at least one digit for numFacture
        def numfacture_filter(box):
            return any(char.isdigit() for char in box['text'])
        numfacture_value, numfacture_box, numfacture_match = extract_field_by_mapping(
            field_db_name='numerofacture',
            template_id=template_id,
            detected_boxes=detected_boxes,
            extract_value_fn=lambda text: text.strip() if text.strip() else None,
            expand_x=20,
            expand_y=10,
            box_filter_fn=numfacture_filter
        )

        datefacturation_value, datefacturation_box, datefacturation_match = extract_field_by_mapping(
            field_db_name='datefacturation',
            template_id=template_id,
            detected_boxes=detected_boxes,
            extract_value_fn=parse_date_try,
            expand_x=20,
            expand_y=10
        )

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
        # Prepare response
        # -------------------------

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

       
        result_data = {
            "montantHT": float(ht_extracted) if ht_extracted is not None else None,
            "montantTVA": float(tva_extracted) if tva_extracted is not None else None,
            "montantTTC": float(ttc_extracted) if ttc_extracted is not None else None,
            "tauxTVA": float(taux_tva) if taux_tva is not None else None,
            "numFacture": numfacture_value,
            "boxHT": ht_match['value_box'] if ht_match and 'value_box' in ht_match else {},
            "boxHTSearchArea": ht_match['search_area'] if ht_match and 'search_area' in ht_match else {"left": 0, "top": 0, "width": 0, "height": 0},
            "boxTVA": tva_match['value_box'] if tva_match and 'value_box' in tva_match else {},
            "boxTVASearchArea": tva_match['search_area'] if tva_match and 'search_area' in tva_match else {"left": 0, "top": 0, "width": 0, "height": 0},
            "boxNumFacture": numfacture_box or {},
            "boxNumFactureSearchArea": numfacture_match['search_area'] if numfacture_match and 'search_area' in numfacture_match else {"left": 0, "top": 0, "width": 0, "height": 0},
            "dateFacturation": datefacturation_value,
            "boxDateFacturation": datefacturation_box or {},
            "boxDateFacturationSearchArea": datefacturation_match['search_area'] if datefacturation_match and 'search_area' in datefacturation_match else {"left": 0, "top": 0, "width": 0, "height": 0},
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
            "created_by": current_user["id"],
            "sous_valeurs": [sv.dict() for sv in invoice.sous_valeurs]  # Convert Pydantic models to dicts
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

@app.get("/sous_valeurs")
async def get_sous_valeurs(facture_id: int = Query(...), db=Depends(get_async_db)):
    """
    Get sous valeurs (HT, TVA, TTC) for a given facture_id
    """
    try:
        result = await db.execute(select(SousValeurs).where(SousValeurs.facture_id == facture_id))
        sous_valeurs = result.scalars().all()
        # Return as list of dicts
        return {"sous_valeurs": [
            {
                "HT": sv.HT,
                "TVA": sv.TVA,
                "TTC": sv.TTC,
                "id": sv.id,
                "facture_id": sv.facture_id
            } for sv in sous_valeurs
        ]}
    except Exception as e:
        return {"sous_valeurs": [], "error": str(e)}

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
    
        
        # Utiliser les données corrigées si disponibles, sinon les données extraites
        if corrected_data is not None:
            data_to_use = corrected_data
          
        else:
            data_to_use = extracted_data
          
        
        # Gérer les différents noms de champs possibles
        numero_facture = data_to_use.get("numeroFacture") or data_to_use.get("numFacture", "")
    
        
        # Nettoyer le taux TVA - extraire juste le nombre
        taux_tva_raw = data_to_use.get("tauxTVA", "0")
        taux_tva_clean = "0"
        if taux_tva_raw:
            # Chercher un nombre dans la chaîne (ex: "Total TVA 20%" -> "20")
            match = re.search(r'(\d+(?:[.,]\d+)?)', str(taux_tva_raw))
            if match:
                taux_tva_clean = match.group(1)
        
    
        
        # Créer un fichier JSON avec les données (corrigées ou extraites)
    
        
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
    
        
        # Créer automatiquement le fichier JSON dans le dossier foxpro
        foxpro_dir = os.path.join(os.path.dirname(__file__), 'foxpro')
        os.makedirs(foxpro_dir, exist_ok=True)
        
        json_path = os.path.join(foxpro_dir, 'ocr_extraction.json')
    
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(foxpro_data, f, ensure_ascii=False, indent=2)
        
        # Créer automatiquement le fichier texte simple pour FoxPro
        txt_path = os.path.join(foxpro_dir, 'ocr_extraction.txt')
    
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(f"Date export: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Fournisseur: {data_to_use.get('fournisseur', '')}\n")
            f.write(f"Numéro Facture: {numero_facture}\n")  # Use the processed numero_facture variable
            f.write(f"Taux TVA: {taux_tva_clean}\n")
            f.write(f"Montant HT: {data_to_use.get('montantHT', '0')}\n")
            f.write(f"Montant TVA: {data_to_use.get('montantTVA', '0')}\n")
            f.write(f"Montant TTC: {data_to_use.get('montantTTC', '0')}\n")
        
    
        
        # Créer aussi automatiquement le fichier DBF s'il n'existe pas
        try:
            write_invoice_to_dbf(data_to_use)
            
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
            
        
        # Créer le fichier DBF s'il n'existe pas
        if not os.path.exists(dbf_path):
            
            # Créer la table DBF avec une structure compatible FoxPro
            table = dbf.Table(
                dbf_path,
                'fournissr C(30); numfact C(15); datefact C(15); tauxtva N(5,2); mntht N(10,2); mnttva N(10,2); mntttc N(10,2)'
            )
            table.open(mode=dbf.READ_WRITE)
            table.close()
            
        
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
