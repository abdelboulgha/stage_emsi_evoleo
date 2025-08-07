import { useCallback } from 'react';

const API_BASE_URL = "http://localhost:8000";

export const useExtraction = (extractionState, setExtractionState, showNotification) => {
  const filterValue = useCallback((value, fieldKey) => {
    if (!value) return '';
    
    // Handle different field types
    switch (fieldKey) {
      case 'dateFacturation':
        // Ensure date is in YYYY-MM-DD format
        if (typeof value === 'string') {
          try {
            // Try to parse the date and format it properly
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
            // If direct parsing fails, try common date formats
            const dateMatch = value.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
            if (dateMatch) {
              const [_, day, month, year] = dateMatch;
              const fullYear = year.length === 2 ? `20${year}` : year;
              return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
          } catch (e) {
            console.error('Date parsing error:', e);
          }
        }
        return value;
      case 'montantHT':
      case 'montantTVA':
      case 'montantTTC':
      case 'tauxTVA':
        // Ensure numeric values - remove any non-numeric characters except . and ,
        if (typeof value === 'string') {
          const cleanValue = value.replace(/[^\d.,]/g, '').replace(',', '.');
          const num = parseFloat(cleanValue);
          return isNaN(num) ? '0' : num.toString();
        }
        return value;
      case 'numeroFacture':
        // Clean invoice number - keep alphanumeric, spaces, and common separators
        if (typeof value === 'string') {
          return value.replace(/[^\w\s\-\.\/]/g, '').trim();
        }
        return value;
      case 'fournisseur':
        // Keep supplier name as is, just trim whitespace
        if (typeof value === 'string') {
          return value.trim();
        }
        return value;
      default:
        return value.toString();
    }
  }, []);

  const hasMapping = useCallback((fieldKey) => {
    return extractionState.extractionBoxes[extractionState.currentPdfIndex]?.[fieldKey] !== undefined;
  }, [extractionState.extractionBoxes, extractionState.currentPdfIndex]);

  const isExtractionComplete = useCallback(() => {
    return extractionState.extractedDataList.length > 0 && 
           extractionState.extractedDataList.every(data => 
             Object.keys(data).length > 0
           );
  }, [extractionState.extractedDataList]);

  const extractAllPdfs = useCallback(async () => {
    if (extractionState.isProcessing) return;
    
    setExtractionState((prev) => ({ ...prev, isProcessing: true }));
    
    const results = [];
    const confidenceScores = [];
    const extractionBoxes = [];
    
    for (let i = 0; i < extractionState.filePreviews.length; i++) {
      const base64 = extractionState.filePreviews[i];
      const res = await fetch(base64);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, `page_${i}.png`);

      const templateIdToSend = extractionState.selectedModelId;
      if (templateIdToSend) {
        formData.append("template_id", templateIdToSend);
      }
      

      try {
        const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
          method: "POST",
          credentials: 'include',
          body: formData,
        });
        const result = await response.json();
      
        let data = result.data || {};
        if (data.numFacture && !data.numeroFacture) {
          data.numeroFacture = data.numFacture;
        }
        data.fournisseur = extractionState.selectedModelName || extractionState.extractedDataList[i]?.fournisseur || "";
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
  }, [extractionState, setExtractionState, showNotification]);

  const extractCurrentPdf = useCallback(async (templateId, index) => {
    // En mode "same", utiliser le modèle sélectionné si aucun templateId n'est fourni
    if (!templateId && extractionState.processingMode === "same" && extractionState.selectedModelId) {
      templateId = extractionState.selectedModelId;
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
      const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
        method: "POST",
        credentials: 'include',
        body: formData,
      });
      const result = await response.json();
      
      setExtractionState((prev) => {
        const newExtracted = [...prev.extractedDataList];
        let data = result.data || {};
        // Map backend numFacture to frontend numeroFacture
        if (data.numFacture && !data.numeroFacture) {
          data.numeroFacture = data.numFacture;
        }
        newExtracted[idx] = data;
        
        const newConfidence = [...prev.confidenceScores];
        newConfidence[idx] = result.confidence_scores || {};
        
        const newBoxes = [...prev.extractionBoxes];
        if (result.debug_info && result.debug_info.positions) {
          newBoxes[idx] = result.debug_info.positions;
        }
        
        return {
          ...prev,
          extractedDataList: newExtracted,
          confidenceScores: newConfidence,
          extractionBoxes: newBoxes,
          isProcessing: false,
        };
      });
      
      showNotification("Extraction terminée", "success");
    } catch (error) {
      console.error("Erreur lors de l'extraction:", error);
      showNotification("Erreur lors de l'extraction", "error");
      setExtractionState((prev) => ({ ...prev, isProcessing: false }));
    }
  }, [extractionState, setExtractionState, showNotification]);

  const saveCorrectedData = useCallback(async (index) => {
    const data = extractionState.extractedDataList[index];
    if (!data) return;
    try {
      const response = await fetch(`${API_BASE_URL}/save-corrected-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify(data), // Correction ici : on envoie directement les champs édités
      });
      const result = await response.json();
      if (result.success) {
        showNotification("Données corrigées sauvegardées", "success");
      } else {
        showNotification("Erreur lors de la sauvegarde", "error");
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showNotification("Erreur lors de la sauvegarde", "error");
    }
  }, [extractionState, showNotification]);

  const launchFoxPro = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/launch-foxpro`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({
          factures: extractionState.extractedDataList,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        showNotification("FoxPro lancé avec succès", "success");
      } else {
        showNotification("Erreur lors du lancement de FoxPro", "error");
      }
    } catch (error) {
      console.error("Erreur lors du lancement de FoxPro:", error);
      showNotification("Erreur lors du lancement de FoxPro", "error");
    }
  }, [extractionState.extractedDataList, showNotification]);

  // Nouvelle fonction pour sauvegarder toutes les données corrigées avant d'envoyer à FoxPro
  const saveAllCorrectedDataAndLaunchFoxPro = useCallback(async () => {
    for (let i = 0; i < extractionState.extractedDataList.length; i++) {
      await saveCorrectedData(i);
    }
    await launchFoxPro();
  }, [extractionState.extractedDataList, saveCorrectedData, launchFoxPro]);

  return {
    filterValue,
    hasMapping,
    isExtractionComplete,
    extractAllPdfs,
    extractCurrentPdf,
    saveCorrectedData,
    launchFoxPro,
    saveAllCorrectedDataAndLaunchFoxPro, // Ajouté pour garantir la sauvegarde avant FoxPro
  };
}; 