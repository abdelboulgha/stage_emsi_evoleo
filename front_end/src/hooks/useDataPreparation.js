import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = "http://localhost:8000";

export const useDataPreparation = (setDataPrepState, setCurrentStep, setIsLoading, showNotification) => {
  const navigate = useNavigate();

  const getDefaultZoom = (imgWidth, containerWidth = 900) => {
    return Math.min(1, containerWidth / imgWidth);
  };

  const getPagePreviews = useCallback(
    async (file) => {
      if (!file || file.type !== "application/pdf") {
        throw new Error("Fichier invalide. Veuillez sélectionner un PDF.");
      }

      setIsLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        
        const response = await fetch(`${API_BASE_URL}/pdf-page-previews`, {
          method: "POST",
          credentials: 'include', // Ajout des cookies
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Erreur serveur: ${response.status}`);
        }

        const result = await response.json();
       
        if (result.success && result.pages) {
          return result.pages.map((page, index) => ({
            preview: page.image,
            pageNumber: index + 1,
          }));
        } else {
          throw new Error(result.message || "Erreur lors de la récupération des aperçus");
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des aperçus:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [setIsLoading]
  );

  const handleDataPrepFileUpload = useCallback(
    async (event, pageIndex = 0) => {
      const files = event.target.files;
      if (!files || files.length === 0) {
        showNotification("Aucun fichier sélectionné", "error");
        return;
      }

      const file = files[0];

      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("page_index", pageIndex.toString());
        
        setCurrentStep("dataprep");
        navigate("/parametre");
    
        const response = await fetch(`${API_BASE_URL}/upload-for-dataprep`, {
          method: "POST",
          credentials: 'include', // Ajout des cookies
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
            currentZoom: 1.0, // Set default zoom to 100%
            fieldMappings: {},
            selectionHistory: [],
            ocrBoxes: result.boxes || [],
            selectedBoxes: {},
            fileName: file.name,
            fileType: file.type,
            selectedPageIndex: pageIndex,
          }));
          console.log("OCR Boxes reçues :", result.boxes); // DEBUG
        
          showNotification(
            `Page ${pageIndex + 1} chargée avec succès (${widthToUse} × ${heightToUse} px) - ${
              result.box_count || (result.boxes ? result.boxes.length : 0)
            } boîtes OCR détectées`,
            "success"
          );
        } else {
          throw new Error(result.message || "Erreur lors du chargement");
        }
      } catch (error) {
        console.error("Erreur:", error);
        showNotification(`Erreur lors du chargement de la page ${pageIndex + 1}: ${error.message}`, "error");
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
      }));

      showNotification(`Sélectionnez une boîte OCR pour "${fieldKey}"`, "info");
    },
    [setDataPrepState, showNotification]
  );

  const startManualDraw = useCallback((fieldKey) => {
    setDataPrepState((prev) => ({
      ...prev,
      isSelecting: false,
      selectedField: null,
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

    const field_map = {};
    ['numeroFacture', 'dateFacturation'].forEach(field => {
      if (dataPrepState.fieldMappings[field]) {
        field_map[field] = dataPrepState.fieldMappings[field];
      }
    });

    if (!field_map.numeroFacture && !field_map.dateFacturation) {
      showNotification("Veuillez mapper au moins le numéro de facture ou la date de facturation", "error");
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
        templateId = dataPrepState.fieldMappings.fournisseur.manualValue;
      }
      if (!templateId) templateId = "untitled";

      const response = await fetch(`${API_BASE_URL}/mappings`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Debug": "true",
        },
        credentials: 'include', // Ajout des cookies
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
      credentials: 'include', // Ajout des cookies
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
    getPagePreviews,
  };
};