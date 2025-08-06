import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = "http://localhost:8000";

export const useExtraction = (extractionState, setExtractionState, showNotification) => {
  const { token } = useAuth();

  const filterValue = useCallback((val, fieldKey) => {
    if (!val) return "";
    if (fieldKey === "fournisseur") return val;
    
    // Clean and format dateFacturation field
    if (fieldKey === 'dateFacturation') {
      const dateMatch = val.toString().match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/);
      if (dateMatch) {
        const [_, day, month, year] = dateMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return val;
    }
    
    // Pour numeroFacture, autoriser alphanumérique, tirets, slash et espaces
    if (fieldKey === "numeroFacture") {
      // Split by space or colon
      const parts = val.toString().split(/[\s:]+/);
      // Find the first part containing a digit
      let candidate = parts.find(p => /\d/.test(p)) || val.toString();
      // Find the index of the first digit
      const firstDigit = candidate.search(/\d/);
      // If there are more than 4 letters before the first digit, remove them
      if (firstDigit > 4) {
        candidate = candidate.slice(firstDigit);
      }
      return candidate;
    }
    // For numeric fields, keep decimal points and commas
    if (
      ["tauxTVA", "montantHT", "montantTVA", "montantTTC"].includes(fieldKey)
    ) {
      // Match numbers with optional decimal part (using either . or , as decimal separator)
      const matches = val.toString().match(/[0-9]+[.,]?[0-9]*/g);
      if (!matches) return "0";
      // Replace comma with dot for proper decimal parsing
      return matches.join("").replace(",", ".");
    }
    // For other fields like numeroFacture, keep only numbers and specific symbols
    const matches = val.toString().match(/[0-9.,;:/\\-]+/g);
    return matches ? matches.join("") : "";
  }, []);

  const hasMapping = useCallback((fileName, mappings) => {
    if (!fileName) return false;
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    return mappings && Object.keys(mappings).includes(baseName);
  }, []);

  const isExtractionComplete = useCallback((data) => {
    // Utilise les bonnes clés extraites par le backend
    const requiredFields = [
      "fournisseur",
      "dateFacturation",
      "numeroFacture",
      "tauxTVA",
      "montantHT",
      "montantTVA",
      "montantTTC",
    ];
    if (!data) return false;
    return requiredFields.every(
      (field) => data[field] && String(data[field]).trim() !== ""
    );
  }, []);

  const extractAllPdfs = useCallback(async () => {
    setExtractionState((prev) => ({ ...prev, isProcessing: true }));
    const results = [...extractionState.extractedDataList];
    const confidenceScores = [...(extractionState.confidenceScores || [])];
    const extractionBoxes = [...(extractionState.extractionBoxes || [])];
    
    // Since we're using ocr-preview, we don't need template validation
    const isTestEndpoint = true;
    
    for (let i = 0; i < extractionState.filePreviews.length; i++) {
      const base64 = extractionState.filePreviews[i];
      const res = await fetch(base64);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, `page_${i}.png`);

      const templateIdToSend = extractionState.selectedModel;
      formData.append("template_id", templateIdToSend);

      try {
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
          method: "POST",
          headers,
          body: formData,
          credentials: 'include',
        });
        const result = await response.json();
        let data = result.data || {};
        if (data.numFacture && !data.numeroFacture) {
          data.numeroFacture = data.numFacture;
        }
        data.fournisseur = extractionState.selectedModel || extractionState.extractedDataList[i]?.fournisseur || "";
        results[i] = data;
        
        results[i] = result.data || {};
        confidenceScores[i] = result.confidence_scores || {};
        
        // Store bounding boxes for visualization if available
        if (result.debug_info && result.debug_info.positions && typeof result.debug_info.positions === 'object') {
          extractionBoxes[i] = result.debug_info.positions;
        }
      } catch (error) {
        console.error(`💥 Batch extraction error for page ${i + 1}:`, error);
        results[i] = {};
        confidenceScores[i] = {};
        extractionBoxes[i] = {};
      }
      setExtractionState((prev) => ({
        ...prev,
        extractedDataList: [...results],
        confidenceScores: [...confidenceScores],
        extractionBoxes: [...extractionBoxes],
        isProcessing: i < extractionState.filePreviews.length - 1,
      }));
    }
    showNotification("Extraction terminée pour tous les fichiers", "success");
  }, [extractionState, setExtractionState, showNotification, token]);

  const extractCurrentPdf = useCallback(async (templateId, index) => {
    // En mode "same", utiliser le modèle sélectionné si aucun templateId n'est fourni
    if (!templateId && extractionState.processingMode === "same" && extractionState.selectedModel) {
      templateId = extractionState.selectedModel;
    }
    
    // Skip template validation for ocr-preview endpoint
    const isTestEndpoint = true; // Since we're using ocr-preview
    
    if (!templateId && !isTestEndpoint) {
      showNotification("Veuillez sélectionner un modèle de facture avant d'extraire.", "error");
      return;
    }
    setExtractionState((prev) => ({ ...prev, isProcessing: true }));
    const idx = index !== undefined ? index : extractionState.currentPdfIndex;
    const base64 = extractionState.filePreviews[idx];
    const res = await fetch(base64);
    const blob = await res.blob();
    const formData = new FormData();
    formData.append("file", blob, `page_${idx}.png`);
    
    // Only add template_id if it exists and we're not using test endpoint
    if (templateId) {
      formData.append("template_id", templateId);
    }
    
    try {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
        method: "POST",
        headers,
        body: formData,
        credentials: 'include',
      });
      const result = await response.json();
      
      setExtractionState((prev) => {
        const newExtracted = [...prev.extractedDataList];
        let data = result.data || {};
        // Map backend numFacture to frontend numeroFacture
        if (data.numFacture && !data.numeroFacture) {
          data.numeroFacture = data.numFacture;
        }
        data.fournisseur = prev.selectedModel || prev.extractedDataList[idx]?.fournisseur || "";
        newExtracted[idx] = data;
        newExtracted[idx] = data;
        const newScores = [...(prev.confidenceScores || [])];
        newScores[idx] = result.confidence_scores || {};

        // Store bounding boxes for visualization if available
        const newExtractionBoxes = [...(prev.extractionBoxes || [])];
        if (result.debug_info && result.debug_info.positions && typeof result.debug_info.positions === 'object') {
          newExtractionBoxes[idx] = result.debug_info.positions;
        }

        return {
          ...prev,
          extractedDataList: newExtracted,
          confidenceScores: newScores,
          extractionBoxes: newExtractionBoxes,
          isProcessing: false,
        };
      });
    } catch (error) {
      console.error(`💥 Extraction error for page ${idx + 1}:`, error);
      setExtractionState((prev) => ({
        ...prev,
        isProcessing: false,
      }));
    }
  }, [extractionState, setExtractionState, showNotification, token]);

  const launchFoxPro = useCallback(async () => {
    try {
      // Récupérer les données corrigées depuis les champs de saisie
      // Récupérer directement depuis les champs input
      const fournisseurInput = document.querySelector('input[name="fournisseur"]');
      const numeroFactureInput = document.querySelector('input[name="numeroFacture"]');
      const tauxTVAInput = document.querySelector('input[name="tauxTVA"]');
      const montantHTInput = document.querySelector('input[name="montantHT"]');
      const montantTVAInput = document.querySelector('input[name="montantTVA"]');
      const montantTTCInput = document.querySelector('input[name="montantTTC"]');
      
      // Utiliser les valeurs des champs input si disponibles, sinon les données originales
      const currentData = extractionState.extractedDataList[extractionState.currentPdfIndex] || {};
      
      const correctedData = {
        fournisseur: fournisseurInput ? fournisseurInput.value : (currentData.fournisseur || ''),
        numeroFacture: numeroFactureInput ? numeroFactureInput.value : (currentData.numeroFacture || ''),
        tauxTVA: tauxTVAInput ? tauxTVAInput.value : (currentData.tauxTVA || '0'),
        montantHT: montantHTInput ? montantHTInput.value : (currentData.montantHT || '0'),
        montantTVA: montantTVAInput ? montantTVAInput.value : (currentData.montantTVA || '0'),
        montantTTC: montantTTCInput ? montantTTCInput.value : (currentData.montantTTC || '0')
      };
      
      // D'abord sauvegarder les données corrigées
      const saveResponse = await fetch('http://localhost:8000/save-corrected-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ajout des cookies
        body: JSON.stringify(correctedData),
      });
      
      const saveResult = await saveResponse.json();
      if (!saveResult.success) {
        alert('Erreur lors de la sauvegarde des données: ' + saveResult.message);
        return;
      }
      
      // Ensuite lancer FoxPro
      const response = await fetch('http://localhost:8000/launch-foxpro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ajout des cookies
      });
      
      const result = await response.json();
      
    } catch (error) {
      console.error('Erreur lors du lancement de FoxPro:', error);
      alert('Erreur lors du lancement de FoxPro');
    }
  }, [extractionState]);

  return {
    filterValue,
    hasMapping,
    isExtractionComplete,
    extractAllPdfs,
    extractCurrentPdf,
    launchFoxPro,
  };
}; 