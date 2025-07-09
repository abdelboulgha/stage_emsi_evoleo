import cv2
import numpy as np
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
from PyPDF2 import PdfReader
import tempfile
import os
import sys
from pathlib import Path
import re
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import json

app = FastAPI(title="Invoice Data Extractor API")

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InvoiceExtractor:
    def __init__(self):
        self.setup_paths()

    def setup_paths(self):
        try:
            if sys.platform == 'win32':
                pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
                self.poppler_path = r'C:\Program Files\poppler-24.08.0\Library\bin'
            elif sys.platform == 'darwin':
                self.poppler_path = '/opt/homebrew/bin'
            else:
                self.poppler_path = '/usr/bin'
        except Exception as e:
            print(f"Path setup failed: {str(e)}")

    def preprocess_image(self, img: Image.Image) -> Image.Image:
        # Convert to grayscale, binarize, denoise
        img_cv = np.array(img)
        if len(img_cv.shape) == 3:
            img_cv = cv2.cvtColor(img_cv, cv2.COLOR_RGB2GRAY)
        _, img_cv = cv2.threshold(img_cv, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        img_cv = cv2.medianBlur(img_cv, 3)
        return Image.fromarray(img_cv)

    def extract_text(self, file_path: str) -> str:
        ext = Path(file_path).suffix.lower()
        if ext == '.pdf':
            # Convert PDF to images, OCR each page
            images = convert_from_path(file_path, poppler_path=self.poppler_path)
            texts = []
            for img in images:
                pre_img = self.preprocess_image(img)
                text = pytesseract.image_to_string(pre_img, lang='fra')
                texts.append(text)
            return "\n\n".join(texts)
        elif ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
            img = Image.open(file_path)
            pre_img = self.preprocess_image(img)
            return pytesseract.image_to_string(pre_img, lang='fra')
        else:
            raise HTTPException(status_code=400, detail="Format de fichier non supporté")

    def extract_fields(self, text: str) -> dict:
        # Regex-based extraction for French invoices
        fields = {
            "fournisseur": None,
            "montant_ht": None,
            "tva": None,
            "montant_ttc": None,
            "numero_facture": None,
            "date_facture": None
        }
        
        print("=== EXTRACTING FIELDS ===")
        
        # Numéro de facture - look for IN2411-0001 pattern
        numero_facture = re.search(r'IN\d{4}-\d{4}', text)
        if numero_facture:
            fields["numero_facture"] = numero_facture.group(0).strip()
            print(f"Found numero_facture: {fields['numero_facture']}")
        
        # Fournisseur - look for 'capi' or similar
        fournisseur = re.search(r'\b(capi|adress)\b', text, re.I)
        if fournisseur:
            fields["fournisseur"] = fournisseur.group(1).strip()
            print(f"Found fournisseur: {fields['fournisseur']}")
        
        # Montant HT - look for "275,00" pattern
        montant_ht = re.search(r'\b(\d{1,3}(?:,\d{2})?)\s*DH?\b', text)
        if montant_ht:
            # Find the one that's likely the HT amount (look for Total HT context)
            ht_matches = re.findall(r'Total\s+HT[^\d]*(\d{1,3}(?:,\d{2})?)', text, re.I)
            if ht_matches:
                fields["montant_ht"] = ht_matches[0]
                print(f"Found montant_ht: {fields['montant_ht']}")
        
        # TVA - look for "20%" pattern
        tva = re.search(r'\b(\d{1,2}%)\b', text)
        if tva:
            fields["tva"] = tva.group(1).strip()
            print(f"Found tva: {fields['tva']}")
        
        # Montant TTC - look for "330,00" pattern in TTC context
        ttc_matches = re.findall(r'Total\s+TTC[^\d]*(\d{1,3}(?:,\d{2})?)', text, re.I)
        if ttc_matches:
            fields["montant_ttc"] = ttc_matches[0]
            print(f"Found montant_ttc: {fields['montant_ttc']}")
        
        # Date de facture - look for date pattern
        date_facture = re.search(r'\b(\d{2}/\d{2}/\d{4})\b', text)
        if date_facture:
            fields["date_facture"] = date_facture.group(1).strip()
            print(f"Found date_facture: {fields['date_facture']}")
        
        print(f"Final extracted fields: {fields}")
        return fields

    def extract_invoice_data(self, file_path: str) -> dict:
        try:
            print(f"Processing file: {file_path}")
            text = self.extract_text(file_path)
            if not text or len(text.strip()) < 10:
                raise HTTPException(status_code=400, detail="Aucun texte trouvé dans le fichier")
            print(f"Extracted text length: {len(text)}")
            print("=== START OCRed text ===")
            print(text[:1000])
            print("=== END OCRed text ===")
            extracted_data = self.extract_fields(text)
            print(f"Final extracted data: {extracted_data}")
            return extracted_data
        except Exception as e:
            print(f"Error in extract_invoice_data: {e}")
            import traceback
            traceback.print_exc()
            raise

extractor = InvoiceExtractor()

MAPPING_FILE = "fournisseur_mappings.json"
def load_mappings():
    if not os.path.exists(MAPPING_FILE):
        return {}
    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)
def save_mappings(mappings):
    with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
        json.dump(mappings, f, ensure_ascii=False, indent=2)

def sanitize_field(field, value):
    if not isinstance(value, str):
        return value
    value = value.strip()
    if field in ["montantHT", "montantTVA", "montantTTC"]:
        value = value.replace(" ", "").replace(",", ".")
        value = ''.join(c for c in value if c.isdigit() or c == '.')
    elif field == "tauxTVA":
        value = value.replace("%", "").replace(" ", "")
        value = ''.join(c for c in value if c.isdigit() or c == '.')
    return value

def ocr_with_boxes(file_path):
    ext = Path(file_path).suffix.lower()
    if ext == '.pdf':
        # Convert PDF to images first
        images = convert_from_path(file_path, poppler_path=extractor.poppler_path)
        if images:
            img = images[0]  # Use first page
        else:
            return []
    else:
        img = Image.open(file_path)
    
    data = pytesseract.image_to_data(img, lang='fra', output_type=pytesseract.Output.DICT)
    results = []
    for i, word in enumerate(data['text']):
        if word.strip():
            results.append({
                'text': word,
                'left': data['left'][i],
                'top': data['top'][i],
                'width': data['width'][i],
                'height': data['height'][i]
            })
    return results

@app.post("/ocr-with-boxes")
async def ocr_boxes(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name
    try:
        boxes = ocr_with_boxes(tmp_file_path)
        return {"boxes": boxes}
    finally:
        try:
            os.unlink(tmp_file_path)
        except:
            pass

@app.post("/save-mapping")
async def save_mapping(fournisseur: str, request: Request):
    field_map = await request.json()
    mappings = load_mappings()
    mappings[fournisseur] = {"field_map": field_map}
    save_mappings(mappings)
    return {"success": True}

def extract_from_mapping(file_path, mapping):
    try:
        ext = Path(file_path).suffix.lower()
        if ext == '.pdf':
            images = convert_from_path(file_path, poppler_path=extractor.poppler_path)
            if images:
                img = images[0]
            else:
                return {}
        else:
            img = Image.open(file_path)
        result = dict()  # Ensure this is a standard Python dict
        for field, box in mapping.items():
            try:
                print(f"Processing field: {field}, box: {box}")
                left = int(box.get('left', 0) or 0)
                top = int(box.get('top', 0) or 0)
                width = int(box.get('width', 0) or 0)
                height = int(box.get('height', 0) or 0)
                print(f"Cropping region: left={left}, top={top}, right={left+width}, bottom={top+height}")
                # Add margin to the crop box
                margin = 10
                crop_left = max(0, left - margin)
                crop_top = max(0, top - margin)
                crop_right = min(img.width, left + width + margin)
                crop_bottom = min(img.height, top + height + margin)
                region = img.crop((crop_left, crop_top, crop_right, crop_bottom))
                print(f"Cropped region size for {field}: {region.size}")
                # Save cropped region for debug
                debug_path = f"debug_{field}.png"
                try:
                    region.save(debug_path)
                    print(f"Saved cropped region for {field} to {debug_path}")
                except Exception as e:
                    print(f"Failed to save cropped region for {field}: {e}")
                text = pytesseract.image_to_string(region, lang='fra').strip()
                print(f"OCR result for {field}: '{text}'")
                sanitized = sanitize_field(field, text)
                if sanitized is None:
                    sanitized = ''
                result[str(field)] = str(sanitized)
            except KeyError as e:
                print(f"Missing key in box for field {field}: {e}")
                continue
            except Exception as e:
                print(f"Error processing field {field}: {e}")
                continue
        return result
    except Exception as e:
        print(f"Error in extract_from_mapping: {e}")
        return {}

@app.post("/extract-invoice")
async def extract_invoice(file: UploadFile = File(...)):
    print(f"Received file: {file.filename}, type: {file.content_type}")
    if not file.content_type or not file.content_type.startswith(('image/', 'application/pdf')):
        raise HTTPException(
            status_code=400,
            detail="Type de fichier non supporté. Utilisez PDF ou images."
        )
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name
    try:
        mappings = load_mappings()
        fournisseur_name = None
        # Try to extract fournisseur name using OCR
        ocr_text = extractor.extract_text(tmp_file_path)
        for fournisseur in mappings:
            if fournisseur.lower() in ocr_text.lower():
                fournisseur_name = fournisseur
                break
        if fournisseur_name:
            try:
                field_map = mappings[fournisseur_name]["field_map"]
                print(f"Using mapping for {fournisseur_name}: {field_map}")
                mapped_data = extract_from_mapping(tmp_file_path, field_map)
                # Fill all expected fields, leave blank if not mapped
                mapped_data = {
                    "numeroFacture": mapped_data.get("numeroFacture", ""),
                    "emetteur": fournisseur_name,
                    "client": "",
                    "tauxTVA": mapped_data.get("tauxTVA", ""),
                    "montantHT": mapped_data.get("montantHT", ""),
                    "montantTVA": mapped_data.get("montantTVA", ""),
                    "montantTTC": mapped_data.get("montantTTC", "")
                }
                return JSONResponse(content={
                    "success": True,
                    "data": mapped_data,
                    "filename": file.filename,
                    "used_mapping": True
                })
            except Exception as e:
                print(f"Error using mapping for {fournisseur_name}: {e}")
                # Fall back to regular extraction
                pass
        else:
            extracted_data = extractor.extract_invoice_data(tmp_file_path)
            mapped_data = {
                "numeroFacture": extracted_data.get("numero_facture", ""),
                "emetteur": extracted_data.get("fournisseur", ""),
                "client": "",
                "tauxTVA": extracted_data.get("tva", ""),
                "montantHT": extracted_data.get("montant_ht", ""),
                "montantTVA": "",
                "montantTTC": extracted_data.get("montant_ttc", "")
            }
            return JSONResponse(content={
                "success": True,
                "data": mapped_data,
                "filename": file.filename,
                "used_mapping": False
            })
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'extraction: {str(e)}")
    finally:
        try:
            os.unlink(tmp_file_path)
        except:
            pass

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Invoice extraction service is running"}

@app.get("/")
async def root():
    return {"message": "Invoice Data Extractor API", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)