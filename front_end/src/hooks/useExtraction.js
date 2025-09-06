import { useCallback } from 'react';

const API_BASE_URL = "http://localhost:8000";

export const useExtraction = (extractionState, setExtractionState, showNotification) => {
  const filterValue = useCallback((val, fieldKey) => {
    // Explicitly check for undefined or null, but allow 0 and '0'
    if (val === undefined || val === null) return "";
    if (fieldKey === "fournisseur") return val;
    
    // Clean and format dateFacturation field
    if (fieldKey === 'dateFacturation') {
      const dateMatch = val.toString().match(/\b(\d{1,2})[/\- .](\d{1,2})[/\- .](\d{2,4})\b/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return val;
    }
    
    // For numeroFacture, allow alphanumeric, dashes, slashes and spaces
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
    if (["tauxTVA", "montantHT", "montantTVA", "montantTTC"].includes(fieldKey)) {
      // Match numbers with optional decimal part (using either . or , as decimal separator)
      const matches = val.toString().match(/[0-9]+[.,]?[0-9]*/g);
      if (!matches) return "0";
      // Replace comma with dot for proper decimal parsing
      return matches.join("").replace(",", ".");
    }
    
    // For other fields, keep only numbers and specific symbols
    const matches = val.toString().match(/[0-9.,;:/\\-]+/g);
    return matches ? matches.join("") : "";
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
      // Transformer les données dans le format attendu par le backend
      const transformedData = {
        fournisseur: data.fournisseur || '',
        numFacture: data.numFacture || '', // ✅ CORRIGÉ: utiliser numFacture directement
        dateFacturation: data.dateFacturation || '',
        tauxTVA: parseFloat(data.tauxTVA) || 0,
        montantHT: parseFloat(data.montantHT) || 0,
        montantTVA: parseFloat(data.montantTVA) || 0,
        montantTTC: parseFloat(data.montantTTC) || 0
      };
      
      console.log('🔍 Données originales:', data);
      console.log('🔍 Données transformées:', transformedData);
      
      const response = await fetch(`${API_BASE_URL}/ajouter-facture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify(transformedData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Erreur backend:', errorData);
        throw new Error(errorData.detail || `Erreur ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      if (result.success) {
        showNotification("Données corrigées sauvegardées", "success");
      } else {
        showNotification("Erreur lors de la sauvegarde", "error");
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showNotification("Erreur lors de la sauvegarde", error.message);
    }
  }, [extractionState, showNotification]);

  const launchFoxPro = useCallback(async () => {
    try {
      console.log('🚀 Lancement de FoxPro...');
      console.log('📊 État d\'extraction actuel:', extractionState);
      console.log('📋 Données extraites:', extractionState.extractedDataList);
      console.log('📍 Index actuel:', extractionState.currentPdfIndex);
      
      const currentData = extractionState.extractedDataList[extractionState.currentPdfIndex];
      console.log('🎯 Données de la page actuelle (depuis le sidebar):', currentData);
      
      // Log détaillé des données envoyées
      console.log('📤 Données envoyées au backend:');
      console.log('  - fournisseur:', currentData.fournisseur);
      console.log('  - numeroFacture:', currentData.numeroFacture);
      console.log('  - dateFacturation:', currentData.dateFacturation);
      console.log('  - montantHT:', currentData.montantHT);
      console.log('  - montantTVA:', currentData.montantTVA);
      console.log('  - montantTTC:', currentData.montantTTC);
      console.log('  - tauxTVA:', currentData.tauxTVA);
      
      // Envoyer les données du sidebar au backend pour mettre à jour ocr_extraction.json
      const response = await fetch(`${API_BASE_URL}/launch-foxpro`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify({
          extracted_data: currentData,  // Données exactes du sidebar
          current_index: extractionState.currentPdfIndex
        }),
      });
      
      const result = await response.json();
      console.log('📤 Réponse FoxPro:', result);
      
      if (result.success) {
        showNotification("FoxPro lancé avec succès", "success");
      } else {
        showNotification(`Erreur lors du lancement de FoxPro: ${result.message || 'Unknown error'}`, "error");
      }
    } catch (error) {
      console.error("Erreur lors du lancement de FoxPro:", error);
      showNotification("Erreur de connexion au serveur", "error");
    }
  }, [extractionState, showNotification]);

  // Nouvelle fonction pour sauvegarder toutes les données corrigées avant d'envoyer à FoxPro
  const saveAllCorrectedDataAndLaunchFoxPro = useCallback(async () => {
    // Only save the current image's data, not all images
    // This prevents overwriting issues where the last image overwrites previous ones
    const currentIndex = extractionState.currentPdfIndex;
    if (currentIndex >= 0 && currentIndex < extractionState.extractedDataList.length) {
      await saveCorrectedData(currentIndex);
    }
    await launchFoxPro();
  }, [extractionState.extractedDataList, extractionState.currentPdfIndex, saveCorrectedData, launchFoxPro]);

  return {
    filterValue,
    hasMapping,
    isExtractionComplete,
    extractAllPdfs,
    extractCurrentPdf,
    saveCorrectedData,
    launchFoxPro,
    saveAllCorrectedDataAndLaunchFoxPro, 
  };
}; 