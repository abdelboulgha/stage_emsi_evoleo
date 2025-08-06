import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = "http://localhost:8000";

export const useSetup = (setupState, setSetupState, setExtractionState, setCurrentStep, setIsLoading, showNotification) => {
  const navigate = useNavigate();

  const validateSetupAndProceed = useCallback((state = null) => {
    const currentState = state || {
      ...setupState,
      invoiceType: setupState.invoiceType,
      selectedFiles: setupState.selectedFiles || [],
      filePreviews: setupState.filePreviews || [],
      processingMode: setupState.processingMode,
      selectedModel: setupState.selectedModel || "" // Keep as string or object
    };

    if (!currentState.invoiceType) {
      return false;
    }

    if (!currentState.filePreviews || currentState.filePreviews.length === 0) {
      showNotification("Veuillez sélectionner au moins un fichier", "error");
      return false;
    }

    if (currentState.processingMode === "same" && !currentState.selectedModel) {
      showNotification("Veuillez sélectionner un modèle pour le mode 'même modèle'", "error");
      return false;
    }

    // Extract id and name from selectedModel
    const fournisseurId = typeof currentState.selectedModel === 'object'
      ? currentState.selectedModel.id || ""
      : currentState.selectedModel || "";
    const fournisseurName = typeof currentState.selectedModel === 'object'
      ? currentState.selectedModel.name || ""
      : currentState.selectedModel || "";

    const extractedDataList = Array(currentState.filePreviews.length)
      .fill({})
      .map(() => ({
        fournisseur: fournisseurName // Use name for display in extracted data
      }));

    setExtractionState({
      uploadedFiles: currentState.selectedFiles,
      filePreviews: currentState.filePreviews.map((p) => p.preview),
      previewDimensions: currentState.filePreviews.map((p) => ({
        fileName: p.fileName,
        pageNumber: p.pageNumber,
        totalPages: p.totalPages,
      })),
      currentPdfIndex: 0,
      extractedDataList,
      confidenceScores: Array(currentState.filePreviews.length).fill({}),
      isProcessing: false,
      processingMode: currentState.processingMode,
      selectedModelId: fournisseurId, // Store ID for backend API calls
      selectedModelName: fournisseurName // Store name for display
    });

    setCurrentStep("extract");
    navigate("/extract");
    showNotification("Configuration validée, début de l'extraction", "success");
  }, [setupState, setExtractionState, setCurrentStep, showNotification, navigate]);

  const loadExistingMappings = useCallback(async (setMappings) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/mappings`, {
        credentials: 'include', // Ajout des cookies
      });
      const data = await response.json();
      if (data.status === "success") {
        setMappings(data.mappings);
      }
    } catch (error) {
      console.error("Error loading mappings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading]);

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

        const response = await fetch(`${API_BASE_URL}/upload-basic`, {
          method: "POST",
          credentials: 'include', // Ajout des cookies
          body: formData,
        });
        const result = await response.json();

        if (result.success) {
          if (result.images) {
            result.images.forEach((img, index) => {
              const uniqueId = `${file.name}-${file.lastModified}-${Date.now()}-${index}`;
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

      const newState = {
        ...setupState,
        selectedFiles: files,
        filePreviews: previews,
      };

      setSetupState(newState);
      showNotification(
        `${files.length} fichier(s) ajouté(s) (${previews.length} page(s))`,
        "success"
      );

      if (files.length === 1) {
        const file = files[0];
        const filePreview = previews[0];
        if (filePreview.totalPages === 1) {
          validateSetupAndProceed({
            ...setupState,
            invoiceType: setupState.invoiceType,
            selectedFiles: files,
            filePreviews: previews,
          });
        }
      }

      event.target.value = "";
    } catch (error) {
      showNotification("Erreur lors du chargement des fichiers", "error");
    } finally {
      setIsLoading(false);
    }
  }, [setupState, setSetupState, setIsLoading, showNotification, validateSetupAndProceed]);

  const removeFile = useCallback((indexToRemove) => {
    setSetupState((prev) => ({
      ...prev,
      filePreviews: prev.filePreviews.filter((_, index) => index !== indexToRemove),
      selectedFiles: prev.selectedFiles.filter((_, index) => index !== indexToRemove),
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