import { useCallback } from 'react';

const API_BASE_URL = "http://localhost:8000";

// Function to check for duplicate invoices
const checkForDuplicates = async (invoices, showNotification) => {
  try {
    // Create a temporary filterValue function that matches the one in useExtraction
    const filterValue = (val, fieldKey) => {
      if (val === undefined || val === null) return "";
      if (fieldKey === "fournisseur") return val;
      
      if (fieldKey === 'dateFacturation') {
        const dateMatch = val.toString().match(/\b(\d{1,2})[/\- .](\d{1,2})[/\- .](\d{2,4})\b/);
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          const fullYear = year.length === 2 ? `20${year}` : year;
          return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return val;
      }
      
      // For numeroFacture, clean it the same way as in the UI
      if (fieldKey === "numeroFacture" || fieldKey === "numFacture") {
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
      
      return val.toString().trim();
    };

    // Apply filtering to each invoice
    const filteredInvoices = invoices.map(invoice => {
      const numFacture = filterValue(invoice.numeroFacture || invoice.numFacture || '', 'numeroFacture');
      const fournisseur = filterValue(invoice.fournisseur || '', 'fournisseur');
      return { numFacture, fournisseur };
    });

 

    const response = await fetch(`${API_BASE_URL}/check-duplicate-invoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: 'include',
      body: JSON.stringify({ invoices: filteredInvoices })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to check for duplicates: ${error}`);
    }
    
    const { duplicates } = await response.json();
    
    return new Set(duplicates);
  } catch (error) {
    console.error("Error checking for duplicates:", error);
    showNotification("Erreur lors de la vérification des doublons", "error");
    return new Set();
  }
};

export const useExtraction = (extractionState, setExtractionState, showNotification) => {
  // Helper function to clean zone data
  const cleanZoneData = (boxes) => {
    if (!boxes) return [];
    if (!Array.isArray(boxes)) return [];
    return boxes.map(box => ({
      text: box.text || '',
      left: box.left || 0,
      top: box.top || 0,
      width: box.width || 0,
      height: box.height || 0,
      right: box.right || 0,
      bottom: box.bottom || 0
    })).filter(Boolean);
  };
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
    
    let results = [];
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
        
        // Update extraction result with zone boxes and set default values
        const zoneHtBoxes = result.zone_ht_boxes || [];
        const zoneTvaBoxes = result.zone_tva_boxes || [];
        
        // Set default values if available
        if (zoneHtBoxes.length > 0) {
          data.montantHT = zoneHtBoxes[0].text;
          data.boxHT = {
            left: zoneHtBoxes[0].left,
            top: zoneHtBoxes[0].top,
            width: zoneHtBoxes[0].width,
            height: zoneHtBoxes[0].height
          };
        }
        
        if (zoneTvaBoxes.length > 0) {
          data.montantTVA = zoneTvaBoxes[0].text;
          data.boxTVA = {
            left: zoneTvaBoxes[0].left,
            top: zoneTvaBoxes[0].top,
            width: zoneTvaBoxes[0].width,
            height: zoneTvaBoxes[0].height
          };
        }
        
        results[i] = data;
        confidenceScores[i] = result.confidence_scores || {};
        
        // Store extraction result for zone data - check both root level and zone_results
        const zoneData = result.zone_results || {};
        const finalHtBoxes = zoneHtBoxes.length > 0 ? zoneHtBoxes : (zoneData.zone_ht_boxes || []);
        const finalTvaBoxes = zoneTvaBoxes.length > 0 ? zoneTvaBoxes : (zoneData.zone_tva_boxes || []);
        
        // Update the current result with zone data
        const cleanedHtBoxes = cleanZoneData(finalHtBoxes);
        const cleanedTvaBoxes = cleanZoneData(finalTvaBoxes);
        
        // Update the results array with zone data
        results[i] = {
          ...data,
          zoneHtBoxes: cleanedHtBoxes,
          zoneTvaBoxes: cleanedTvaBoxes,
          selectedZoneHt: '',
          selectedZoneTva: ''
        };
        
        // Also update the data object for backward compatibility
        data.zoneHtBoxes = cleanedHtBoxes;
        data.zoneTvaBoxes = cleanedTvaBoxes;
        
        setExtractionState(prev => ({
          ...prev,
          extractionResult: {
            ...prev.extractionResult,
            zone_ht_boxes: finalHtBoxes,
            zone_tva_boxes: finalTvaBoxes
          }
        }));
        
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
      // After all extractions, check for duplicates
      if (i === extractionState.filePreviews.length - 1) {
        try {
          const duplicateIndices = await checkForDuplicates(results, showNotification);
          results = results.map((result, idx) => ({
            ...result,
            isDuplicate: duplicateIndices.has(idx)
          }));
        } catch (error) {
          console.error("Error checking duplicates:", error);
        }
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
      
      
      // Log zone results for debugging
    
      
      // First, update the data with the extracted information
      let data = result.data || {};
      if (data.numFacture && !data.numeroFacture) {
        data.numeroFacture = data.numFacture;
      }
      data.fournisseur = extractionState.selectedModelName || extractionState.extractedDataList[idx]?.fournisseur || "";
      
      // Get zone results from the response - check both root level and zone_results
      const zoneData = result.zone_results || {};
      const zoneHtBoxes = result.zone_ht_boxes || zoneData.zone_ht_boxes || [];
      const zoneTvaBoxes = result.zone_tva_boxes || zoneData.zone_tva_boxes || [];
      
     
      
      // Only update the box coordinates if they don't exist yet
      if (zoneHtBoxes.length > 0 && !data.boxHT) {
        data.boxHT = {
          left: zoneHtBoxes[0].left,
          top: zoneHtBoxes[0].top,
          width: zoneHtBoxes[0].width,
          height: zoneHtBoxes[0].height
        };
      }
      
      if (zoneTvaBoxes.length > 0 && !data.boxTVA) {
        data.boxTVA = {
          left: zoneTvaBoxes[0].left,
          top: zoneTvaBoxes[0].top,
          width: zoneTvaBoxes[0].width,
          height: zoneTvaBoxes[0].height
        };
      }
      
      // Update the extracted data list with zone boxes
      // This ensures each image maintains its own zone data
      setExtractionState(prev => {
        const newExtractedDataList = [...prev.extractedDataList];
        const currentIndex = prev.currentPdfIndex;
        
        if (newExtractedDataList[currentIndex]) {
          newExtractedDataList[currentIndex] = {
            ...newExtractedDataList[currentIndex],
            zoneHtBoxes: cleanZoneData(zoneHtBoxes),
            zoneTvaBoxes: cleanZoneData(zoneTvaBoxes),
            // Keep existing selections if they exist
            selectedZoneHt: newExtractedDataList[currentIndex]?.selectedZoneHt || '',
            selectedZoneTva: newExtractedDataList[currentIndex]?.selectedZoneTva || ''
          };
        }
        
        return {
          ...prev,
          extractedDataList: newExtractedDataList,
          extractionResult: {
            ...prev.extractionResult,
            zone_ht_boxes: zoneHtBoxes,
            zone_tva_boxes: zoneTvaBoxes
          }
        };
      });
      
      setExtractionState((prev) => {
        const newExtracted = [...prev.extractedDataList];
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
      throw error; // Re-throw to handle in the caller if needed
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