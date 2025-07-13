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
import time
import asyncio
import concurrent.futures

# Imports pour l'extraction ULTRA-RAPIDE
from ollama import Client
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
from pdf2image import convert_from_path
from PyPDF2 import PdfReader
import numpy as np

app = FastAPI(title="ULTRA-FAST Invoice Data Extractor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SuperFastInvoiceExtractor:
    def __init__(self):
        self.client = Client()
        self.setup_paths()
        
        # Pool de threads minimal
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        
        # Regex ULTRA-SOPHISTIQUÉS pour éviter le LLM
        self.advanced_patterns = self.compile_advanced_patterns()
        
        # LLM de secours seulement si regex échoue
        self.llm_prompt = """Extrayez rapidement ces données JSON de cette facture:

{
  "numeroFacture": "numero_ou_null",
  "emetteur": "emetteur_ou_null",
  "client": "client_ou_null", 
  "tauxTVA": nombre_ou_null,
  "montantHT": nombre_ou_null,
  "montantTVA": nombre_ou_null,
  "montantTTC": nombre_ou_null
}

Texte: {text}"""

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

    def compile_advanced_patterns(self):
        """Patterns regex ULTRA-SOPHISTIQUÉS et PRÉCIS"""
        return {
            "numeroFacture": [
                re.compile(r'Facture\s+([A-Z]{2}\d{4}-\d{4})', re.IGNORECASE),
                re.compile(r'(IN\d{4}-\d{4})', re.IGNORECASE),
                re.compile(r'(FA-\d{2}-\d{5})', re.IGNORECASE),
                re.compile(r'(\d{6}-FA\d{3})', re.IGNORECASE),
                re.compile(r'(?:facture|invoice|n°|numéro)[\s:]*([A-Z0-9-]{4,})', re.IGNORECASE)
            ],
            "emetteur": [
                re.compile(r'^([A-Z][A-Za-z\s]{2,25})(?=\s+Facture)', re.MULTILINE | re.IGNORECASE),
                re.compile(r'^([A-Z][A-Z\s]{3,20})(?:\s+SARL|\s+SA\b)', re.MULTILINE),
                re.compile(r'Émetteur[\s\n]*([A-Z][A-Za-z\s&-]{2,25})', re.IGNORECASE | re.MULTILINE),
                re.compile(r'^([A-Z]{3,15})$', re.MULTILINE)
            ],
            "client": [
                re.compile(r'Adressé à[\s\n]*([A-Z][A-Za-z\s]{2,25})(?=\n)', re.IGNORECASE | re.MULTILINE),
                re.compile(r'Tier[\s]*(\d+)(?=\s|\n|$)', re.IGNORECASE),
                re.compile(r'Code client[\s:]*([A-Z0-9-]{2,20})', re.IGNORECASE),
                re.compile(r'^([A-Z][A-Z\s]{3,25})(?:\s+SARL|\s+SA\b)', re.MULTILINE)
            ],
            "tauxTVA": [
                re.compile(r'(\d{1,2})%(?=\s+[\d,.])', re.IGNORECASE),
                re.compile(r'TVA[\s:]*(\d{1,2})%', re.IGNORECASE)
            ],
            "montantHT": [
                re.compile(r'(?:Total\s*HT|Sous[\s-]*total)[\s:€]*(\d{1,6}(?:[.,]\d{2})?)', re.IGNORECASE),
                re.compile(r'(\d{1,6}(?:[.,]\d{2})?)[\s]*€[\s]*HT\b', re.IGNORECASE),
                re.compile(r'Base[\s]*HT[\s:€]*(\d{1,6}(?:[.,]\d{2})?)', re.IGNORECASE)
            ],
            "montantTVA": [
                re.compile(r'(?:Total\s*TVA|Montant\s*TVA)[\s:€]*(\d{1,6}(?:[.,]\d{2})?)', re.IGNORECASE),
                re.compile(r'(\d{1,6}(?:[.,]\d{2})?)[\s]*€[\s]*TVA\b', re.IGNORECASE)
            ],
            "montantTTC": [
                re.compile(r'(?:Total\s*TTC|Total\s*général|Net\s*à\s*payer)[\s:€]*(\d{1,6}(?:[.,]\d{2})?)', re.IGNORECASE),
                re.compile(r'(\d{1,6}(?:[.,]\d{2})?)[\s]*€[\s]*TTC\b', re.IGNORECASE),
                re.compile(r'Total[\s:€]*(\d{1,6}(?:[.,]\d{2})?)(?=\s*$)', re.IGNORECASE | re.MULTILINE)
            ]
        }

    async def extract_text_ultra_fast(self, file_path: str) -> str:
        """Extraction ultra-rapide - priorise PyPDF2"""
        ext = Path(file_path).suffix.lower()
        
        if ext == '.pdf':
            # PyPDF2 d'abord - généralement suffisant
            try:
                reader = PdfReader(file_path)
                text = reader.pages[0].extract_text() or ""
                
                if self.is_good_enough(text):
                    print(f"✅ PyPDF2 SUCCESS: {len(text)} chars")
                    return text
                    
                # Si première page insuffisante, essayer page 2
                if len(reader.pages) > 1:
                    text2 = reader.pages[1].extract_text() or ""
                    combined = f"{text}\n{text2}"
                    if len(combined) > 200:
                        print(f"✅ PyPDF2 SUCCESS (2 pages): {len(combined)} chars")
                        return combined
                        
            except Exception as e:
                print(f"PyPDF2 failed: {e}")

            # OCR en dernier recours seulement
            print("🚀 OCR fallback...")
            return await self.emergency_tesseract(file_path)
                
        elif ext in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
            img = Image.open(file_path)
            return await self.tesseract_ocr_async(img)
        else:
            raise HTTPException(status_code=400, detail="Format non supporté")

    async def emergency_tesseract(self, file_path: str) -> str:
        """OCR d'urgence - une seule page, vitesse maximale"""
        loop = asyncio.get_event_loop()
        
        def ultra_fast_convert():
            images = convert_from_path(
                file_path,
                dpi=120,
                first_page=1,
                last_page=1,
                poppler_path=self.poppler_path
            )
            return self.tesseract_fast(images[0]) if images else ""
        
        return await loop.run_in_executor(self.executor, ultra_fast_convert)

    async def tesseract_ocr_async(self, img) -> str:
        """Tesseract asynchrone"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, self.tesseract_fast, img)

    def tesseract_fast(self, img) -> str:
        """Tesseract ultra-rapide"""
        if hasattr(img, 'width') and img.width > 800:
            ratio = 800 / img.width
            new_size = (800, int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        if img.mode != 'L':
            img = img.convert('L')

        text = pytesseract.image_to_string(
            img,
            config='--oem 3 --psm 6',
            lang='fra'
        )
        
        print(f"✅ Tesseract: {len(text)} chars")
        return text

    def is_good_enough(self, text: str) -> bool:
        """Validation rapide"""
        return (
            text and len(text) > 100 and
            any(word in text.lower() for word in ["facture", "total", "tva", "ht"])
        )

    def extract_with_super_regex(self, text: str) -> dict:
        """Extraction ULTRA-SOPHISTIQUÉE avec regex avancés et nettoyage"""
        result = {
            "numeroFacture": None,
            "emetteur": None,
            "client": None,
            "tauxTVA": None,
            "montantHT": None,
            "montantTVA": None,
            "montantTTC": None
        }
        
        print("🔍 Extraction avec regex ultra-sophistiqués...")
        print(f"📄 Texte à analyser: {text[:200]}...")
        
        # Extraction avec patterns avancés
        for key, patterns in self.advanced_patterns.items():
            for i, pattern in enumerate(patterns):
                matches = pattern.findall(text)
                if matches:
                    value = matches[0].strip() if isinstance(matches[0], str) else str(matches[0]).strip()
                    
                    # Nettoyage intelligent selon le type de champ
                    if key in ['emetteur', 'client']:
                        value = self.clean_text_field(value)
                        if value and self.validate_text_value(key, value):
                            result[key] = value
                            print(f"✅ {key}: '{value}' (pattern {i+1})")
                            break
                    elif key in ['tauxTVA', 'montantHT', 'montantTVA', 'montantTTC']:
                        try:
                            clean_value = value.replace(',', '.').replace(' ', '').replace('€', '')
                            float_value = float(clean_value)
                            
                            if self.validate_numeric_value(key, float_value):
                                result[key] = float_value
                                print(f"✅ {key}: {float_value} (pattern {i+1})")
                                break
                        except ValueError:
                            continue
                    else:
                        if self.validate_text_value(key, value):
                            result[key] = value
                            print(f"✅ {key}: '{value}' (pattern {i+1})")
                            break
        
        # Post-traitement intelligent avec recalculs
        result = self.intelligent_post_processing_corrected(result, text)
        
        return result

    def clean_text_field(self, text: str) -> str:
        """Nettoyage intelligent des champs texte"""
        if not text:
            return ""
        
        # Supprimer les sauts de ligne et espaces multiples
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Supprimer les caractères parasites à la fin
        text = re.sub(r'[^A-Za-z0-9\s]$', '', text)
        
        # Supprimer les mots courts parasites à la fin (1-2 caractères)
        words = text.split()
        if len(words) > 1 and len(words[-1]) <= 2:
            text = ' '.join(words[:-1])
        
        return text.strip()

    def validate_numeric_value(self, key: str, value: float) -> bool:
        """Validation intelligente des valeurs numériques"""
        if key == 'tauxTVA':
            return 0 <= value <= 30
        elif key in ['montantHT', 'montantTVA', 'montantTTC']:
            return 0 < value < 1000000
        return True

    def validate_text_value(self, key: str, value: str) -> bool:
        """Validation des champs texte"""
        if key in ['emetteur', 'client']:
            return len(value) > 1 and not value.isdigit()
        elif key == 'numeroFacture':
            return len(value) > 2
        return True

    def intelligent_post_processing_corrected(self, result: dict, text: str) -> dict:
        """Post-traitement intelligent CORRIGÉ avec recalculs précis"""
        
        print("🔧 Post-traitement intelligent...")
        
        # 1. Extraction emetteur/client des premières lignes si manquants
        if not result.get('emetteur') or not result.get('client'):
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            
            for i, line in enumerate(lines[:8]):
                # Émetteur : généralement dans les 3 premières lignes
                if not result.get('emetteur') and i < 3:
                    if re.match(r'^[A-Z][A-Za-z\s]{2,20}$', line) and 'facture' not in line.lower():
                        result['emetteur'] = line
                        print(f"📝 Émetteur trouvé: '{line}'")
                
                # Client : rechercher "Tier" ou après "Adressé à"
                if not result.get('client'):
                    if line.startswith('Tier '):
                        clean_client = line.replace('Tier ', '').strip()
                        if clean_client:
                            result['client'] = f"Tier {clean_client}"
                            print(f"📝 Client trouvé: '{result['client']}'")
                            break
        
        # 2. Taux TVA par défaut si manquant
        if result.get('tauxTVA') is None:
            if '20%' in text:
                result['tauxTVA'] = 20.0
                print("📊 Taux TVA par défaut: 20%")
            elif '14%' in text:
                result['tauxTVA'] = 14.0
                print("📊 Taux TVA par défaut: 14%")
        
        # 3. RECALCULS CORRECTS des montants
        ht = result.get('montantHT')
        tva_amount = result.get('montantTVA')
        ttc = result.get('montantTTC')
        tva_rate = result.get('tauxTVA')
        
        print(f"💰 Montants détectés - HT: {ht}, TVA: {tva_amount}, TTC: {ttc}, Taux: {tva_rate}%")
        
        # Cas 1: On a HT et taux TVA -> recalculer TVA et TTC
        if ht is not None and tva_rate is not None:
            calculated_tva = round(ht * tva_rate / 100, 2)
            calculated_ttc = round(ht + calculated_tva, 2)
            
            # Vérifier si les valeurs détectées sont cohérentes
            if tva_amount is not None and abs(tva_amount - calculated_tva) > 1:
                print(f"⚠️  TVA incohérente: détectée {tva_amount}, calculée {calculated_tva}")
                result['montantTVA'] = calculated_tva
                print(f"✅ TVA corrigée: {calculated_tva}")
            elif tva_amount is None:
                result['montantTVA'] = calculated_tva
                print(f"📊 TVA calculée: {calculated_tva}")
            
            if ttc is not None and abs(ttc - calculated_ttc) > 1:
                print(f"⚠️  TTC incohérent: détecté {ttc}, calculé {calculated_ttc}")
                if ttc > ht:  # TTC doit être > HT
                    print(f"✅ TTC détecté gardé: {ttc}")
                else:
                    result['montantTTC'] = calculated_ttc
                    print(f"✅ TTC corrigé: {calculated_ttc}")
            elif ttc is None:
                result['montantTTC'] = calculated_ttc
                print(f"📊 TTC calculé: {calculated_ttc}")
        
        # Cas 2: On a TTC et taux TVA -> recalculer HT et TVA
        elif ttc is not None and tva_rate is not None and ht is None:
            calculated_ht = round(ttc / (1 + tva_rate / 100), 2)
            calculated_tva = round(ttc - calculated_ht, 2)
            
            result['montantHT'] = calculated_ht
            result['montantTVA'] = calculated_tva
            print(f"📊 HT calculé à partir TTC: {calculated_ht}")
            print(f"📊 TVA calculée à partir TTC: {calculated_tva}")
        
        return result

    async def extract_invoice_data_super_fast(self, file_path: str) -> dict:
        """Méthode principale ULTRA-RAPIDE - évite le LLM !"""
        start_time = time.time()
        print(f"⚡ SUPER-FAST processing: {file_path}")
        
        # Extraction texte ultra-rapide
        text = await self.extract_text_ultra_fast(file_path)
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="Aucun texte trouvé")

        text_time = time.time() - start_time
        print(f"⚡ Extraction texte: {text_time:.2f}s")
        
        # Extraction avec regex sophistiqués (évite le LLM !)
        extraction_start = time.time()
        extracted_data = self.extract_with_super_regex(text)
        
        # Vérifier si on a assez de données
        found_fields = sum(1 for v in extracted_data.values() if v is not None)
        
        if found_fields >= 5:
            print(f"🚀 REGEX SUFFISANT ! {found_fields}/7 champs trouvés - PAS DE LLM !")
        else:
            print(f"🤖 LLM nécessaire ({found_fields}/7 champs)...")
            try:
                llm_data = await self.emergency_llm(text)
                for key, value in llm_data.items():
                    if key in extracted_data and extracted_data[key] is None and value is not None:
                        extracted_data[key] = value
            except Exception as e:
                print(f"LLM échoué: {e}, utilisation regex seul")
        
        extraction_time = time.time() - extraction_start
        total_time = time.time() - start_time
        
        print(f"⚡ Extraction données: {extraction_time:.2f}s")
        print(f"🏆 TEMPS TOTAL: {total_time:.2f}s")
        print(f"✅ Résultat final: {extracted_data}")
        
        return extracted_data

    async def emergency_llm(self, text: str) -> dict:
        """LLM d'urgence ultra-rapide"""
        if len(text) > 800:
            text = text[:800] + "..."
        
        loop = asyncio.get_event_loop()
        
        def call_llm():
            try:
                response = self.client.generate(
                    model='mistral',
                    prompt=self.llm_prompt.format(text=text),
                    options={
                        'temperature': 0.1,
                        'num_predict': 80,
                        'num_ctx': 1024
                    }
                )
                return response.response.strip()
            except Exception as e:
                print(f"LLM error: {e}")
                return "{}"
        
        raw_response = await loop.run_in_executor(self.executor, call_llm)
        
        try:
            json_match = re.search(r'\{.*\}', raw_response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return self.clean_llm_data(data)
        except:
            pass
        
        return {}

    def clean_llm_data(self, data: dict) -> dict:
        """Nettoyage rapide LLM"""
        cleaned = {}
        for key, value in data.items():
            if value is not None and value != "null":
                try:
                    if key in ['tauxTVA', 'montantHT', 'montantTVA', 'montantTTC']:
                        cleaned[key] = float(str(value).replace(',', '.'))
                    else:
                        cleaned[key] = str(value).strip()
                except:
                    pass
        return cleaned

# Instance globale ultra-rapide
super_fast_extractor = SuperFastInvoiceExtractor()

@app.post("/extract-invoice")
async def extract_invoice_super_fast(file: UploadFile = File(...)):
    """Endpoint ULTRA-RAPIDE - évite le LLM !"""
    
    start_time = time.time()
    print(f"⚡ SUPER-FAST REQUEST: {file.filename}")
    
    if not file.content_type.startswith(('image/', 'application/pdf')):
        raise HTTPException(status_code=400, detail="Type de fichier non supporté")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name
    
    try:
        extracted_data = await super_fast_extractor.extract_invoice_data_super_fast(tmp_file_path)
        
        total_time = time.time() - start_time
        
        return JSONResponse(content={
            "success": True,
            "data": extracted_data,
            "filename": file.filename,
            "processing_time": f"{total_time:.2f}s",
            "method": "SUPER-FAST REGEX"
        })
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")
    finally:
        try:
            os.unlink(tmp_file_path)
        except:
            pass

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "SUPER-FAST Invoice Extractor Ready ⚡"}

@app.get("/")
async def root():
    return {"message": "SUPER-FAST Invoice Extractor - Regex First, LLM Last Resort ⚡", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)