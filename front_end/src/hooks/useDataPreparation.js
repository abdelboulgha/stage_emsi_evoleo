import { useCallback } from 'react';

const API_BASE_URL = "http://localhost:8000";

export const useDataPreparation = (setDataPrepState, setCurrentStep, setIsLoading, showNotification) => {
  // Fonction utilitaire pour le zoom
  const getDefaultZoom = (imgWidth, containerWidth = 900) => {
    return Math.min(1, containerWidth / imgWidth);
  };

  const handleDataPrepFileUpload = useCallback(
    async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      setCurrentStep("dataprep");
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${API_BASE_URL}/upload-for-dataprep`, {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (result.success) {
          const imageToUse = result.unwarped_image || result.image;
          const widthToUse = result.unwarped_width || result.width;
          const heightToUse = result.unwarped_height || result.height;

          setDataPrepState((prev) => ({
            ...prev,
            uploadedImage: imageToUse,
            imageDimensions: { width: widthToUse, height: heightToUse },
            currentZoom: getDefaultZoom(widthToUse, 900) * 0.8,
            fieldMappings: {},
            selectionHistory: [],
            ocrBoxes: result.boxes || [],
            selectedBoxes: {},
            fileName: file.name,
            fileType: file.type,
          }));

          showNotification(
            `Image chargée avec succès (${widthToUse} × ${heightToUse} px) - ${
              result.box_count || (result.boxes ? result.boxes.length : 0)
            } boîtes OCR détectées`,
            "success"
          );
        } else {
          throw new Error(result.message || "Erreur lors du chargement");
        }
      } catch (error) {
        console.error("Erreur:", error);
        showNotification("Erreur lors du chargement de l'image", "error");
      } finally {
        setIsLoading(false);
      }
    },
    [setDataPrepState, setCurrentStep, setIsLoading, showNotification]
  );

  const handleZoomChange = useCallback((factor) => {
    setDataPrepState((prev) => {
      const newZoom = Math.max(0.1, Math.min(5, prev.currentZoom * factor));
      return { ...prev, currentZoom: newZoom };
    });
  }, [setDataPrepState]);

  const startFieldSelection = useCallback(
    (fieldKey, setManualDrawState) => {
      // Annuler le mode dessin si actif
      setManualDrawState({
        isDrawing: false,
        fieldKey: null,
        start: null,
        rect: null,
      });

      setDataPrepState((prev) => ({
        ...prev,
        isSelecting: true,
        selectedField: fieldKey,
        ocrPreview: `Mode sélection activé pour "${fieldKey}". Cliquez sur une boîte OCR rouge.`,
      }));

      showNotification(`Sélectionnez une boîte OCR pour "${fieldKey}"`, "info");
    },
    [setDataPrepState, showNotification]
  );

  const startManualDraw = useCallback((fieldKey) => {
    // Annuler le mode sélection si actif
    setDataPrepState((prev) => ({
      ...prev,
      isSelecting: false,
      selectedField: null,
      ocrPreview: `Mode dessin activé pour "${fieldKey}". Dessinez un rectangle.`,
    }));

    showNotification(
      `Mode dessin activé pour "${fieldKey}". Dessinez un rectangle.`,
      "info"
    );
  }, [setDataPrepState, showNotification]);

  const saveMappings = useCallback(async (dataPrepState, loadExistingMappings) => {
    if (!dataPrepState) {
      showNotification("Erreur: État de l'application invalide", "error");
      return;
    }

    // Build the field_map to send
    const field_map = {};
    // Only include fournisseur if filled
    if (dataPrepState.fieldMappings.fournisseur?.manualValue) {
      field_map.fournisseur = {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        manual: true,
        text: dataPrepState.fieldMappings.fournisseur.manualValue,
      };
    }
    // Only include numeroFacture if mapped
    if (dataPrepState.fieldMappings.numeroFacture) {
      field_map.numeroFacture = dataPrepState.fieldMappings.numeroFacture;
    }

    if (!field_map.fournisseur && !field_map.numeroFacture) {
      showNotification("Veuillez saisir le fournisseur ou mapper le numéro de facture", "error");
      return;
    }

    setIsLoading(true);

    try {
      let uploadedFileName = "";
      try {
        uploadedFileName =
          dataPrepState.uploadedImage?.name ||
          dataPrepState.fileName ||
          new Date().toISOString().slice(0, 10);
        if (typeof uploadedFileName !== "string") {
          uploadedFileName = String(uploadedFileName);
        }
      } catch (e) {
        uploadedFileName = "untitled";
      }
      let templateId = "untitled";
      if (dataPrepState.fieldMappings.fournisseur?.manualValue) {
        templateId = dataPrepState.fieldMappings.fournisseur.manualValue
      }
      if (!templateId) templateId = "untitled";

      const response = await fetch(`${API_BASE_URL}/mappings`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Debug": "true",
        },
        body: JSON.stringify({
          template_id: templateId,
          field_map,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
      }

      const responseData = await response.json();

      showNotification(
        `Mappings sauvegardés avec succès pour le template ${templateId}`,
        "success"
      );
      loadExistingMappings();
      return responseData;
    } catch (error) {
      showNotification(`Erreur: ${error.message}`, "error");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, showNotification]);

  const ocrPreviewManual = useCallback(async (coords, imageBase64, dataPrepState) => {
    let uploadedFileName = dataPrepState.uploadedImage?.name || dataPrepState.fileName || new Date().toISOString().slice(0, 10);
    let baseName = uploadedFileName.replace(/\.[^/.]+$/, "");
    let templateId = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "untitled";

    const formData = new FormData();
    formData.append("left", Math.round(coords.left).toString());
    formData.append("top", Math.round(coords.top).toString());
    formData.append("width", Math.round(coords.width).toString());
    formData.append("height", Math.round(coords.height).toString());
    formData.append("image_data", imageBase64.split(',')[1]);
    formData.append("template_id", templateId);

    const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
      method: "POST",
      body: formData,
    });
    return await response.json();
  }, []);

  return {
    handleDataPrepFileUpload,
    handleZoomChange,
    startFieldSelection,
    startManualDraw,
    saveMappings,
    ocrPreviewManual,
    getDefaultZoom,
  };
}; 