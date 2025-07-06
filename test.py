from ollama import Client
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext
import os
import json
import sys
from datetime import datetime
from PyPDF2 import PdfReader
import numpy as np
import easyocr


class TVAExtractor:
    def __init__(self):
        self.client = Client()  
        self.setup_paths()
        self.setup_gui()
        # Prompt for human-readable summary (no JSON)
        self.llm_prompt = """Look at this French invoice text and summarize the following information in clear, human-readable French.\n\n- Emetteur (qui a émis la facture)\n- Taux de TVA\n- Montant HT (hors taxe)\n- Montant TVA\n- Montant TTC (toutes taxes comprises)\n\nSi certaines informations sont manquantes, indiquez-le simplement.\n\nTexte de la facture :\n{text}\n"""

    
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
            self.show_error(f"Path setup failed: {str(e)}")

    def setup_gui(self):
        self.root = tk.Tk()
        self.root.title("TVA Tax Extractor - Debug Mode")
        self.root.geometry("600x500")
        self.root.configure(bg='#f0f0f0')

        title_label = tk.Label(self.root, text="TVA Tax Extractor - Debug Mode", font=('Arial', 16, 'bold'), bg='#f0f0f0')
        title_label.pack(pady=10)

        self.import_btn = tk.Button(
            self.root, text="📄 Extract TVA from Invoice", command=self.process_file,
            font=('Arial', 12, 'bold'), bg='#4CAF50', fg='white', padx=20, pady=10
        )
        self.import_btn.pack(pady=10)

        # Manual Insertion Button (now opens a popup)
        self.manual_btn = tk.Button(
            self.root, text="✏️ Manual Insertion", command=self.show_manual_entry_popup,
            font=('Arial', 12, 'bold'), bg='#2196F3', fg='white', padx=20, pady=10
        )
        self.manual_btn.pack(pady=5)

        self.status_label = tk.Label(
            self.root, text="Select an invoice file to extract TVA information",
            wraplength=400, bg='#f0f0f0'
        )
        self.status_label.pack(pady=10)

        # Debug output area
        debug_frame = tk.Frame(self.root)
        debug_frame.pack(pady=5, padx=20, fill='both', expand=True)
        
        tk.Label(debug_frame, text="Debug Output:", font=('Arial', 10, 'bold')).pack(anchor='w')
        self.debug_text = scrolledtext.ScrolledText(debug_frame, height=12, width=70, font=('Courier', 9))
        self.debug_text.pack(fill='both', expand=True)

        # Result area
        result_frame = tk.Frame(self.root)
        result_frame.pack(pady=5, padx=20, fill='both', expand=True)
        
        tk.Label(result_frame, text="Extracted Data:", font=('Arial', 10, 'bold')).pack(anchor='w')
        self.result_text = tk.Text(result_frame, height=6, width=70, font=('Arial', 10))
        self.result_text.pack(fill='both', expand=True)

    def log_debug(self, message):
        """Add debug message to the debug text area"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.debug_text.insert(tk.END, f"[{timestamp}] {message}\n")
        self.debug_text.see(tk.END)
        self.root.update()
        print(f"[DEBUG] {message}")  # Also print to console

    def show_error(self, message):
        self.log_debug(f"ERROR: {message}")
        messagebox.showerror("Error", message)

    def save_results(self, content):
        try:
            desktop = os.path.join(os.path.expanduser("~"), "Desktop")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = os.path.join(desktop, f"tva_extraction_{timestamp}.txt")
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return output_path
        except Exception as e:
            self.show_error(f"Failed to save: {str(e)}")
            return None

    def query_llm(self, text):
        try:
            self.log_debug("Starting LLM query...")
            self.log_debug(f"Input text length: {len(text)} characters")
            preview = text[:200].replace('\n', ' ').strip()
            self.log_debug(f"Text preview: {preview}...")
            if len(text) > 2000:
                text = text[:2000] + "\n[...truncated...]"
                self.log_debug(f"Text truncated to {len(text)} characters")
            full_prompt = self.llm_prompt.format(text=text)
            self.log_debug("Full prompt being sent:")
            self.log_debug("-" * 30)
            self.log_debug(full_prompt)
            self.log_debug("-" * 30)
            self.log_debug("Sending request to Mistral...")
            response = self.client.generate(
                model='mistral',
                prompt=full_prompt,
                options={
                    'temperature': 0.1,
                    'num_predict': 500
                }
            )
            self.log_debug("Raw response object received:")
            self.log_debug(f"Response type: {type(response)}")
            self.log_debug(f"Response attributes: {dir(response)}")
            raw_response = response.response.strip()
            self.log_debug(f"LLM response length: {len(raw_response)} characters")
            self.log_debug("Raw LLM response (exact):")
            self.log_debug("-" * 50)
            self.log_debug(repr(raw_response))
            self.log_debug("-" * 50)
            self.log_debug("Raw LLM response (display):")
            self.log_debug("-" * 50)
            self.log_debug(raw_response)
            self.log_debug("-" * 50)
            if len(raw_response) < 10:
                self.log_debug("WARNING: Response is very short, might be incomplete")
            return raw_response
        except Exception as e:
            error_msg = f"LLM query failed: {str(e)}"
            self.log_debug(error_msg)
            self.log_debug(f"Exception type: {type(e).__name__}")
            self.log_debug(f"Exception args: {e.args}")
            self.show_error(error_msg)
            return None

    def extract_text(self, file_path):
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.pdf':
            # Try PyPDF2
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(file_path)
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                self.log_debug("PyPDF2 attempted extraction:")
                self.log_debug("-" * 30)
                self.log_debug(text[:1000] + ("..." if len(text) > 1000 else ""))
                self.log_debug("-" * 30)
                if self.is_good_enough(text):
                    self.log_debug("PyPDF2 extraction good, using it.")
                    return [text]
            except Exception as e:
                self.log_debug(f"PyPDF2 failed: {e}")

            # Fallback to EasyOCR (simple text block per page)
            self.log_debug("PyPDF2 failed or not good enough, using EasyOCR.")
            try:
                from pdf2image import convert_from_path
                images = convert_from_path(file_path, poppler_path=self.poppler_path)
                page_texts = []
                for img in images:
                    page_texts.append(self.ocr_image(img))
                return page_texts
            except Exception as e:
                self.show_error(f"EasyOCR failed: {e}")
                return []
        elif ext in ['.jpg', '.jpeg', '.png']:
            try:
                self.log_debug("Running EasyOCR on image...")
                img = Image.open(file_path)
                return [self.ocr_image(img)]
            except Exception as e:
                self.show_error(f"Image OCR failed: {e}")
                return []
        else:
            self.show_error("Unsupported file type")
            return []

    def ocr_image(self, img):
        # Resize if too large
        max_width = 1200
        if hasattr(img, 'width') and img.width > max_width:
            ratio = max_width / img.width
            try:
                img = img.resize((max_width, int(img.height * ratio)), Image.Resampling.LANCZOS)
            except AttributeError:
                try:
                    img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
                except AttributeError:
                    img = img.resize((max_width, int(img.height * ratio)), 1)  # 1 is LANCZOS
        if hasattr(img, 'convert'):
            img = np.array(img)
        self.log_debug("Initializing EasyOCR Reader")
        try:
            reader = easyocr.Reader(['fr'], gpu=False)
            self.log_debug("EasyOCR Reader initialized")
        except Exception as e:
            self.log_debug(f"EasyOCR failed to initialize: {e}.")
            self.show_error(f"EasyOCR failed to initialize: {e}.")
            return ''
        result = reader.readtext(img, detail=0, paragraph=True)
        self.log_debug(f"EasyOCR result: {result[:5]}{'...' if len(result) > 5 else ''}")
        return '\n'.join(result)

    def is_good_enough(self, text):
        return (
            text and len(text) > 100 and
            any(word in text.lower() for word in ["tva", "total", "facture", "émetteur", "montant"])
        )

    def process_file(self):
        file_path = filedialog.askopenfilename(
            filetypes=[("PDF files", "*.pdf"), ("Image files", "*.jpg *.jpeg *.png")])
        if not file_path:
            return
        self.debug_text.delete(1.0, tk.END)
        self.result_text.delete(1.0, tk.END)
        self.log_debug("=" * 60)
        self.log_debug("STARTING NEW EXTRACTION")
        self.log_debug("=" * 60)
        self.status_label.config(text="Extracting text...")
        page_texts = self.extract_text(file_path)
        if not page_texts or not any(t.strip() for t in page_texts):
            self.show_error("No text found in file")
            return
        results = []
        for idx, text in enumerate(page_texts):
            self.status_label.config(text=f"Processing page {idx+1} of {len(page_texts)}...")
            if text.strip().startswith("| "):
                llm_input = "Ceci est un tableau extrait d'une facture française. Les colonnes sont comme dans le document original. Merci d'extraire les champs demandés à partir de ce tableau.\n" + text
            else:
                llm_input = text
            llm_result = self.query_llm(llm_input)
            if llm_result is None:
                self.log_debug("LLM extraction failed for this page. Skipping result entry.")
                results.append({
                    "page": idx + 1,
                    "llm_result": "LLM extraction failed or returned no result."
                })
                continue
            results.append({
                "page": idx + 1,
                "llm_result": llm_result
            })
        # Display results
        formatted = "\n\n".join(f"Page {r['page']}\n{r['llm_result']}" for r in results)
        self.result_text.insert(tk.END, formatted)
        debug_content = self.debug_text.get(1.0, tk.END)
        full_content = f"=== EXTRACTION RESULTS ===\n{formatted}\n\n=== DEBUG LOG ===\n{debug_content}"
        path = self.save_results(full_content)
        self.status_label.config(text=f"✅ Done! Saved to: {os.path.basename(path) if path else 'Failed to save'}")
        self.log_debug("Extraction completed successfully!")

    def show_manual_entry_popup(self):
        popup = tk.Toplevel(self.root)
        popup.title("Manual Invoice Text Entry")
        popup.geometry("600x400")
        popup.grab_set()
        tk.Label(popup, text="Enter invoice text manually:", font=('Arial', 12, 'bold')).pack(pady=10)
        manual_text = scrolledtext.ScrolledText(popup, height=15, width=70, font=('Arial', 10))
        manual_text.pack(fill='both', expand=True, padx=10, pady=5)
        def on_apply():
            text = manual_text.get(1.0, tk.END).strip()
            popup.destroy()
            self.process_manual_text(text)
        apply_btn = tk.Button(popup, text="Apply", command=on_apply, font=('Arial', 12, 'bold'), bg='#FF9800', fg='white', padx=20, pady=5)
        apply_btn.pack(pady=10)

    def process_manual_text(self, text=None):
        self.debug_text.delete(1.0, tk.END)
        self.result_text.delete(1.0, tk.END)
        self.log_debug("=" * 60)
        self.log_debug("STARTING MANUAL EXTRACTION")
        self.log_debug("=" * 60)
        if not text:
            self.show_error("No text entered for manual extraction.")
            return
        self.status_label.config(text="Processing manual text...")
        llm_result = self.query_llm(text)
        if llm_result is None:
            self.log_debug("LLM extraction failed for manual text.")
            results = [{
                "page": 1,
                "llm_result": "LLM extraction failed or returned no result."
            }]
        else:
            results = [{
                "page": 1,
                "llm_result": llm_result
            }]
        formatted = "\n\n".join(f"Page {r['page']}\n{r['llm_result']}" for r in results)
        self.result_text.insert(tk.END, formatted)
        debug_content = self.debug_text.get(1.0, tk.END)
        full_content = f"=== EXTRACTION RESULTS ===\n{formatted}\n\n=== DEBUG LOG ===\n{debug_content}"
        path = self.save_results(full_content)
        self.status_label.config(text=f"✅ Done! Saved to: {os.path.basename(path) if path else 'Failed to save'}")
        self.log_debug("Manual extraction completed successfully!")

    def run(self):
        self.root.mainloop()


if __name__ == '__main__':
    app = TVAExtractor()
    app.run()