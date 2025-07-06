from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import sys
from pathlib import Path
import json
from typing import Optional
import re

# Imports pour l'extraction (basés sur votre code existant)
from ollama import Client
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
from PyPDF2 import PdfReader
import numpy as np
import easyocr

app = FastAPI(title="Invoice Data Extractor API")

# Configuration CORS pour permettre les requêtes depuis le frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Ports React/Vite communs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InvoiceExtractor:
    def __init__(self):
        self.client = Client()
        self.setup_paths()
        # Prompt spécialisé pour vos données spécifiques
        self.llm_prompt = """Analysez cette facture française et extrayez EXACTEMENT les informations suivantes au format JSON.

Recherchez ces champs précis:
- numeroFacture: le numéro de la facture (ex: IN2411-0001, FAC-2024-001, etc.)
- emetteur: le nom de l'entreprise qui émet la facture
- client: le nom du client/destinataire de la facture
- tauxTVA: le taux de TVA en pourcentage (généralement 20%)
- montantHT: le montant hors taxe (Total HT)
- montantTVA: le montant de la TVA
- montantTTC: le montant toutes taxes comprises (Total TTC)

Format de réponse souhaité (UNIQUEMENT ce JSON, rien d'autre):
{{
  "numeroFacture": "numéro trouvé ou null",
  "emetteur": "nom émetteur ou null",
  "client": "nom client ou null", 
  "tauxTVA": nombre_decimal_ou_null,
  "montantHT": nombre_decimal_ou_null,
  "montantTVA": nombre_decimal_ou_null,
  "montantTTC": nombre_decimal_ou_null
}}

Si une information n'est pas trouvée, utilisez null.
Les montants doivent être des nombres décimaux (ex: 275.00, pas "275,00").

Texte de la facture :
{text}"""

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

    def extract_text(self, file_path: str) -> list:
        """Extrait le texte d'un fichier PDF ou image"""
        ext = Path(file_path).suffix.lower()
        
        if ext == '.pdf':
            # Essayer PyPDF2 d'abord
            try:
                reader = PdfReader(file_path)
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                if self.is_good_enough(text):
                    print(f"PyPDF2 extraction successful, text length: {len(text)}")
                    return [text]
            except Exception as e:
                print(f"PyPDF2 failed: {e}")

            # Fallback vers OCR
            try:
                print("Using OCR fallback for PDF")
                images = convert_from_path(file_path, poppler_path=self.poppler_path)
                return [self.ocr_image(img) for img in images]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")
                
        elif ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
            try:
                print("Processing image file")
                img = Image.open(file_path)
                return [self.ocr_image(img)]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Format de fichier non supporté")

    def ocr_image(self, img) -> str:
        """Extrait le texte d'une image avec EasyOCR"""
        # Redimensionner si nécessaire
        max_width = 1200
        if hasattr(img, 'width') and img.width > max_width:
            ratio = max_width / img.width
            try:
                img = img.resize((max_width, int(img.height * ratio)), Image.Resampling.LANCZOS)
            except AttributeError:
                img = img.resize((max_width, int(img.height * ratio)), 1)

        # Convertir en array numpy
        if hasattr(img, 'convert'):
            img = np.array(img)

        try:
            print("Initializing EasyOCR...")
            reader = easyocr.Reader(['fr'], gpu=False)
            result = reader.readtext(img, detail=0, paragraph=True)
            extracted_text = '\n'.join(result)
            print(f"OCR extraction successful, text length: {len(extracted_text)}")
            return extracted_text
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    def is_good_enough(self, text: str) -> bool:
        """Vérifie si le texte extrait semble être une facture"""
        return (
            text and len(text) > 50 and
            any(word in text.lower() for word in ["facture", "tva", "total", "ht", "ttc", "émetteur"])
        )

    def query_llm(self, text: str) -> Optional[dict]:
        """Interroge le LLM pour extraire les données structurées"""
        try:
            print(f"Sending text to LLM (length: {len(text)})")
            
            # Limiter la taille du texte
            if len(text) > 4000:
                text = text[:4000] + "\n[...text truncated...]"

            full_prompt = self.llm_prompt.format(text=text)
            print("Prompt sent to LLM:")
            print("-" * 50)
            print(full_prompt[:500] + "..." if len(full_prompt) > 500 else full_prompt)
            print("-" * 50)
            
            response = self.client.generate(
                model='mistral',
                prompt=full_prompt,
                options={
                    'temperature': 0.1,
                    'num_predict': 400
                }
            )
            
            raw_response = response.response.strip()
            print(f"Raw LLM response: {raw_response}")
            
            # Essayer de parser le JSON
            try:
                # Nettoyer la réponse pour extraire le JSON
                json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group()
                    parsed_data = json.loads(json_str)
                    print(f"Successfully parsed JSON: {parsed_data}")
                    return self.clean_extracted_data(parsed_data)
                else:
                    print("No JSON found, using fallback parser")
                    return self.parse_fallback(text)
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}, using fallback parser")
                return self.parse_fallback(text)
                
        except Exception as e:
            print(f"LLM query failed: {str(e)}")
            return self.parse_fallback(text)

    def clean_extracted_data(self, data: dict) -> dict:
        """Nettoie et valide les données extraites"""
        cleaned = {
            "numeroFacture": None,
            "emetteur": None,
            "client": None,
            "tauxTVA": None,
            "montantHT": None,
            "montantTVA": None,
            "montantTTC": None
        }
        
        for key, value in data.items():
            if key in cleaned and value is not None:
                if key in ['tauxTVA', 'montantHT', 'montantTVA', 'montantTTC']:
                    # Convertir en float
                    if isinstance(value, str):
                        # Remplacer virgule par point et enlever espaces
                        value = value.replace(',', '.').replace(' ', '').replace('€', '').replace('DH', '')
                        try:
                            cleaned[key] = float(value)
                        except ValueError:
                            print(f"Could not convert {key}: {value} to float")
                            cleaned[key] = None
                    elif isinstance(value, (int, float)):
                        cleaned[key] = float(value)
                else:
                    # Chaînes de caractères
                    cleaned[key] = str(value).strip() if value else None
        
        return cleaned

    def parse_fallback(self, text: str) -> dict:
        """Parser de secours si le JSON n'est pas valide"""
        print("Using fallback regex parser")
        result = {
            "numeroFacture": None,
            "emetteur": None,
            "client": None,
            "tauxTVA": None,
            "montantHT": None,
            "montantTVA": None,
            "montantTTC": None
        }
        
        # Patterns regex pour extraction
        patterns = {
            "numeroFacture": [
                r"(?:facture|invoice|n°|numéro)[\s:]*([A-Z0-9-]+)",
                r"IN\d{4}-\d{4}",
                r"FAC-\d{4}-\d{3,4}"
            ],
            "emetteur": [
                r"(?:émetteur|emetteur)[\s:]*([^\n\r]+)",
                r"^([A-Za-z]+)(?:\s+facture|\s+Facture)",
            ],
            "client": [
                r"(?:adressé à|client|destinataire)[\s:]*([^\n\r]+)",
                r"(?:tier|Tier)[\s:]*(\d+)",
            ],
            "tauxTVA": [
                r"(\d+(?:[.,]\d+)?)%",
                r"TVA[\s:]*(\d+(?:[.,]\d+)?)%"
            ],
            "montantHT": [
                r"(?:total ht|montant ht|ht)[\s:]*(\d+(?:[.,]\d{2})?)",
                r"Total HT[\s:]*(\d+(?:[.,]\d{2})?)"
            ],
            "montantTVA": [
                r"(?:total tva|montant tva|tva)[\s:]*(\d+(?:[.,]\d{2})?)",
                r"Total TVA[\s:]*\d+%[\s:]*(\d+(?:[.,]\d{2})?)"
            ],
            "montantTTC": [
                r"(?:total ttc|montant ttc|ttc)[\s:]*(\d+(?:[.,]\d{2})?)",
                r"Total TTC[\s:]*(\d+(?:[.,]\d{2})?)"
            ]
        }
        
        for key, pattern_list in patterns.items():
            for pattern in pattern_list:
                match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
                if match:
                    value = match.group(1).strip()
                    if key in ['tauxTVA', 'montantHT', 'montantTVA', 'montantTTC']:
                        try:
                            # Convertir en float
                            value = value.replace(',', '.')
                            result[key] = float(value)
                            print(f"Extracted {key}: {result[key]}")
                            break
                        except ValueError:
                            continue
                    else:
                        result[key] = value
                        print(f"Extracted {key}: {result[key]}")
                        break
        
        return result

    def extract_invoice_data(self, file_path: str) -> dict:
        """Méthode principale pour extraire les données d'une facture"""
        print(f"Processing file: {file_path}")
        page_texts = self.extract_text(file_path)
        
        if not page_texts or not any(t.strip() for t in page_texts):
            raise HTTPException(status_code=400, detail="Aucun texte trouvé dans le fichier")

        # Combiner le texte de toutes les pages
        combined_text = "\n\n".join(page_texts)
        print(f"Combined text length: {len(combined_text)}")
        print("Combined text preview:")
        print(combined_text[:500] + "..." if len(combined_text) > 500 else combined_text)
        
        # Extraire les données avec le LLM
        extracted_data = self.query_llm(combined_text)
        
        if extracted_data is None:
            raise HTTPException(status_code=500, detail="Échec de l'extraction des données")
        
        print(f"Final extracted data: {extracted_data}")
        return extracted_data

# Instance globale de l'extracteur
extractor = InvoiceExtractor()

@app.post("/extract-invoice")
async def extract_invoice(file: UploadFile = File(...)):
    """Endpoint pour extraire les données d'une facture"""
    
    print(f"Received file: {file.filename}, type: {file.content_type}")
    
    # Vérifier le type de fichier
    if not file.content_type.startswith(('image/', 'application/pdf')):
        raise HTTPException(
            status_code=400, 
            detail="Type de fichier non supporté. Utilisez PDF ou images."
        )
    
    # Créer un fichier temporaire
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name
    
    try:
        # Extraire les données
        extracted_data = extractor.extract_invoice_data(tmp_file_path)
        
        return JSONResponse(content={
            "success": True,
            "data": extracted_data,
            "filename": file.filename
        })
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'extraction: {str(e)}")
    finally:
        # Nettoyer le fichier temporaire
        try:
            os.unlink(tmp_file_path)
        except:
            pass

@app.get("/health")
async def health_check():
    """Endpoint de vérification de l'état du service"""
    return {"status": "healthy", "message": "Invoice extraction service is running"}

@app.get("/")
async def root():
    return {"message": "Invoice Data Extractor API", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)