import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = "http://localhost:8000";

export const useSetup = (setupState, setSetupState, setExtractionState, setCurrentStep, setIsLoading, showNotification) => {
  const { token } = useAuth();
  const loadExistingMappings = useCallback(async (setMappings) => {
    try {
      setIsLoading(true);
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/mappings`, { headers });
      const data = await response.json();
      if (data.status === "success") {
        setMappings(data.mappings);
      }
    } catch (error) {
      console.error("Error loading mappings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, token]);

  const handleSetupFileUpload = useCallback(async (event) => {
    const files = Array.from(event.target.files);
    
    if (!files.length) {
      return;
    }

    setIsLoading(true);

    try {
      const previews = [];
      for (const [fileIndex, file] of files.entries()) {
        const formData = new FormData();
        formData.append("file", file);

        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE_URL}/upload-basic`, {
          method: "POST",
          headers,
          body: formData,
        });
        const result = await response.json();

        if (result.success) {
          if (result.images) {
            // Handle multi-page PDF results
            result.images.forEach((img, index) => {
              const uniqueId = `${file.name}-${
                file.lastModified
              }-${Date.now()}-${index}`;
               
              previews.push({
                id: uniqueId,
                file: file,
                preview: img,
                fileName: file.name,
                pageNumber: index + 1,
                totalPages: result.images.length,
              });
            });
          } else {
            // Handle single image result
            const uniqueId = `${file.name}-${file.lastModified}-${Date.now()}`;
          
            previews.push({
              id: uniqueId,
              file: file,
              preview: result.image,
              fileName: file.name,
              pageNumber: 1,
              totalPages: 1,
            });
          }
        }
      }

      // Create a new state with the updated previews
      const newState = {
        ...setupState,
        selectedFiles: files,
        filePreviews: previews,
      };

      // Update the state
      setSetupState(newState);
      
      // Show notification
      showNotification(
        `${files.length} fichier(s) ajouté(s) (${previews.length} page(s))`,
        "success"
      );
      
      // For single file uploads, auto-validate
      if (files.length === 1) {
        validateSetupAndProceed({
          ...setupState,
          invoiceType: setupState.invoiceType,
          selectedFiles: files,
          filePreviews: previews,
        });
      } 
      
      // Clear the file input to allow re-uploading the same file
      event.target.value = "";
    } catch (error) {
      showNotification("Erreur lors du chargement des fichiers", "error");
    } finally {
      setIsLoading(false);
    }
  }, [setupState, setSetupState, setIsLoading, showNotification, token]);

  const validateSetupAndProceed = useCallback((state = null) => {
    if (state === null) {
      state = {
        ...setupState,
        invoiceType: setupState.invoiceType,
        selectedFiles: setupState.selectedFiles || [],
        filePreviews: setupState.filePreviews || [],
        processingMode: setupState.processingMode,
        selectedModel: setupState.selectedModel,
      };
    }
   
    const currentState = state;

    const invoiceType = currentState.invoiceType || setupState.invoiceType;
    
    if (!invoiceType) {
      return false;
    }

    if (!currentState.filePreviews || currentState.filePreviews.length === 0) {
      showNotification("Veuillez sélectionner au moins un fichier", "error");
      return false;
    }

    // Vérifier la sélection du modèle pour le mode "same"
    if (currentState.processingMode === "same" && !currentState.selectedModel) {
      showNotification("Veuillez sélectionner un modèle pour le mode 'même modèle'", "error");
      return false;
    }

    // Use the current state that was passed in or from setupState
    const stateToUse = state || setupState;
    
    // Make sure we have the latest invoice type from the component state
   const finalState = {
     ...stateToUse,
     invoiceType: stateToUse.invoiceType || setupState.invoiceType,
     processingMode: stateToUse.processingMode || setupState.processingMode,
     selectedModel: stateToUse.selectedModel || setupState.selectedModel,
   };
    
    if (!finalState.invoiceType) {
      console.error("No invoice type found in state");
      showNotification("Erreur: Type de facture non défini", "error");
      return false;
    }
    
    const fournisseurName = finalState.selectedModel || "";
    const extractedDataList = Array(finalState.filePreviews.length)
      .fill({})
      .map(() => ({ fournisseur: fournisseurName }));
      setExtractionState({
        uploadedFiles: finalState.selectedFiles,
        filePreviews: finalState.filePreviews.map((p) => p.preview),
        previewDimensions: finalState.filePreviews.map((p) => ({
          fileName: p.fileName,
          pageNumber: p.pageNumber,
          totalPages: p.totalPages,
        })),
        currentPdfIndex: 0,
        extractedDataList, 
        confidenceScores: Array(finalState.filePreviews.length).fill({}),
        isProcessing: false,
        processingMode: finalState.processingMode,
        selectedModel: finalState.selectedModel,
      });

    setCurrentStep("extract");
    showNotification("Configuration validée, début de l'extraction", "success");
  }, [setupState, setExtractionState, setCurrentStep, showNotification, token]);

  const removeFile = useCallback((indexToRemove) => {
    setSetupState((prev) => ({
      ...prev,
      filePreviews: prev.filePreviews.filter(
        (_, index) => index !== indexToRemove
      ),
      selectedFiles: prev.selectedFiles.filter(
        (_, index) => index !== indexToRemove
      ),
    }));
  }, [setSetupState]);

  const backToSetup = useCallback(() => {
    setCurrentStep("setup");
  }, [setCurrentStep]);

  return {
    loadExistingMappings,
    handleSetupFileUpload,
    validateSetupAndProceed,
    removeFile,
    backToSetup,
  };
}; 