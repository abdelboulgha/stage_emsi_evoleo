import re
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any, Union
import json
import os
import pymupdf as fitz
from PIL import Image, ImageEnhance, ImageOps
import logging
from paddleocr import PaddleOCR
import numpy as np
import base64
from io import BytesIO
import tempfile
import shutil
from math import hypot
import mysql.connector
from mysql.connector import Error, pooling
from dotenv import load_dotenv
import dbf
import pytesseract
import cv2
import datetime
import math

# Import des modules d'authentification
from auth_routes import router as auth_router
from auth_database import init_database
from auth_jwt import require_comptable_or_admin

# Load environment variables
load_dotenv()

# Configuration
UPLOAD_DIR = 'uploads'
DEBUG_DIR = 'debug_images'

# Database configuration
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "evoleo")
}

# Create necessary directories
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DEBUG_DIR, exist_ok=True)

# Configure logging
logging.basicConfig(
    filename='invoice_debug.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(message)s'
)

# Create database connection pool
connection_pool = None
try:
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="evoleo_pool",
        pool_size=5,
        **DB_CONFIG
    )
    logging.info("Database connection pool created successfully")
except Error as e:
    logging.error(f"Error creating connection pool: {e}")
    # Don't raise here, allow the app to start without database if needed
    logging.warning("Continuing without database connection pool")
except Exception as e:
    logging.error(f"Unexpected error creating connection pool: {e}")
    logging.warning("Continuing without database connection pool")

# Initialize PaddleOCR with specified parameters
ocr = PaddleOCR(
    use_doc_orientation_classify=False,  # Handle document-level rotation
    use_doc_unwarping=False,  # Correct perspective distortion
    use_textline_orientation=False,  # Improve line-level orientation
    text_det_input_shape=[3, 1440, 1440],
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="PP-OCRv5_mobile_rec",
    precision="fp32",
    enable_mkldnn=True,
    text_det_unclip_ratio=1.3,
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

# Initialisation de la base de données d'authentification
try:
    init_database()
    logging.info("Base de données d'authentification initialisée")
except Exception as e:
    logging.error(f"Erreur lors de l'initialisation de la base de données d'authentification: {e}")

# Inclusion des routes d'authentification
app.include_router(auth_router)

# Modèles Pydantic
class FieldCoordinates(BaseModel):
    left: float
    top: float
    width: float
    height: float
    manual: Optional[bool] = False

class FieldMapping(BaseModel):
    field_map: Dict[str, Optional[FieldCoordinates]]

class ExtractionResult(BaseModel):
    success: bool
    data: Dict[str, str]
    message: str
    debug_images: List[str] = []

# Database Utilities
def get_connection():
    """Get a connection from the pool"""
    if connection_pool is None:
        raise Exception("Database connection pool not available")
    try:
        connection = connection_pool.get_connection()
        return connection
    except Error as e:
        logging.error(f"Error getting connection from pool: {e}")
        raise

async def save_mapping_db(template_id: str, field_map: Dict[str, Any]) -> bool:
    """Save field mappings to the database using field IDs, including the 'manual' flag"""
    connection = None
    cursor = None
    try:
        logging.info(f"Starting to save mapping for template_id: {template_id}")
        logging.info(f"Field map received: {json.dumps(field_map, default=str)}")
        
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        
        connection.start_transaction()
        
        # Ensure template exists
        cursor.execute("INSERT IGNORE INTO Templates (id) VALUES (%s)", (template_id,))
        logging.info(f"Ensured template {template_id} exists in database")
        
        # Get field name to ID mapping from database
        cursor.execute("SELECT id, name FROM Field_Name")
        field_name_to_id = {}
        for row in cursor.fetchall():
            field_name_to_id[row['name'].lower()] = row['id']
        
        logging.info(f"Field name to ID mapping: {field_name_to_id}")
        
        # Get existing field names from database for case-insensitive comparison
        cursor.execute("SELECT name FROM Field_Name")
        db_field_names = [row['name'].lower() for row in cursor.fetchall()]
        
        for field_name, coords in field_map.items():
            if coords is None:
                logging.warning(f"Skipping null coordinates for field: {field_name}")
                continue
            
            # Convert field name to lowercase for case-insensitive comparison
            field_name_lower = field_name.lower()
            field_id = field_name_to_id.get(field_name_lower)
            
            if not field_id:
                # Try to find a case-insensitive match
                matching_name = next((name for name in db_field_names if name.lower() == field_name_lower), None)
                if matching_name:
                    field_id = field_name_to_id[matching_name]
                    logging.info(f"Found case-insensitive match for field '{field_name}': '{matching_name}' (ID: {field_id})")
            
            if not field_id:
                error_msg = f"Field name '{field_name}' not found in Field_Name table. Available fields: {list(field_name_to_id.keys())}"
                logging.error(error_msg)
                continue
            
            # Handle both Pydantic model and dictionary
            if hasattr(coords, 'dict'):
                coords = coords.dict()
            
            # Extract coordinates with proper type conversion and default values
            left = float(coords.get('left', 0)) if coords.get('left') is not None else 0.0
            top = float(coords.get('top', 0)) if coords.get('top') is not None else 0.0
            width = float(coords.get('width', 0)) if coords.get('width') is not None else 0.0
            height = float(coords.get('height', 0)) if coords.get('height') is not None else 0.0
            manual = int(coords.get('manual', False))  # <-- Ajout gestion du champ manual
            
            logging.info(f"Processing field: {field_name} (ID: {field_id}) with coords: left={left}, top={top}, width={width}, height={height}, manual={manual}")
            
            try:
                cursor.execute("""
                    INSERT INTO Mappings 
                    (template_id, field_id, `left`, `top`, `width`, `height`, `manual`)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    `left` = VALUES(`left`),
                    `top` = VALUES(`top`),
                    `width` = VALUES(`width`),
                    `height` = VALUES(`height`),
                    `manual` = VALUES(`manual`)
                """, (
                    template_id,
                    field_id,
                    left,
                    top,
                    width,
                    height,
                    manual
                ))
                logging.info(f"Successfully processed field: {field_name}")
                
            except Exception as field_error:
                error_msg = f"Error processing field {field_name}: {str(field_error)}"
                logging.error(error_msg, exc_info=True)
                raise Exception(error_msg) from field_error
        
        connection.commit()
        logging.info("Successfully committed all field mappings to database")
        return True
        
    except Exception as e:
        error_msg = f"Error in save_mapping_db: {str(e)}"
        logging.error(error_msg, exc_info=True)
        if connection:
            connection.rollback()
            logging.info("Transaction rolled back due to error")
        return False
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

async def load_mapping_db(template_id: str) -> Dict:
    """Load field mappings from the database using field names, including the 'manual' flag"""
    connection = None
    cursor = None
    try:
        logging.info(f"Loading mappings for template_id: {template_id}")
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Get field ID to name mapping
        cursor.execute("SELECT id, name FROM Field_Name")
        id_to_name = {row['id']: row['name'] for row in cursor.fetchall()}
        logging.info(f"Loaded field name mapping: {id_to_name}")
        
        # Get all mappings for this template (inclut 'manual')
        cursor.execute("""
            SELECT field_id, `left`, `top`, `width`, `height`, `manual`
            FROM Mappings 
            WHERE template_id = %s
        """, (template_id,))
        
        field_map = {}
        rows = cursor.fetchall()
        logging.info(f"Found {len(rows)} mappings in database")
        
        for row in rows:
            field_id = row['field_id']
            field_name = id_to_name.get(field_id)
            if field_name:
                try:
                    field_map[field_name] = {
                        'left': float(row['left']) if row['left'] is not None else 0.0,
                        'top': float(row['top']) if row['top'] is not None else 0.0,
                        'width': float(row['width']) if row['width'] is not None else 0.0,
                        'height': float(row['height']) if row['height'] is not None else 0.0,
                        'manual': bool(row.get('manual', 0))  # <-- Ajout du flag manual
                    }
                    logging.info(f"Loaded mapping for {field_name}: {field_map[field_name]}")
                except (ValueError, TypeError) as e:
                    logging.error(f"Error processing coordinates for field {field_name}: {e}")
            else:
                logging.warning(f"No name found for field_id: {field_id}")
        
        logging.info(f"Successfully loaded {len(field_map)} field mappings")
        # Return in the expected format
        return {
            "status": "success",
            "mappings": {
                template_id: field_map
            }
        }
        
    except Exception as e:
        error_msg = f"Error loading mapping from database: {str(e)}"
        logging.error(error_msg, exc_info=True)
        return {
            "status": "error",
            "message": error_msg,
            "mappings": {}
        }
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

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
    """Préprocesseur d'image avec binarisation et contraste fort pour améliorer l'OCR sur les petites zones"""
    img = img.convert('L')  # grayscale
    img = ImageOps.autocontrast(img)
    img = ImageOps.invert(img)
    img = img.point(lambda x: 0 if x < 128 else 255, '1')  # binarisation forte
    return img

def preprocess_image_cv_opencv(img: Image.Image) -> Image.Image:
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

# Add a single variable for PDF rendering scale
PDF_RENDER_SCALE = 2  # Change this value to affect all PDF image renderings

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

# Routes API
@app.get("/")
async def root():
    return {"message": "Invoice Extractor API"}

@app.get("/health")
async def health_check():
    """Health check endpoint to verify server status"""
    try:
        # Test database connection if available
        db_status = "unknown"
        if connection_pool is not None:
            try:
                connection = get_connection()
                connection.close()
                db_status = "connected"
            except Exception as e:
                db_status = f"error: {str(e)}"
        else:
            db_status = "not_configured"
        
        return {
            "status": "healthy",
            "timestamp": "2024-01-01T00:00:00Z",
            "database": db_status,
            "ocr_engine": "PaddleOCR",
            "version": "1.0.0"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": "2024-01-01T00:00:00Z"
        }

@app.get("/mappings")
async def get_mappings():
    """Récupérer tous les mappings groupés par template_id"""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        # Get all field mappings with template and field names
        cursor.execute("""
            SELECT 
                m.template_id,
                f.name as field_name,
                m.`left`,
                m.`top`,
                m.`width`,
                m.`height`
            FROM Mappings m
            JOIN Field_Name f ON m.field_id = f.id
            ORDER BY m.template_id, f.name
        """)

        mappings = cursor.fetchall()
        logging.info(f"Found {len(mappings)} total field mappings")

        # Group by template_id
        result = {}
        for row in mappings:
            template_id = row['template_id']
            if template_id not in result:
                result[template_id] = {}

            result[template_id][row['field_name']] = {
                'left': float(row['left']) if row['left'] is not None else 0.0,
                'top': float(row['top']) if row['top'] is not None else 0.0,
                'width': float(row['width']) if row['width'] is not None else 0.0,
                'height': float(row['height']) if row['height'] is not None else 0.0,
                'manual': False  # Default value
            }

        logging.info(f"Returning mappings for {len(result)} templates")
        return {
            "status": "success",
            "mappings": result,
            "count": len(mappings),
            "template_count": len(result)
        }

    except Exception as e:
        error_msg = f"Error loading all mappings: {str(e)}"
        logging.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

@app.get("/mappings/{template_id}")
async def get_mapping(template_id: str):
    """Récupérer le mapping pour un template spécifique"""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Get all field mappings for this template with field names
        cursor.execute("""
            SELECT m.field_id, f.name as field_name, m.`left`, m.`top`, m.`width`, m.`height`
            FROM Mappings m
            JOIN Field_Name f ON m.field_id = f.id
            WHERE m.template_id = %s
        """, (template_id,))
        
        mappings = cursor.fetchall()
        logging.info(f"Found {len(mappings)} mappings for template {template_id}")
        
        if not mappings:
            logging.warning(f"No mappings found for template {template_id}")
            return {"template_id": template_id, "field_map": {}}
        
        # Convert to the expected format
        field_map = {}
        for row in mappings:
            field_name = row['field_name']
            field_map[field_name] = {
                'left': float(row['left']) if row['left'] is not None else 0.0,
                'top': float(row['top']) if row['top'] is not None else 0.0,
                'width': float(row['width']) if row['width'] is not None else 0.0,
                'height': float(row['height']) if row['height'] is not None else 0.0,
                'manual': False  # Default value
            }
            logging.debug(f"Loaded mapping for {field_name}: {field_map[field_name]}")
        
        logging.info(f"Successfully loaded {len(field_map)} field mappings for template {template_id}")
        return {
            "template_id": template_id, 
            "field_map": field_map,
            "status": "success"
        }
        
    except Exception as e:
        error_msg = f"Error loading mapping for template {template_id}: {str(e)}"
        logging.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

class SaveMappingRequest(BaseModel):
    template_id: str = "default"
    field_map: Dict[str, Optional[FieldCoordinates]]

@app.post("/mappings")
async def save_field_mapping(request: SaveMappingRequest):
    try:
        template_id = request.template_id
        field_mapping = request.field_map
        
        logging.info(f"Received request to save mapping for template: {template_id}")
        logging.debug(f"Field mapping data: {field_mapping}")
        
        # Convert FieldCoordinates objects to dictionaries
        field_map = {}
        for field_name, coords in field_mapping.items():
            if coords is not None:
                field_map[field_name] = coords.dict() if hasattr(coords, 'dict') else coords
                logging.debug(f"Processed field {field_name}: {field_map[field_name]}")
            else:
                field_map[field_name] = None
                logging.debug(f"Null coordinates for field: {field_name}")
        
        logging.info(f"Saving {len(field_map)} fields to database for template {template_id}")
        
        # Save to database
        success = await save_mapping_db(template_id, field_map)
        if not success:
            error_msg = f"Failed to save mappings to database for template {template_id}"
            logging.error(error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
            
        logging.info(f"Successfully saved mappings for template {template_id}")
        return {
            "status": "success", 
            "message": f"Mappings saved for template {template_id}",
            "template_id": template_id,
            "fields_saved": len(field_map)
        }
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        error_msg = f"Unexpected error saving mapping: {str(e)}"
        logging.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)

@app.post("/upload-for-dataprep")
async def upload_for_dataprep(
    file: UploadFile = File(...),
    current_user = Depends(require_comptable_or_admin)
):
    """Upload d'un fichier pour DataPrep, retour de l'image en base64, des boîtes OCR détectées, et l'image unwarped si disponible"""
    try:
        file_content = await file.read()
        if file.filename.lower().endswith('.pdf'):
            images = process_pdf_to_images(file_content)
            if not images:
                return {"success": False, "message": "No images extracted from PDF."}
            img = images[0]
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            img = Image.open(BytesIO(file_content)).convert('RGB')
            images = [img]
        else:
            raise HTTPException(status_code=400, detail="Type de fichier non supporté")

        # Run OCR on the first image
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
                # Use original_points if available, else rec_polys
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
        return {
            "success": True,
            "image": image_to_base64(images[0]) if images else None,
            "width": images[0].width if images else None,
            "height": images[0].height if images else None,
            "images": [image_to_base64(img) for img in images],
            "widths": [img.width for img in images],
            "heights": [img.height for img in images],
            "boxes": boxes,
            "box_count": len(boxes),
            "unwarped_image": unwarped_base64,
            "unwarped_width": unwarped_width,
            "unwarped_height": unwarped_height
        }
    except Exception as e:
        logging.error(f"Erreur lors de l'upload: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement: {str(e)}")

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
    file: UploadFile = File(...),
    template_id: str = Form(...),
    current_user = Depends(require_comptable_or_admin)
):
    """
    Extraire les données d'un document avec ou sans template.
    
    Deux modes d'opération :
    1. Avec template (template_id fourni) : utilise les coordonnées du template spécifié
    2. Sans template (pas de template_id) : compare avec tous les templates disponibles et utilise le meilleur match
    """
    try:
        # Read and process the uploaded file first (we need this for both modes)
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
        
        # Collect detected boxes with their centers for matching
        detected_boxes = []
        for res in result:
            rec_polys = res.get('rec_polys', [])
            rec_texts = res.get('rec_texts', [])
            rec_scores = res.get('rec_scores', [])
            for poly, text, score in zip(rec_polys, rec_texts, rec_scores):
                if score is None or not text.strip():
                    continue
                
                # Calculate bounding box and center
                x_coords = [p[0] for p in poly]
                y_coords = [p[1] for p in poly]
                left = min(x_coords)
                top = min(y_coords)
                right = max(x_coords)
                bottom = max(y_coords)
                width = right - left
                height = bottom - top
                center_x = (left + right) / 2
                center_y = (top + bottom) / 2
                
                detected_boxes.append({
                    'left': left,
                    'top': top,
                    'width': width,
                    'height': height,
                    'text': text,
                    'center_x': center_x,
                    'center_y': center_y,
                    'score': float(score)
                })
        
        def box_distance(box1, box2):
            """Calculate distance between two boxes based on their centers and sizes"""
            # Distance between centers
            center_dist = hypot(box1['center_x'] - box2['center_x'], 
                              box1['center_y'] - box2['center_y'])
            
            # Size difference (area ratio)
            area1 = box1['width'] * box1['height']
            area2 = box2['width'] * box2['height']
            size_ratio = max(area1, area2) / min(area1, area2) if min(area1, area2) > 0 else float('inf')
            
            # Combine metrics (adjust weights as needed)
            return center_dist * 0.7 + (size_ratio - 1) * 100
        
        # If no template_id provided, load all templates and find best matches
        if not template_id:
            logging.info("Mode sans template - recherche du meilleur match parmi tous les templates")
            
            # Get all templates from database
            connection = None
            cursor = None
            try:
                connection = get_connection()
                cursor = connection.cursor(dictionary=True)
                cursor.execute("SELECT id FROM Templates")
                all_templates = cursor.fetchall()
                
                if not all_templates:
                    return {
                        "success": False,
                        "data": {},
                        "message": "Aucun template trouvé dans la base de données. Veuillez d'abord créer un template.",
                        "debug_images": []
                    }
            except Exception as e:
                logging.error(f"Error fetching templates: {e}")
                return {
                    "success": False,
                    "data": {},
                    "message": f"Erreur lors de la récupération des templates: {str(e)}",
                    "debug_images": []
                }
            finally:
                if cursor:
                    cursor.close()
                if connection and connection.is_connected():
                    connection.close()
            
            # Load mappings for all templates
            all_mappings = {}
            logging.info(f"Found {len(all_templates)} templates in database")
            
            for template in all_templates:
                tpl_id = template['id']
                logging.info(f"Loading mappings for template: {tpl_id}")
                try:
                    db_response = await load_mapping_db(tpl_id)
                    logging.info(f"Response for template {tpl_id}: {json.dumps(db_response, default=str, ensure_ascii=False)[:500]}...")
                    
                    if db_response.get("status") == "success" and db_response.get("mappings", {}).get(tpl_id):
                        all_mappings[tpl_id] = db_response["mappings"][tpl_id]
                        logging.info(f"Successfully loaded {len(db_response['mappings'][tpl_id])} fields for template {tpl_id}")
                    else:
                        logging.warning(f"No valid mappings found in response for template {tpl_id}")
                except Exception as e:
                    logging.error(f"Error processing template {tpl_id}: {str(e)}")
            
            logging.info(f"Total templates with valid mappings: {len(all_mappings)}")
            if not all_mappings:
                # Check if templates exist but have no mappings
                connection = None
                cursor = None
                try:
                    connection = get_connection()
                    cursor = connection.cursor(dictionary=True)
                    cursor.execute("""
                        SELECT t.id AS template_id, COUNT(m.id) AS mapping_count 
                        FROM Templates t
                        LEFT JOIN Mappings m ON t.id = m.template_id
                        GROUP BY t.id
                    """)
                    template_stats = cursor.fetchall()
                    logging.info(f"Template mapping statistics: {json.dumps(template_stats, default=str)}")
                except Exception as e:
                    logging.error(f"Error fetching template statistics: {e}")
                    template_stats = [{"error": str(e)}]
                finally:
                    if cursor:
                        cursor.close()
                    if connection and connection.is_connected():
                        connection.close()
                
                return {
                    "success": False,
                    "data": {},
                    "message": f"Aucun mapping trouvé pour les templates existants.\n" \
                              f"Détails: {json.dumps(template_stats, default=str, ensure_ascii=False)}",
                    "debug_images": []
                }
            
            # For each field, find the best matching box across all templates
            extracted_data = {}
            confidence_scores = {}
            used_boxes = set()  # To avoid reusing the same box for multiple fields
            
            # Get all unique field names from all templates
            all_field_names = set()
            for tpl_id, mappings in all_mappings.items():
                all_field_names.update(mappings.keys())
            
            # Process each field
            for field_name in all_field_names:
                best_match = None
                best_distance = float('inf')
                best_box = None
                best_template = None
                best_score = 0.0
                
                # For each template that has this field
                for tpl_id, mappings in all_mappings.items():
                    if field_name not in mappings:
                        continue
                        
                    field_mapping = mappings[field_name]
                    if not field_mapping:
                        continue
                        
                    # Create template box for comparison
                    tpl_box = {
                        'left': field_mapping.get('left', 0),
                        'top': field_mapping.get('top', 0),
                        'width': field_mapping.get('width', 0),
                        'height': field_mapping.get('height', 0),
                        'center_x': field_mapping.get('left', 0) + field_mapping.get('width', 0) / 2,
                        'center_y': field_mapping.get('top', 0) + field_mapping.get('height', 0) / 2
                    }
                    
                    # Find the best matching box in the document
                    for i, det_box in enumerate(detected_boxes):
                        # Skip already used boxes
                        if i in used_boxes:
                            continue
                        
                        # Calculate distance between template field and detected box
                        distance = box_distance(tpl_box, det_box)
                        
                        # Consider OCR confidence score
                        score_penalty = (1.0 - det_box.get('score', 1.0)) * 100  # Penalize low confidence
                        distance += score_penalty
                        
                        if distance < best_distance:
                            best_distance = distance
                            best_match = det_box['text']
                            best_box = i
                            best_template = tpl_id
                            best_score = det_box.get('score', 0.0)
            
                # If we found a good match, add it to results
                if best_box is not None and best_distance < 200:  # Threshold for max allowed distance
                    extracted_data[field_name] = best_match
                    confidence_scores[field_name] = best_score
                    used_boxes.add(best_box)  # Mark this box as used
                    logging.info(f"Field '{field_name}' matched from template '{best_template}' with distance {best_distance:.2f} and score {best_score:.2f}")
            
            if not extracted_data:
                return {
                    "success": False,
                    "data": {},
                    "message": "Aucune correspondance trouvée avec les templates existants.",
                    "debug_images": []
                }
            
            # Sauvegarder les données extraites pour FoxPro
            save_extraction_for_foxpro(extracted_data, confidence_scores)
            
            return {
                "success": True,
                "data": extracted_data,
                "confidence_scores": confidence_scores,
                "message": f"Extraction réussie avec correspondance automatique sur {len(extracted_data)} champs",
                "debug_images": []
            }
        
        # If template_id is provided, use the original behavior with the specified template
        db_response = await load_mapping_db(template_id)
        if db_response.get("status") != "success" or not db_response.get("mappings", {}).get(template_id):
            raise HTTPException(
                status_code=404,
                detail=f"Aucun mapping trouvé pour le template '{template_id}'. " \
                      f"Veuillez d'abord enregistrer un mapping pour ce template."
            )
        mappings = db_response["mappings"][template_id]
        logging.info(f"Utilisation du template: {template_id}")
        logging.info(f"Mappings chargés: {json.dumps(mappings, indent=2, default=str)}")
        
        # Extract data using the specified template
        extracted_data = {}
        confidence_scores = {}
        for field_key, coords in mappings.items():
            if not coords:
                continue
                
            # Si mapping manuel, on croppe et on fait l'OCR direct
            if coords.get('manual', False):
                left = coords.get('left', 0)
                top = coords.get('top', 0)
                width = coords.get('width', 0)
                height = coords.get('height', 0)
                left_safe, top_safe, right_safe, bottom_safe = safe_crop_bounds(
                    left, top, width, height, img.width, img.height
                )
                crop_img = img.crop((left_safe, top_safe, right_safe, bottom_safe))
                processed_crop = preprocess_image_cv(crop_img)
                processed_crop_for_ocr = processed_crop.resize((processed_crop.width * 4, processed_crop.height * 4), Image.Resampling.LANCZOS)
                text = extract_text_with_paddleocr(processed_crop_for_ocr)
                # Fallback Tesseract si besoin
                if not text or text.strip() == "":
                    processed_cv = preprocess_image_cv_opencv(crop_img)
                    text = pytesseract.image_to_string(processed_cv).strip()
                extracted_data[field_key] = text
                continue
            # Sinon, comportement normal (matching avec les boîtes OCR)
            template_box = {
                'left': coords.get('left', 0),
                'top': coords.get('top', 0),
                'width': coords.get('width', 0),
                'height': coords.get('height', 0),
                'center_x': coords.get('left', 0) + coords.get('width', 0) / 2,
                'center_y': coords.get('top', 0) + coords.get('height', 0) / 2
            }
            best_box = None
            best_distance = float('inf')
            for det_box in detected_boxes:
                distance = box_distance(template_box, det_box)
                if distance < best_distance:
                    best_distance = distance
                    best_box = det_box
            if best_box and best_distance < 200:
                extracted_data[field_key] = best_box['text']
                confidence_scores[field_key] = best_box.get('score', 0.0)
        logging.info(f'Données extraites par champ: {extracted_data}')
        
        # Sauvegarder les données extraites pour FoxPro
        save_extraction_for_foxpro(extracted_data, confidence_scores)
        
        return {
            "success": True,
            "data": extracted_data,
            "confidence_scores": confidence_scores,
            "message": f"Extraction réussie avec le template {template_id}",
            "debug_images": []
        }
    except Exception as e:
        logging.error(f"Erreur lors de l'extraction: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'extraction: {str(e)}")

def save_extraction_for_foxpro(extracted_data: Dict[str, str], confidence_scores: Dict[str, float], corrected_data: Dict[str, str] = None):
    """Sauvegarder les données extraites dans un fichier JSON pour FoxPro"""
    try:
        # Utiliser les données corrigées si disponibles et non vides, sinon les données extraites
        if corrected_data and any(corrected_data.values()):
            data_to_use = corrected_data
        else:
            data_to_use = extracted_data
        
        # Nettoyer le taux TVA - extraire juste le nombre
        taux_tva_raw = data_to_use.get("tauxTVA", "0")
        taux_tva_clean = "0"
        if taux_tva_raw:
            # Chercher un nombre dans la chaîne (ex: "Total TVA 20%" -> "20")
            import re
            match = re.search(r'(\d+(?:[.,]\d+)?)', str(taux_tva_raw))
            if match:
                taux_tva_clean = match.group(1)
        
        # Créer un fichier JSON avec les données (corrigées ou extraites)
        foxpro_data = {
            "success": True,
            "data": extracted_data,  # Garder les données originales pour référence
            "corrected_data": corrected_data,  # Ajouter les données corrigées
            "confidence_scores": confidence_scores,
            "timestamp": str(datetime.datetime.now()),
            "fields": {
                "fournisseur": data_to_use.get("fournisseur", ""),
                "numeroFacture": data_to_use.get("numeroFacture", ""),
                "tauxTVA": taux_tva_clean,
                "montantHT": data_to_use.get("montantHT", "0"),
                "montantTVA": data_to_use.get("montantTVA", "0"),
                "montantTTC": data_to_use.get("montantTTC", "0")
            }
        }
        
        # Créer automatiquement le fichier JSON
        with open('ocr_extraction.json', 'w', encoding='utf-8') as f:
            json.dump(foxpro_data, f, ensure_ascii=False, indent=2)
        
        # Créer automatiquement le fichier texte simple pour FoxPro
        with open('ocr_extraction.txt', 'w', encoding='utf-8') as f:
            f.write(f"Fournisseur: {data_to_use.get('fournisseur', '')}\n")
            f.write(f"Numéro Facture: {data_to_use.get('numeroFacture', '')}\n")
            f.write(f"Taux TVA: {taux_tva_clean}\n")
            f.write(f"Montant HT: {data_to_use.get('montantHT', '0')}\n")
            f.write(f"Montant TVA: {data_to_use.get('montantTVA', '0')}\n")
            f.write(f"Montant TTC: {data_to_use.get('montantTTC', '0')}\n")
        
        logging.info("Fichiers ocr_extraction.json et ocr_extraction.txt créés automatiquement")
        
        # Créer aussi automatiquement le fichier DBF s'il n'existe pas
        try:
            write_invoice_to_dbf(extracted_data)
            logging.info("Fichier factures.dbf créé/mis à jour automatiquement")
        except Exception as dbf_error:
            logging.warning(f"Impossible de créer le fichier DBF: {dbf_error}")
        
    except Exception as e:
        logging.error(f"Erreur lors de la sauvegarde pour FoxPro: {e}")

@app.post("/ocr-preview")
async def ocr_preview(
    file: UploadFile = File(...),
    template_id: str = Form(None)
):
    try:
        # Read and process the uploaded file
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
        
        # Collect detected boxes with confidence filtering
        detected_boxes = []
        for res in result:
            rec_polys = res.get('rec_polys', [])
            rec_texts = res.get('rec_texts', [])
            rec_scores = res.get('rec_scores', [])
            for poly, text, score in zip(rec_polys, rec_texts, rec_scores):
                if score is None or score < 0.75 or not text.strip():
                    logging.info(f"Filtered out low confidence text: '{text}' (confidence: {score:.3f})")
                    continue
                
                x_coords = [p[0] for p in poly]
                y_coords = [p[1] for p in poly]
                left = min(x_coords)
                top = min(y_coords)
                right = max(x_coords)
                bottom = max(y_coords)
                width = right - left
                height = bottom - top
                center_x = (left + right) / 2
                center_y = (top + bottom) / 2
                
                detected_boxes.append({
                    'left': float(left),
                    'top': float(top),
                    'width': float(width),
                    'height': float(height),
                    'text': text.strip(),
                    'center_x': float(center_x),
                    'center_y': float(center_y),
                    'score': float(score)
                })
        
        logging.info(f"Total detected boxes (after confidence filtering): {len(detected_boxes)}")
        
        # Helper functions
        def extract_number(text):
            import re
            if re.search(r'[a-zA-Z]', text):
                return None
            cleaned = re.sub(r'[^\d.,-]', '', text)
            if ',' in cleaned and '.' in cleaned:
                if cleaned.rfind(',') > cleaned.rfind('.'):
                    cleaned = cleaned.replace('.', '').replace(',', '.')
                else:
                    cleaned = cleaned.replace(',', '')
            elif ',' in cleaned:
                parts = cleaned.split(',')
                if len(parts[-1]) == 2:
                    cleaned = cleaned.replace(',', '.')
                else:
                    cleaned = cleaned.replace(',', '')
            if cleaned.count('.') > 1:
                parts = cleaned.split('.')
                cleaned = ''.join(parts[:-1]) + '.' + parts[-1]
            if not re.fullmatch(r'-?\d+(?:\.\d+)?', cleaned):
                return None
            try:
                return float(cleaned)
            except ValueError:
                return None

        def is_valid_ht_keyword(text):
            if not text or not isinstance(text, str):
                return False
            text_upper = text.upper().strip()
            patterns = [
                r'^SOUS-TOTAL$',           
                r'^HT\b',
                r'^TOTAL\s+HT\b',
                r'^TOTAL\s+HT\s*:',
                r'^HORS\s+TAXES$',
                r'^TOTAL\s+HORS\s*TAXES$',
                r'^MONTANT\s+(TOTAL\s+)?HT\b',
                r'^MONTANT\s+(TOTAL\s+)?HORS\s+TAXES\b',
                r'^(MONTANT\s+)?(TOTAL\s+)?T\.?H\b',
                r'^(MONTANT\s+)?(TOTAL\s+)?HORS\s+TAXE[S]?\b'
            ]
            for pattern in patterns:
                if re.search(pattern, text_upper):
                    return True
            return False

        def is_valid_tva_keyword(text):
            if not text or not isinstance(text, str):
                return False
            text_upper = text.upper().strip()
            patterns = [
                r'^(MONTANT\s+)?(TOTAL\s+)?T\.?V\.?A\b',
                r'^(MONTANT\s+)?(TOTAL\s+)?TVA\b',
                r'^(MONTANT\s+)?(TOTAL\s+)?TAXE\s+SUR\s+LA\s+VALEUR\s+AJOUT[ÉE]E\b',
                r'^(MONTANT\s+)?(TOTAL\s+)?TAXE\s+AJOUT[ÉE]E\b',
                r'^TVA\s*:',
            ]
            for pattern in patterns:
                if re.search(pattern, text_upper):
                    return True
            return False

        # --- HT extraction ---
        ht_candidates = []
        for i, box in enumerate(detected_boxes):
            text = box['text']
            is_ht = is_valid_ht_keyword(text)
            if is_ht:
                ht_x, ht_y = box['center_x'], box['center_y']
                best_match = None
                min_distance = float('inf')
                for j in range(i + 1, min(i + 10, len(detected_boxes))):
                    next_box = detected_boxes[j]
                    next_text = next_box['text'].strip()
                    if abs(next_box['center_y'] - ht_y) < 20:
                        next_value = extract_number(next_text)
                        if next_value is not None:
                            distance = next_box['center_x'] - ht_x
                            if 0 < distance < min_distance:
                                best_match = {
                                    'keyword_box': box,
                                    'value_box': next_box,
                                    'value': next_value,
                                    'keyword_text': box['text'],
                                    'value_text': next_text,
                                    'distance': distance
                                }
                                min_distance = distance
                if best_match:
                    ht_candidates.append(best_match)
        if not ht_candidates:
            return {
                "success": False,
                "data": {},
                "message": "Aucun mot-clé HT trouvé"
            }
        ht_candidates.sort(key=lambda x: x['distance'])
        ht_selected = ht_candidates[0]
        ht_extracted = ht_selected['value']

        # --- TVA extraction ---
        tva_candidates = []
        for i, box in enumerate(detected_boxes):
            if is_valid_tva_keyword(box['text']):
                tva_x, tva_y = box['center_x'], box['center_y']
                best_match = None
                min_distance = float('inf')
                for j in range(i + 1, min(i + 10, len(detected_boxes))):
                    next_box = detected_boxes[j]
                    next_text = next_box['text'].strip()
                    if abs(next_box['center_y'] - tva_y) < 20:
                        next_value = extract_number(next_text)
                        if next_value is not None:
                            distance = next_box['center_x'] - tva_x
                            if 0 < distance < min_distance:
                                best_match = {
                                    'keyword_box': box,
                                    'value_box': next_box,
                                    'value': next_value,
                                    'keyword_text': box['text'],
                                    'value_text': next_text,
                                    'distance': distance
                                }
                                min_distance = distance
                if best_match:
                    tva_candidates.append(best_match)
        if not tva_candidates:
            return {
                "success": False,
                "data": {},
                "message": "Aucun mot-clé TVA trouvé"
            }
        tva_candidates.sort(key=lambda x: x['distance'])
        tva_selected = tva_candidates[0]
        tva_extracted = tva_selected['value']

        # --- TTC & tauxTVA ---
        ttc_extracted = round(ht_extracted + tva_extracted, 2)
        if ht_extracted != 0:
            raw_taux = (tva_extracted * 100) / ht_extracted
            decimal_part = raw_taux - math.floor(raw_taux)
            if decimal_part > 0.5:
                taux_tva = math.ceil(raw_taux)
            else:
                taux_tva = math.floor(raw_taux)
        else:
            taux_tva = 0

        # --- numFacture extraction using mapping ---
        numfacture_value = None
        numfacture_box = None
        try:
            connection = get_connection()
            cursor = connection.cursor(dictionary=True)
            # Get field_id for numFacture
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

                    vertical_threshold = 30  # allowed vertical deviation
                    best_match = None
                    best_score = -1

                    def is_valid_invoice_number(text):
                        """Improved validation that accepts invoice patterns"""
                        text = text.strip()
                        # Must contain at least 4 consecutive digits
                        if not re.search(r'\d{4,}', text):
                            return False
                        # Accepts common invoice formats with letters/numbers/symbols
                        return bool(re.match(r'^[\w\s\-/°#]+$', text, re.UNICODE))

                    def calculate_invoice_score(text):
                        """Score based on digit count and invoice-like patterns"""
                        # Count total digits
                        digit_count = len(re.findall(r'\d', text))
                        # Bonus for long consecutive digit sequences
                        max_consecutive = max(len(m) for m in re.findall(r'\d+', text))
                        # Bonus for common invoice patterns
                        pattern_bonus = 2 if re.search(r'(n[°º]|no|num|ref|facture)\s*\d', text.lower()) else 0
                        return digit_count + max_consecutive + pattern_bonus

                    # Step 1: Find best candidate near mapped position
                    for box in detected_boxes:
                        text = box["text"].strip()
                        if not is_valid_invoice_number(text):
                            continue
                            
                        # Check vertical alignment
                        if abs(box["center_y"] - mapped_cy) > vertical_threshold:
                            continue
                        
                        # Calculate score
                        score = calculate_invoice_score(text)
                        
                        # Adjust score by position (closer = better)
                        dist_x = abs(box["center_x"] - mapped_cx)
                        dist_y = abs(box["center_y"] - mapped_cy)
                        position_factor = 1/(1 + dist_x + dist_y)  # 1 for perfect match
                        score *= position_factor
                        
                        if score > best_score:
                            best_score = score
                            best_match = box

                    # Step 2: Verify and store best match
                    if best_match:
                        numfacture_value = best_match["text"].strip()
                        numfacture_box = {
                            "left": best_match["left"],
                            "top": best_match["top"],
                            "width": best_match["width"],
                            "height": best_match["height"],
                        }

                    # Step 3: Fallback - global search for best invoice number
                    if not numfacture_value:
                        global_best = None
                        global_score = -1
                        for box in detected_boxes:
                            text = box["text"].strip()
                            if not is_valid_invoice_number(text):
                                continue
                                
                            score = calculate_invoice_score(text)
                            if score > global_score:
                                global_score = score
                                global_best = box
                        
                        if global_best:
                            numfacture_value = global_best["text"].strip()
                            numfacture_box = {
                                "left": global_best["left"],
                                "top": global_best["top"],
                                "width": global_best["width"],
                                "height": global_best["height"],
                            }

        except Exception as e:
            logging.error(f"Error extracting numFacture: {e}", exc_info=True)
        finally:
            if 'cursor' in locals() and cursor:
                cursor.close()
            if 'connection' in locals() and connection and connection.is_connected():
                connection.close()
        # --- Prepare response ---
        result_data = {
            "montantHT": ht_extracted,
            "montantTVA": tva_extracted,
            "montantTTC": ttc_extracted,
            "tauxTVA": round(taux_tva, 2),
            "boxHT": {
                "left": ht_selected['value_box']['left'],
                "top": ht_selected['value_box']['top'],
                "width": ht_selected['value_box']['width'],
                "height": ht_selected['value_box']['height'],
            },
            "boxTVA": {
                "left": tva_selected['value_box']['left'],
                "top": tva_selected['value_box']['top'],
                "width": tva_selected['value_box']['width'],
                "height": tva_selected['value_box']['height'],
            },
            "numFacture": numfacture_value,
            "boxNumFacture": numfacture_box,
        }
        return {
            "success": True,
            "data": result_data,
            "message": "Extraction réussie"
        }
    except Exception as e:
        logging.error(f"Error in extract_test: {str(e)}", exc_info=True)
        return {
            "success": False,
            "data": {},
            "message": f"Erreur lors de l'extraction: {str(e)}"
        }

@app.delete("/mappings/{template_id}")
async def delete_mapping(template_id: str):
    """Supprimer un template et tous ses mappings associés"""
    connection = None
    cursor = None
    try:
        logging.info(f"Attempting to delete template and its mappings: {template_id}")
        connection = get_connection()
        cursor = connection.cursor()
        
        # Start transaction
        connection.start_transaction()
        
        # First, delete all mappings for this template
        cursor.execute("DELETE FROM Mappings WHERE template_id = %s", (template_id,))
        deleted_mappings = cursor.rowcount
        
        # Then delete the template itself
        cursor.execute("DELETE FROM Templates WHERE id = %s", (template_id,))
        deleted_templates = cursor.rowcount
        
        if deleted_templates == 0:
            connection.rollback()
            raise HTTPException(status_code=404, detail=f"Template '{template_id}' non trouvé")
            
        connection.commit()
        logging.info(f"Successfully deleted template '{template_id}' and {deleted_mappings} mappings")
        
        return {
            "success": True,
            "message": f"Template '{template_id}' et ses {deleted_mappings} mappings ont été supprimés avec succès"
        }
        
    except Error as e:
        if connection:
            connection.rollback()
        error_msg = f"Erreur lors de la suppression du template {template_id}: {str(e)}"
        logging.error(error_msg, exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)
        
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

# Pydantic model for invoice data
class InvoiceData(BaseModel):
    fournisseur: str
    numeroFacture: str
    tauxTVA: float
    montantHT: float
    montantTVA: float
    montantTTC: float

# Fonction pour écrire dans un fichier DBF FoxPro

def write_invoice_to_dbf(invoice_data, dbf_path='factures.dbf'):
    """
    Ajoute une facture dans un fichier DBF compatible FoxPro.
    Si le fichier n'existe pas, il est créé automatiquement avec la bonne structure.
    """
    import os
    
    try:
        # Vérifier si le fichier existe et n'est pas vide
        if os.path.exists(dbf_path) and os.path.getsize(dbf_path) == 0:
            os.remove(dbf_path)
            logging.info("Fichier DBF vide supprimé")
        
        # Créer le fichier DBF s'il n'existe pas
        if not os.path.exists(dbf_path):
            logging.info("Création automatique du fichier factures.dbf")
            # Créer la table DBF avec une structure compatible FoxPro
            table = dbf.Table(
                dbf_path,
                'fournissr C(30); numfact C(15); tauxtva N(5,2); mntht N(10,2); mnttva N(10,2); mntttc N(10,2)'
            )
            table.open(mode=dbf.READ_WRITE)
            table.close()
            logging.info("Fichier factures.dbf créé avec succès")
        
        # Ouvrir la table existante
        table = dbf.Table(dbf_path)
        table.open(mode=dbf.READ_WRITE)
        
        # Ajouter la facture
        table.append((
            invoice_data['fournisseur'],
            invoice_data.get('numeroFacture', invoice_data.get('numFacture', '')),
            float(invoice_data['tauxTVA']),
            float(invoice_data['montantHT']),
            float(invoice_data['montantTVA']),
            float(invoice_data['montantTTC'])
        ))
        table.close()
        
        logging.info(f"Facture ajoutée au fichier DBF: {invoice_data.get('numeroFacture', 'N/A')}")
        
    except Exception as e:
        logging.error(f"Erreur lors de l'écriture dans le fichier DBF: {e}")
        # En cas d'erreur, essayer de recréer le fichier
        try:
            if os.path.exists(dbf_path):
                os.remove(dbf_path)
            table = dbf.Table(
                dbf_path,
                'fournissr C(30); numfact C(15); tauxtva N(5,2); mntht N(10,2); mnttva N(10,2); mntttc N(10,2)'
            )
            table.open(mode=dbf.READ_WRITE)
            table.append((
                invoice_data['fournisseur'],
                invoice_data.get('numeroFacture', invoice_data.get('numFacture', '')),
                float(invoice_data['tauxTVA']),
                float(invoice_data['montantHT']),
                float(invoice_data['montantTVA']),
                float(invoice_data['montantTTC'])
            ))
            table.close()
            logging.info("Fichier DBF recréé et facture ajoutée avec succès")
        except Exception as retry_error:
            logging.error(f"Erreur fatale lors de la création du fichier DBF: {retry_error}")
            raise retry_error


@app.post("/ajouter-facture")
async def ajouter_facture(
    invoice: InvoiceData,
    current_user = Depends(require_comptable_or_admin)
):
    """
    Save invoice data to the database.
    """
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        # Insert the invoice data
        query = """
        INSERT INTO Facture 
        (fournisseur, numFacture, tauxTVA, montantHT, montantTVA, montantTTC)
        VALUES (%s, %s, %s, %s, %s, %s)
        """
        values = (
            invoice.fournisseur,
            invoice.numeroFacture,  # On garde numeroFacture dans le modèle mais on mappe vers numFacture en DB
            invoice.tauxTVA,
            invoice.montantHT,
            invoice.montantTVA,
            invoice.montantTTC
        )
        cursor.execute(query, values)
        connection.commit()
        # Enregistrer aussi dans le fichier DBF FoxPro
        write_invoice_to_dbf(invoice.dict())
        return {
            "success": True,
            "message": "Facture enregistrée avec succès",
            "invoice_id": cursor.lastrowid
        }
    except mysql.connector.IntegrityError as e:
        if "unique_invoice" in str(e).lower() or "duplicate" in str(e).lower():
            # Essayer de mettre à jour l'enregistrement existant
            try:
                update_query = """
                UPDATE Facture 
                SET tauxTVA = %s, montantHT = %s, montantTVA = %s, montantTTC = %s
                WHERE fournisseur = %s AND numFacture = %s
                """
                update_values = (
                    invoice.tauxTVA,
                    invoice.montantHT,
                    invoice.montantTVA,
                    invoice.montantTTC,
                    invoice.fournisseur,
                    invoice.numeroFacture
                )
                cursor.execute(update_query, update_values)
                connection.commit()
                
                return {
                    "success": True,
                    "message": "Facture mise à jour avec succès (remplacement de l'enregistrement existant)",
                    "invoice_id": "updated"
                }
            except Exception as update_error:
                return {
                    "success": False,
                    "message": f"Erreur lors de la mise à jour: {str(update_error)}"
                }
        return {
            "success": False,
            "message": f"Erreur d'intégrité de la base de données: {str(e)}"
        }
    except Error as e:
        logging.error(f"Error saving invoice: {e}")
        return {
            "success": False,
            "message": f"Erreur lors de l'enregistrement de la facture: {str(e)}"
        }
    finally:
        if connection and connection.is_connected():
            if cursor:
                cursor.close()
            connection.close()

@app.get("/download-dbf")
async def download_dbf():
    dbf_path = "factures.dbf"
    if not os.path.exists(dbf_path):
        raise HTTPException(status_code=404, detail="Fichier DBF non trouvé")
    return FileResponse(
        path=dbf_path,
        filename="factures.dbf",
        media_type="application/octet-stream"
    )

@app.post("/save-corrected-data")
async def save_corrected_data(corrected_data: Dict[str, str]):
    """Sauvegarder les données corrigées par l'utilisateur pour FoxPro"""
    try:
        # Récupérer les données d'extraction originales
        if not os.path.exists('ocr_extraction.json'):
            return {
                "success": False,
                "message": "Aucune donnée d'extraction trouvée. Veuillez d'abord extraire une facture."
            }
        
        # Lire les données originales
        with open('ocr_extraction.json', 'r', encoding='utf-8') as f:
            original_data = json.load(f)
        
        # Sauvegarder avec les données corrigées
        save_extraction_for_foxpro(
            extracted_data=original_data.get('data', {}),
            confidence_scores=original_data.get('confidence_scores', {}),
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
        
        # Vérifier si le fichier d'extraction existe
        if not os.path.exists('ocr_extraction.json'):
            return {
                "success": False,
                "message": "Aucune donnée extraite trouvée. Veuillez d'abord extraire une facture via l'interface web."
            }
        
        # Vérifier si le fichier DBF existe, sinon le créer
        if not os.path.exists('factures.dbf'):
            try:
                # Créer un fichier DBF vide avec la bonne structure
                table = dbf.Table(
                    'factures.dbf',
                    'fournissr C(30); numfact C(15); tauxtva N(5,2); mntht N(10,2); mnttva N(10,2); mntttc N(10,2)'
                )
                table.open(mode=dbf.READ_WRITE)
                table.close()
                logging.info("Fichier factures.dbf créé automatiquement")
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
                result = subprocess.run(['where', 'vfp9.exe'], capture_output=True, text=True)
                if result.returncode == 0:
                    foxpro_path = result.stdout.strip().split('\n')[0]
            except:
                pass
        
        if not foxpro_path or not os.path.exists(foxpro_path):
            return {
                "success": False,
                "message": "FoxPro non trouvé. Vérifiez l'installation ou ajoutez-le au PATH."
            }
        
        # Lancer FoxPro avec le formulaire
        if platform.system() == "Windows":
            subprocess.Popen([foxpro_path, "formulaire_foxpro_final.prg"], 
                           cwd=os.getcwd(),
                           shell=True)
        else:
            return {
                "success": False,
                "message": "Cette fonctionnalité n'est disponible que sur Windows."
            }
        
        return {
            "success": True,
            "message": "FoxPro lancé avec succès. Le formulaire devrait s'ouvrir."
        }
        
    except Exception as e:
        logging.error(f"Erreur lors du lancement de FoxPro: {e}")
        return {
            "success": False,
            "message": f"Erreur lors du lancement de FoxPro: {str(e)}"
        }

if __name__ == "__main__":
    import uvicorn
    import signal
    import sys
    
    def signal_handler(sig, frame):
        print("\nShutting down server gracefully...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Server error: {e}")
        sys.exit(1)