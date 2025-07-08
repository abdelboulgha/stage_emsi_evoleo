from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import sys
from pathlib import Path
import json
from typing import Optional, List, Dict
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Imports optimisés
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
from PyPDF2 import PdfReader
import numpy as np

app = FastAPI(title="Smart Multi-Format Invoice Extractor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SmartMultiFormatExtractor:
    def __init__(self):
        self.setup_paths()
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Patterns pour détecter le type de facture
        self.invoice_type_patterns = {
            "radeema": [
                r"RADEEMA",
                r"FACTURE EAU",
                r"Régie Autonome",
                r"Ville de MARRAKECH.*Agence.*GUELIZ"
            ],
            "lydec": [
                r"LYDEC",
                r"Lyonnaise des Eaux",
                r"Casablanca"
            ],
            "commercial": [
                r"SARL|SA|SASU|SAS",
                r"Émetteur",
                r"Adressé à",
                r"Total HT.*Total TVA.*Total TTC"
            ]
        }
        
        # Patterns spécifiques pour factures RADEEMA
        self.radeema_patterns = {
            "numeroFacture": [
                r"FACTURE EAU N°?\s*([0-9]{10,15})",
                r"([0-9]{12})",  # Pattern pour les longs numéros
                r"N°?\s*([0-9]{10,15})"
            ],
            "emetteur": [
                r"(RADEEMA)",
                r"(Régie Autonome de Distribution d'Eau et d'Électricité)"
            ],
            "client": [
                r"Nom et Adresse du client\s*([A-Za-z\s]+)",
                r"Client\s*([A-Za-z\s]+)"
            ]
        }
        
        # Patterns pour factures commerciales (EVOLEO, etc.)
        self.commercial_patterns = {
            "numeroFacture": [
                r"[Ff]acture\s+([0-9]{6}-[A-Z]{2}[0-9]{3})",
                r"([0-9]{6}-[A-Z]{2}[0-9]{3})",
                r"([A-Z]{2}[0-9]{4}-[0-9]{4})",
                r"([A-Z]{3}-[0-9]{4}-[0-9]{3})"
            ],
            "emetteur": [
                r"([A-Z][A-Z\s&.]{3,30}\s+SARL)",
                r"([A-Z][A-Z\s&.]{3,30}\s+SA)\b",
                r"Émetteur\s*\n\s*([A-Z][A-Za-z\s&.]{3,40})"
            ],
            "client": [
                r"(?:adressé\s+à|client|destinataire)\s*:?\s*\n?\s*([A-Za-z\s&.]{5,50})",
                r"(?:À|A)\s*:?\s*\n?\s*([A-Za-z\s&.]{5,50})"
            ]
        }
        
        # Configuration Tesseract
        self.tesseract_config = '--oem 3 --psm 6 -l fra+eng'

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

    def detect_invoice_type(self, text: str) -> str:
        """Détecter automatiquement le type de facture"""
        text_lower = text.lower()
        
        # Vérifier RADEEMA en premier (plus spécifique)
        for pattern in self.invoice_type_patterns["radeema"]:
            if re.search(pattern, text, re.IGNORECASE):
                print("Detected invoice type: RADEEMA")
                return "radeema"
        
        # Vérifier LYDEC
        for pattern in self.invoice_type_patterns["lydec"]:
            if re.search(pattern, text, re.IGNORECASE):
                print("Detected invoice type: LYDEC") 
                return "lydec"
        
        # Vérifier facture commerciale
        for pattern in self.invoice_type_patterns["commercial"]:
            if re.search(pattern, text, re.IGNORECASE):
                print("Detected invoice type: Commercial")
                return "commercial"
        
        # Default à commercial
        print("Detected invoice type: Commercial (default)")
        return "commercial"

    def extract_text_fast(self, file_path: str) -> str:
        """Extraction de texte optimisée"""
        ext = Path(file_path).suffix.lower()
        
        if ext == '.pdf':
            # PyPDF2 d'abord
            try:
                reader = PdfReader(file_path)
                text = ""
                for page in reader.pages[:2]:
                    page_text = page.extract_text() or ""
                    text += page_text + "\n"
                
                if len(text.strip()) > 50:
                    print(f"PyPDF2 extraction: {len(text)} chars")
                    return text.strip()
            except Exception as e:
                print(f"PyPDF2 failed: {e}")

            # Fallback OCR
            try:
                images = convert_from_path(file_path, first_page=1, last_page=1, dpi=300, poppler_path=self.poppler_path)
                if images:
                    return self.enhanced_ocr(images[0])
            except Exception as e:
                print(f"PDF conversion failed: {e}")
                return ""
                
        elif ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
            try:
                img = Image.open(file_path)
                return self.enhanced_ocr(img)
            except Exception as e:
                print(f"Image processing failed: {e}")
                return ""
        
        return ""

    def enhanced_ocr(self, image) -> str:
        """OCR amélioré"""
        try:
            # Préprocessing
            processed_img = self.preprocess_image(image)
            
            # OCR
            text = pytesseract.image_to_string(
                processed_img,
                config=self.tesseract_config,
                lang='fra'
            )
            
            print(f"OCR extracted: {len(text)} chars")
            return text.strip()
            
        except Exception as e:
            print(f"OCR failed: {e}")
            return ""

    def preprocess_image(self, image):
        """Préprocessing d'image"""
        if hasattr(image, 'convert'):
            # Redimensionner
            max_width = 2000
            if image.width > max_width:
                ratio = max_width / image.width
                new_height = int(image.height * ratio)
                image = image.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            # Niveaux de gris
            if image.mode != 'L':
                image = image.convert('L')
            
            # Améliorer contraste
            img_array = np.array(image)
            img_array = np.clip(img_array * 1.2, 0, 255).astype(np.uint8)
            return Image.fromarray(img_array)
        
        return image

    def extract_radeema_amounts(self, text: str) -> Dict[str, float]:
        """Extraction spécifique pour factures RADEEMA"""
        amounts = {"montantHT": None, "montantTVA": None, "montantTTC": None}
        
        # Patterns spécifiques pour RADEEMA
        # Le montant TTC est souvent affiché comme "Montant TTC (Dh)" suivi du montant
        patterns = {
            "montantTTC": [
                r"Montant TTC \(Dh\)\s*([0-9]+[.,][0-9]{2})",
                r"TTC.*?([0-9]+[.,][0-9]{2})",
                r"Total.*?([0-9]+[.,][0-9]{2})\s*$"
            ],
            "montantHT": [
                r"Total Hors Taxes\s*([0-9]+[.,][0-9]{2})",
                r"Hors Taxes.*?([0-9]+[.,][0-9]{2})",
                r"HT.*?([0-9]+[.,][0-9]{2})"
            ],
            "montantTVA": [
                r"Total TVA\s*([0-9]+[.,][0-9]{2})",
                r"TVA.*?([0-9]+[.,][0-9]{2})"
            ]
        }
        
        # Chercher les montants ligne par ligne pour plus de précision
        lines = text.split('\n')
        for line in lines:
            # Chercher une ligne qui contient "Total" et des montants
            if 'total' in line.lower() and re.search(r'[0-9]+[.,][0-9]{2}', line):
                numbers = re.findall(r'([0-9]+[.,][0-9]{2})', line)
                if len(numbers) >= 2:
                    # Souvent le format est : Total HT | Total TVA | Total TTC
                    try:
                        if len(numbers) >= 3:
                            amounts["montantHT"] = float(numbers[0].replace(',', '.'))
                            amounts["montantTVA"] = float(numbers[1].replace(',', '.'))
                            amounts["montantTTC"] = float(numbers[2].replace(',', '.'))
                        elif len(numbers) == 2:
                            amounts["montantHT"] = float(numbers[0].replace(',', '.'))
                            amounts["montantTTC"] = float(numbers[1].replace(',', '.'))
                    except ValueError:
                        continue
        
        # Patterns regex spécifiques
        for field, field_patterns in patterns.items():
            if amounts[field] is None:
                for pattern in field_patterns:
                    match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
                    if match:
                        try:
                            value = float(match.group(1).replace(',', '.'))
                            amounts[field] = value
                            print(f"RADEEMA - Extracted {field}: {value}")
                            break
                        except ValueError:
                            continue
        
        return amounts

    def extract_commercial_amounts(self, text: str) -> Dict[str, float]:
        """Extraction pour factures commerciales (EVOLEO, etc.)"""
        amounts = {"montantHT": None, "montantTVA": None, "montantTTC": None}
        
        # Patterns pour factures commerciales
        patterns = {
            "montantHT": [
                r"Total\s+HT\s+([0-9\s]+(?:[.,][0-9]{2})?)",
                r"(?:total\s*ht|montant\s*ht)\s*:?\s*([0-9\s]+(?:[.,][0-9]{2})?)"
            ],
            "montantTVA": [
                r"Total\s+TVA\s+[0-9]+%\s+([0-9\s]+(?:[.,][0-9]{2})?)",
                r"(?:total\s*tva|montant\s*tva)\s*:?\s*([0-9\s]+(?:[.,][0-9]{2})?)"
            ],
            "montantTTC": [
                r"Total\s+TTC\s+([0-9\s]+(?:[.,][0-9]{2})?)",
                r"(?:total\s*ttc|montant\s*ttc)\s*:?\s*([0-9\s]+(?:[.,][0-9]{2})?)"
            ]
        }
        
        for field, field_patterns in patterns.items():
            for pattern in field_patterns:
                match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
                if match:
                    try:
                        value_str = match.group(1).strip()
                        # Nettoyer les espaces dans les nombres (7 000,00 -> 7000,00)
                        clean_value = re.sub(r'\s+', '', value_str)
                        clean_value = clean_value.replace(',', '.')
                        amounts[field] = float(clean_value)
                        print(f"Commercial - Extracted {field}: {amounts[field]}")
                        break
                    except ValueError:
                        continue
        
        return amounts

    def extract_text_fields(self, text: str, invoice_type: str) -> Dict[str, str]:
        """Extraire les champs texte selon le type de facture"""
        result = {"numeroFacture": None, "emetteur": None, "client": None}
        
        if invoice_type == "radeema":
            patterns = self.radeema_patterns
        else:
            patterns = self.commercial_patterns
        
        # Extraction des champs
        for field, field_patterns in patterns.items():
            for pattern in field_patterns:
                match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
                if match:
                    value = match.group(1).strip()
                    if len(value) > 1:
                        result[field] = value
                        print(f"Extracted {field}: {result[field]}")
                        break
        
        return result

    def extract_tva_rate(self, text: str) -> Optional[float]:
        """Extraire le taux de TVA"""
        patterns = [
            r"TVA\s+([0-9]+(?:[.,][0-9]+)?)%",
            r"([0-9]+(?:[.,][0-9]+)?)%\s+TVA",
            r"Total\s+TVA\s+([0-9]+(?:[.,][0-9]+)?)%"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    return float(match.group(1).replace(',', '.'))
                except ValueError:
                    continue
        
        return None

    def validate_and_complete(self, data: dict) -> dict:
        """Valider et compléter les données"""
        ht, tva_amount, ttc = data.get("montantHT"), data.get("montantTVA"), data.get("montantTTC")
        tva_rate = data.get("tauxTVA")
        
        # Calculer les montants manquants
        if ht and tva_amount and not ttc:
            data["montantTTC"] = round(ht + tva_amount, 2)
        elif ttc and tva_amount and not ht:
            data["montantHT"] = round(ttc - tva_amount, 2)
        elif ttc and ht and not tva_amount:
            data["montantTVA"] = round(ttc - ht, 2)
        
        # Calculer le taux TVA
        if not tva_rate and ht and tva_amount and ht > 0:
            calculated_rate = round((tva_amount / ht) * 100, 1)
            if 5 <= calculated_rate <= 25:  # Taux raisonnables
                data["tauxTVA"] = calculated_rate
        
        return data

    def smart_extraction(self, text: str) -> dict:
        """Extraction intelligente selon le type détecté"""
        # Initialiser le résultat
        result = {
            "numeroFacture": None,
            "emetteur": None,
            "client": None,
            "tauxTVA": None,
            "montantHT": None,
            "montantTVA": None,
            "montantTTC": None
        }
        
        # Détecter le type de facture
        invoice_type = self.detect_invoice_type(text)
        
        # Extraire les champs texte
        text_fields = self.extract_text_fields(text, invoice_type)
        result.update(text_fields)
        
        # Extraire les montants selon le type
        if invoice_type == "radeema":
            amounts = self.extract_radeema_amounts(text)
        else:
            amounts = self.extract_commercial_amounts(text)
        
        result.update(amounts)
        
        # Extraire le taux de TVA
        tva_rate = self.extract_tva_rate(text)
        if tva_rate:
            result["tauxTVA"] = tva_rate
        
        # Valider et compléter
        result = self.validate_and_complete(result)
        
        return result

    async def extract_invoice_data(self, file_path: str) -> dict:
        """Méthode principale d'extraction intelligente"""
        loop = asyncio.get_event_loop()
        
        # Extraction du texte
        text = await loop.run_in_executor(self.executor, self.extract_text_fast, file_path)
        
        if not text:
            raise HTTPException(400, "No text could be extracted from file")
        
        print(f"Extracted text length: {len(text)}")
        print("Text preview:")
        print("-" * 50)
        print(text[:600] + "..." if len(text) > 600 else text)
        print("-" * 50)
        
        # Extraction intelligente
        extracted_data = await loop.run_in_executor(self.executor, self.smart_extraction, text)
        
        print(f"Final extraction result: {extracted_data}")
        return extracted_data

# Instance globale
extractor = SmartMultiFormatExtractor()

@app.post("/extract-invoice")
async def extract_invoice(file: UploadFile = File(...)):
    """Endpoint d'extraction intelligente multi-formats"""
    
    print(f"Processing: {file.filename}")
    
    if not file.content_type.startswith(('image/', 'application/pdf')):
        raise HTTPException(400, "Unsupported file type")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name
    
    try:
        start_time = asyncio.get_event_loop().time()
        extracted_data = await extractor.extract_invoice_data(tmp_file_path)
        end_time = asyncio.get_event_loop().time()
        
        processing_time = round(end_time - start_time, 2)
        print(f"Total processing time: {processing_time} seconds")
        
        return JSONResponse(content={
            "success": True,
            "data": extracted_data,
            "filename": file.filename,
            "processing_time_seconds": processing_time,
            "method": "smart_multi_format"
        })
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise HTTPException(500, f"Extraction failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp_file_path)
        except:
            pass

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Smart Multi-Format Extractor"}

@app.on_event("shutdown")
async def shutdown_event():
    extractor.executor.shutdown(wait=True)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)