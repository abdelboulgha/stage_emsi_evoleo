import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";

// Import des composants modulaires
import NavBar from "../NavBar/NavBar";
import Notifications from "../NavBar/Notifications";
import PreparationSetup from "../Preparation/PreparationSetup";
import ExtractionMain from "../Extraction/ExtractionMain";
import ExtractionSidebar from "../Extraction/ExtractionSidebar";
import ExtractionPreview from "../Extraction/ExtractionPreview";
import InvoiceSelectionModal from "../Extraction/InvoiceSelectionModal";
import ParametrageMain from "../Parametrage/ParametrageMain";

const API_BASE_URL = "http://localhost:8000";

const ExtractorNew = () => {
  // Move manualDrawState to the top, before any function uses it
  const [manualDrawState, setManualDrawState] = useState({
    isDrawing: false,
    fieldKey: null,
    start: null,
    rect: null,
  });

  const [currentStep, setCurrentStep] = useState("setup");
  const [mappings, setMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const [setupState, setSetupState] = useState({
    invoiceType: "achat",
    selectedFiles: [],
    filePreviews: [],
    processingMode: "same", // "different" ou "same"
    selectedModel: "", // Pour le mode "same"
  });

  const [extractionState, setExtractionState] = useState({
    uploadedFiles: [],
    filePreviews: [],
    previewDimensions: [],
    currentPdfIndex: 0,
    extractedDataList: [],
    confidenceScores: [],
    isProcessing: false,
    extractionBoxes: [], 
  });

  const [dataPrepState, setDataPrepState] = useState({
    uploadedImage: null,
    imageDimensions: { width: 0, height: 0 },
    currentZoom: 1,
    isSelecting: false,
    selectedField: null,
    fieldMappings: {},
    selectionHistory: [],
    ocrPreview: "",
    ocrBoxes: [],
    selectedBoxes: {},
    fileName: "",
    fileType: "",
  });

  const [invoiceSelection, setInvoiceSelection] = useState({
    isOpen: false,
    selectedInvoices: [],
    isSaving: false,
  });

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const previewImageRef = useRef(null);
  const horizontalScrollRef = useRef(null);
  const extractCanvasRef = useRef(null);
  const extractionBoxesCanvasRef = useRef(null);

  const EXTRACTION_FIELDS = [
    { key: "fournisseur", label: "Fournisseur" },
    { key: "numeroFacture", label: "Numéro de Facture" },
    { key: "tauxTVA", label: "Taux TVA" },
    { key: "montantHT", label: "Montant HT" },
    { key: "montantTVA", label: "Montant TVA" },
    { key: "montantTTC", label: "Montant TTC" },
  ];

  const showNotification = useCallback(
    (message, type = "success", duration = 5000) => {
      const id = Date.now();
      const notification = { id, message, type, duration };

      setNotifications((prev) => [...prev, notification]);

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    },
    []
  );

  const loadExistingMappings = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/mappings`);
      const data = await response.json();
      if (data.status === "success") {
        setMappings(data.mappings);
      }
    } catch (error) {
      console.error("Error loading mappings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  // Toutes les fonctions existantes du composant original
  const handleSaveInvoices = useCallback(async () => {
    try {
      setInvoiceSelection((prev) => ({ ...prev, isSaving: true }));
      
      const invoicesToSave = extractionState.extractedDataList
        .filter((_, index) => invoiceSelection.selectedInvoices.includes(index))
        .map((data) => {
          // Apply filtering to each field using the filterValue function
          const fournisseur = filterValue(data.fournisseur, "fournisseur");
          const numeroFacture = filterValue(data.numeroFacture, "numeroFacture");
          const tauxTVA = filterValue(data.tauxTVA, "tauxTVA");
          const montantHT = filterValue(data.montantHT, "montantHT");
          const montantTVA = filterValue(data.montantTVA, "montantTVA");
          const montantTTC = filterValue(data.montantTTC, "montantTTC");

          // Return the invoice data with proper types
          return {
            fournisseur,
            numeroFacture,
            tauxTVA: parseFloat(tauxTVA) || 0,
            montantHT: parseFloat(montantHT) || 0,
            montantTVA: parseFloat(montantTVA) || 0,
            montantTTC: parseFloat(montantTTC) || 0,
          };
        });

      // Save each invoice one by one
      const results = [];
      for (const invoice of invoicesToSave) {
        try {
          const response = await fetch(`${API_BASE_URL}/ajouter-facture`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(invoice),
          });
          
          const result = await response.json();
          results.push({ success: result.success, message: result.message });
          
          if (!result.success) {
            console.error("Error saving invoice:", result.message);
          }
        } catch (error) {
          console.error("Error saving invoice:", error);
          results.push({ success: false, message: error.message });
        }
      }
      
      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.length - successCount;
      
      if (errorCount === 0) {
        showNotification(
          `${successCount} facture(s) enregistrée(s) avec succès`,
          "success"
        );
      } else if (successCount === 0) {
        showNotification(
          `Erreur lors de l'enregistrement des factures`,
          "error"
        );
      } else {
        showNotification(
          `${successCount} facture(s) enregistrée(s), ${errorCount} échec(s)`,
          "warning"
        );
      }
      
      // Close the modal and reset state
      setInvoiceSelection((prev) => ({
        ...prev,
        isOpen: false,
        selectedInvoices: [],
        isSaving: false,
      }));
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des factures:", error);
      showNotification(
        error.message || "Erreur lors de la sauvegarde des factures",
        "error"
      );
      setInvoiceSelection((prev) => ({ ...prev, isSaving: false }));
    }
  }, [
    extractionState,
    setupState.invoiceType,
    invoiceSelection.selectedInvoices,
    showNotification,
  ]);

  const toggleSelectAllInvoices = useCallback(
    (checked) => {
      if (checked) {
        setInvoiceSelection((prev) => ({
          ...prev,
          selectedInvoices: extractionState.extractedDataList.map(
            (_, index) => index
          ),
        }));
      } else {
        setInvoiceSelection((prev) => ({ ...prev, selectedInvoices: [] }));
      }
    },
    [extractionState.extractedDataList]
  );

  const toggleInvoiceSelection = useCallback((index) => {
    setInvoiceSelection((prev) => {
      const selected = [...prev.selectedInvoices];
      const idx = selected.indexOf(index);
      if (idx === -1) {
        selected.push(index);
      } else {
        selected.splice(idx, 1);
      }
      return { ...prev, selectedInvoices: selected };
    });
  }, []);

  const openSaveModal = useCallback(() => {
    setInvoiceSelection((prev) => ({
      ...prev,
      isOpen: true,
      selectedInvoices: extractionState.extractedDataList.map(
        (_, index) => index
      ),
    }));
  }, [extractionState.extractedDataList]);

  // Dans la fonction handleDataPrepFileUpload, changez aussi currentZoom à 0.6 * getDefaultZoom
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
            currentZoom: getDefaultZoom(widthToUse, 900) * 0.8, // Fit to 900px container, 60% zoom
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
    [showNotification]
  );

  const handleZoomChange = useCallback((factor) => {
    setDataPrepState((prev) => {
      const newZoom = Math.max(0.1, Math.min(5, prev.currentZoom * factor));
      return { ...prev, currentZoom: newZoom };
    });
  }, []);

  const startFieldSelection = useCallback(
    (fieldKey) => {
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
    [showNotification]
  );

  const findClickedBox = useCallback(
    (x, y) => {
      if (!dataPrepState.ocrBoxes || dataPrepState.ocrBoxes.length === 0) {
        return null;
      }

      for (const box of dataPrepState.ocrBoxes) {
        if (!box.coords) continue;

        const boxLeft = box.coords.left;
        const boxTop = box.coords.top;
        const boxRight = boxLeft + box.coords.width;
        const boxBottom = boxTop + box.coords.height;

        if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
          return box;
        }
      }

      return null;
    },
    [dataPrepState.ocrBoxes]
  );

  const handleCanvasMouseDown = useCallback(
    (event) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = (event.clientX - rect.left) / dataPrepState.currentZoom;
      const y = (event.clientY - rect.top) / dataPrepState.currentZoom;

      // Mode dessin manuel
      if (manualDrawState.isDrawing) {
        setManualDrawState((prev) => ({
          ...prev,
          start: { x, y },
          rect: null,
        }));
        return;
      }

      // Mode sélection OCR
      if (dataPrepState.isSelecting && dataPrepState.selectedField) {
        const clickedBox = findClickedBox(x, y);
        if (clickedBox) {
          const fieldMappingsUpdate = {
            ...dataPrepState.fieldMappings,
            [dataPrepState.selectedField]: {
              left: parseFloat(clickedBox.coords.left),
              top: parseFloat(clickedBox.coords.top),
              width: parseFloat(clickedBox.coords.width),
              height: parseFloat(clickedBox.coords.height),
              manual: false,
            },
          };
          
          setDataPrepState((prev) => ({
            ...prev,
            selectedBoxes: {
              ...prev.selectedBoxes,
              [prev.selectedField]: clickedBox,
            },
            fieldMappings: fieldMappingsUpdate,
            isSelecting: false,
            selectedField: null,
            ocrPreview: `Boîte assignée à ${prev.selectedField}: "${clickedBox.text}"`,
          }));

          showNotification(
            `Champ "${dataPrepState.selectedField}" mappé avec succès`,
            "success"
          );
        } else {
          // Aucune boîte cliquée
          showNotification(
            "Aucune boîte OCR trouvée à cet emplacement",
            "error"
          );
        }
      }
    },
    [
      dataPrepState.isSelecting,
      dataPrepState.selectedField,
      dataPrepState.currentZoom,
      findClickedBox,
      manualDrawState.isDrawing,
      showNotification,
    ]
  );

  const handleCanvasMouseMove = useCallback(
    (event) => {
      if (manualDrawState.isDrawing && manualDrawState.start) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (event.clientX - rect.left) / dataPrepState.currentZoom;
        const y = (event.clientY - rect.top) / dataPrepState.currentZoom;
        const left = Math.min(manualDrawState.start.x, x);
        const top = Math.min(manualDrawState.start.y, y);
        const width = Math.abs(x - manualDrawState.start.x);
        const height = Math.abs(y - manualDrawState.start.y);
        setManualDrawState((prev) => ({
          ...prev,
          rect: { left, top, width, height },
        }));
      }
    },
    [manualDrawState, dataPrepState.currentZoom]
  );

  // Dans handleCanvasMouseUp, ajoute un seuil minimum de taille
  const MIN_WIDTH = 30;
  const MIN_HEIGHT = 15;
  const handleCanvasMouseUp = useCallback(
    (event) => {
      if (
        manualDrawState.isDrawing &&
        manualDrawState.start &&
        manualDrawState.rect
      ) {
        const fieldKey = manualDrawState.fieldKey;
        const rect = manualDrawState.rect;
        // Vérifie la taille minimale
        if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) {
          showNotification(`Sélection trop petite (minimum ${MIN_WIDTH}×${MIN_HEIGHT} pixels)`, 'error');
          setManualDrawState({
            isDrawing: false,
            fieldKey: null,
            start: null,
            rect: null,
          });
          return;
        }
        setDataPrepState((prev) => ({
          ...prev,
          fieldMappings: {
            ...prev.fieldMappings,
            [fieldKey]: { ...rect, manual: true },
          },
          selectedBoxes: {
            ...prev.selectedBoxes,
            [fieldKey]: { coords: { ...rect }, manual: true },
          },
        }));
        setManualDrawState({
          isDrawing: false,
          fieldKey: null,
          start: null,
          rect: null,
        });
        // --- OCR Preview Call ---
        if (dataPrepState.uploadedImage) {
          ocrPreviewManual(rect, dataPrepState.uploadedImage).then(result => {
            if (result.success) {
              showNotification(`Texte extrait: ${result.text}`, "success");
              setOcrPreviewFields(prev => ({
                ...prev,
                [fieldKey]: result.text
              }));
            } else {
              showNotification("Erreur OCR: " + result.text, "error");
            }
          });
        }
      }
    },
    [manualDrawState, dataPrepState.uploadedImage]
  );

  const drawOcrBox = useCallback(
    (ctx, box, isSelected, isSelecting) => {
      const x = box.coords.left * dataPrepState.currentZoom;
      const y = box.coords.top * dataPrepState.currentZoom;
      const width = box.coords.width * dataPrepState.currentZoom;
      const height = box.coords.height * dataPrepState.currentZoom;

      let color, fillColor;
      if (isSelected) {
        color = "#22d3ee";
        fillColor = "rgba(34, 211, 238, 0.10)";
      } else if (isSelecting) {
        color = "#3b82f6";
        fillColor = "rgba(59, 130, 246, 0.10)";
      } else {
        color = "#f43f5e";
        fillColor = "rgba(244, 63, 94, 0.07)";
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, width, height);
    },
    [dataPrepState.currentZoom]
  );

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataPrepState.uploadedImage) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (imageRef.current && imageRef.current.complete) {
      const scaledWidth =
        dataPrepState.imageDimensions.width * dataPrepState.currentZoom;
      const scaledHeight =
        dataPrepState.imageDimensions.height * dataPrepState.currentZoom;
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      ctx.drawImage(imageRef.current, 0, 0, scaledWidth, scaledHeight);
      // Only draw OCR boxes and saved rectangles if not drawing
      if (!manualDrawState.isDrawing) {
        dataPrepState.ocrBoxes.forEach((box) => {
          const isSelected = Object.values(dataPrepState.selectedBoxes).some(
            (selectedBox) => selectedBox.id === box.id
          );
          const isSelecting =
            dataPrepState.isSelecting && dataPrepState.selectedField;
          drawOcrBox(ctx, box, isSelected, isSelecting);
        });
        // Draw saved manual rectangles
        Object.entries(dataPrepState.fieldMappings).forEach(
          ([field, coords]) => {
            if (coords && coords.manual) {
              ctx.save();
              ctx.strokeStyle = "#fbbf24";
              ctx.lineWidth = 2;
              ctx.setLineDash([2, 2]);
              ctx.strokeRect(
                coords.left * dataPrepState.currentZoom,
                coords.top * dataPrepState.currentZoom,
                coords.width * dataPrepState.currentZoom,
                coords.height * dataPrepState.currentZoom
              );
              ctx.restore();
            }
          }
        );
      }
    }
    // Only show the in-progress rectangle if drawing
    if (manualDrawState.isDrawing && manualDrawState.rect) {
      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 2]);
      const { left, top, width, height } = manualDrawState.rect;
      ctx.strokeRect(
        left * dataPrepState.currentZoom,
        top * dataPrepState.currentZoom,
        width * dataPrepState.currentZoom,
        height * dataPrepState.currentZoom
      );
      ctx.restore();
    }
  }, [dataPrepState, manualDrawState]);

  const saveMappings = useCallback(async () => {
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
  }, [
    dataPrepState.fieldMappings,
    dataPrepState.uploadedImage,
    dataPrepState.fileName,
    showNotification,
    loadExistingMappings,
  ]);

  // Fonctions manquantes pour la préparation
  const handleSetupFileUpload = async (event) => {
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
  };

  const validateSetupAndProceed = (state = null) => {
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
  };

  const removeFile = (indexToRemove) => {
    setSetupState((prev) => ({
      ...prev,
      filePreviews: prev.filePreviews.filter(
        (_, index) => index !== indexToRemove
      ),
      selectedFiles: prev.selectedFiles.filter(
        (_, index) => index !== indexToRemove
      ),
    }));
  };

  // Fonctions manquantes pour l'extraction
  const backToSetup = () => {
    setCurrentStep("setup");
  };

  const extractAllPdfs = async () => {
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
        const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
          method: "POST",
          body: formData,
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
  };

  const filterValue = (val, fieldKey) => {
    if (!val) return "";
    if (fieldKey === "fournisseur") return val;
    
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
  };

  // Fonctions manquantes pour l'extraction
  const [extractDrawState, setExtractDrawState] = useState({
    isDrawing: false,
    fieldKey: null,
    start: null,
    rect: null,
  });

  const [hoveredIndex, setHoveredIndex] = useState(null);

  const hasMapping = (fileName) => {
    if (!fileName) return false;
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    return mappings && Object.keys(mappings).includes(baseName);
  };

  const isExtractionComplete = (data) => {
    // Utilise les bonnes clés extraites par le backend
    const requiredFields = [
      "fournisseur",
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
  };

  const scrollToIndex = (index) => {
    setExtractionState((prev) => ({ ...prev, currentPdfIndex: index }));
    
    // En mode "same", extraire automatiquement avec le modèle sélectionné
    if (extractionState.processingMode === "same" && extractionState.selectedModel) {
      // Vérifier si l'extraction n'a pas déjà été faite pour cette page
      if (!extractionState.extractedDataList[index] || 
          Object.keys(extractionState.extractedDataList[index] || {}).length === 0) {
        extractCurrentPdf(extractionState.selectedModel, index);
      }
    } else {
      // En mode "different", afficher la modale de sélection
      setPendingExtractIndex(index);
      setShowModelSelectModal(true);
      setModalSelectedTemplateId("");
    }
  };

  const goToPrevPdf = () => {
    const newIndex = Math.max(0, extractionState.currentPdfIndex - 1);
    scrollToIndex(newIndex);
  };

  const goToNextPdf = () => {
    const newIndex = Math.min(
      extractionState.filePreviews.length - 1,
      extractionState.currentPdfIndex + 1
    );
    scrollToIndex(newIndex);
  };

  // Fonction pour extraire la page courante
  const extractCurrentPdf = async (templateId, index) => {
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
      const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
        method: "POST",
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
  };

  // Fonction pour lancer FoxPro
  const launchFoxPro = async () => {
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
      });
      
      const result = await response.json();
      
    } catch (error) {
      console.error('Erreur lors du lancement de FoxPro:', error);
      alert('Erreur lors du lancement de FoxPro');
    }
  };

  // Ajoute un nouvel état pour la modale de sélection de modèle
  const [showModelSelectModal, setShowModelSelectModal] = useState(false);
  const [pendingExtractIndex, setPendingExtractIndex] = useState(null);
  const [modalSelectedTemplateId, setModalSelectedTemplateId] = useState("");

  // Ajoute l'état pour stocker l'aperçu OCR par champ
  const [ocrPreviewFields, setOcrPreviewFields] = useState({});

  useEffect(() => {
    loadExistingMappings();
  }, [loadExistingMappings]);

  useEffect(() => {
    if (dataPrepState.uploadedImage && imageRef.current) {
      imageRef.current.onload = () => redrawCanvas();
      imageRef.current.src = dataPrepState.uploadedImage;
    }
  }, [dataPrepState.uploadedImage, redrawCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown", handleCanvasMouseDown);
    canvas.addEventListener("mousemove", handleCanvasMouseMove);
    canvas.addEventListener("mouseup", handleCanvasMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", handleCanvasMouseDown);
      canvas.removeEventListener("mousemove", handleCanvasMouseMove);
      canvas.removeEventListener("mouseup", handleCanvasMouseUp);
    };
  }, [handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp]);

  // Fonction utilitaire pour le zoom
  const getDefaultZoom = (imgWidth, containerWidth = 900) => {
    return Math.min(1, containerWidth / imgWidth);
  };

  // Fonction pour l'aperçu OCR manuel
  const ocrPreviewManual = async (coords, imageBase64) => {
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
  };

  // Fonction pour démarrer le dessin manuel
  const startManualDraw = (fieldKey) => {
    // Annuler le mode sélection si actif
    setDataPrepState((prev) => ({
      ...prev,
      isSelecting: false,
      selectedField: null,
      ocrPreview: `Mode dessin activé pour "${fieldKey}". Dessinez un rectangle.`,
    }));

    setManualDrawState({ isDrawing: true, fieldKey, start: null, rect: null });
    showNotification(
      `Mode dessin activé pour "${fieldKey}". Dessinez un rectangle.`,
      "info"
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 w-full">
      <NavBar currentStep={currentStep} setCurrentStep={setCurrentStep} />
      
      <Notifications notifications={notifications} />

      <main className="w-full px-4 py-6">
        {currentStep === "setup" && (
          <PreparationSetup
            setupState={setupState}
            setSetupState={setSetupState}
            mappings={mappings}
            isLoading={isLoading}
            handleSetupFileUpload={handleSetupFileUpload}
            handleSingleDataPrepUpload={handleDataPrepFileUpload}
            validateSetupAndProceed={validateSetupAndProceed}
            removeFile={removeFile}
            showNotification={showNotification}
          />
        )}

        {currentStep === "extract" && (
          <>
            <ExtractionMain
              extractionState={extractionState}
              setExtractionState={setExtractionState}
              backToSetup={backToSetup}
              extractAllPdfs={extractAllPdfs}
              openSaveModal={openSaveModal}
              launchFoxPro={launchFoxPro}
              filterValue={filterValue}
              EXTRACTION_FIELDS={EXTRACTION_FIELDS}
              extractDrawState={extractDrawState}
              setExtractDrawState={setExtractDrawState}
              showNotification={showNotification}
              scrollToIndex={scrollToIndex}
              goToPrevPdf={goToPrevPdf}
              goToNextPdf={goToNextPdf}
              hoveredIndex={hoveredIndex}
              setHoveredIndex={setHoveredIndex}
              isExtractionComplete={isExtractionComplete}
              mappings={mappings}
              setCurrentStep={setCurrentStep}
              setIsLoading={setIsLoading}
              setDataPrepState={setDataPrepState}
            />
            
            {/* Invoice Selection Modal */}
            {invoiceSelection.isOpen && (
              <InvoiceSelectionModal
                invoiceSelection={invoiceSelection}
                setInvoiceSelection={setInvoiceSelection}
                extractionState={extractionState}
                toggleSelectAllInvoices={toggleSelectAllInvoices}
                toggleInvoiceSelection={toggleInvoiceSelection}
                handleSaveInvoices={handleSaveInvoices}
              />
            )}

            {/* Model Selection Modal */}
            {showModelSelectModal && createPortal(
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
                <div className="bg-white rounded-2xl w-full max-w-md flex flex-col">
                  <div className="p-6 border-b">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Sélectionnez un modèle</h3>
                    <p className="text-gray-600 text-sm mb-1">Choisissez le modèle à utiliser pour l'extraction de cette page.</p>
                  </div>
                  <div className="p-6 flex flex-col gap-4">
                    <select
                      value={modalSelectedTemplateId}
                      onChange={e => setModalSelectedTemplateId(e.target.value)}
                      className="w-full px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-gray-800 placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    >
                      <option value="">Sélectionnez un modèle</option>
                      {Object.keys(mappings).map(tpl => (
                        <option key={tpl} value={tpl}>{tpl}</option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        if (!modalSelectedTemplateId) return;
                        setShowModelSelectModal(false);
                        // Lance l'extraction pour la page sélectionnée
                        await extractCurrentPdf(modalSelectedTemplateId, pendingExtractIndex);
                      }}
                      disabled={!modalSelectedTemplateId}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Extraire
                    </button>
                    <button
                      onClick={() => setShowModelSelectModal(false)}
                      className="w-full px-4 py-2 mt-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </>
        )}

        {currentStep === "dataprep" && (
          <ParametrageMain
            dataPrepState={dataPrepState}
            setDataPrepState={setDataPrepState}
            manualDrawState={manualDrawState}
            setManualDrawState={setManualDrawState}
            isLoading={isLoading}
            handleDataPrepFileUpload={handleDataPrepFileUpload}
            handleZoomChange={handleZoomChange}
            startFieldSelection={startFieldSelection}
            startManualDraw={startManualDraw}
            saveMappings={saveMappings}
            showNotification={showNotification}
            canvasRef={canvasRef}
            imageRef={imageRef}
            redrawCanvas={redrawCanvas}
            handleCanvasMouseDown={handleCanvasMouseDown}
            handleCanvasMouseMove={handleCanvasMouseMove}
            handleCanvasMouseUp={handleCanvasMouseUp}
            drawOcrBox={drawOcrBox}
            ocrPreviewFields={ocrPreviewFields}
            setOcrPreviewFields={setOcrPreviewFields}
          />
        )}
      </main>
    </div>
  );
};

export default ExtractorNew; 