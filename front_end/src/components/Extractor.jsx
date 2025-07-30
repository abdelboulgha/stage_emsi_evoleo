import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  FileText,
  Eye,
  Download,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Building2,
  ShoppingCart,
  Receipt,
  ArrowRight,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Database,
} from "lucide-react";

const API_BASE_URL = "http://localhost:8000";

const Extractor = () => {
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
    processingMode: "different", // "different" ou "same"
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

      console.log("Invoices to save:", invoicesToSave);
      
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
    if (!dataPrepState || !dataPrepState.selectedBoxes) {
      console.error("dataPrepState or selectedBoxes is undefined");
      showNotification("Erreur: État de l'application invalide", "error");
      return;
    }
    
    if (Object.keys(dataPrepState.selectedBoxes).length === 0) {
      showNotification("Veuillez sélectionner au moins un champ", "error");
      return;
    }

    setIsLoading(true);

    try {
      let uploadedFileName = "";
      
      try {
        // Safely get the file name with multiple fallbacks
        uploadedFileName =
          dataPrepState.uploadedImage?.name ||
                         dataPrepState.fileName || 
                         new Date().toISOString().slice(0, 10);
        
        if (typeof uploadedFileName !== "string") {
          console.warn("Uploaded file name is not a string, converting...");
          uploadedFileName = String(uploadedFileName);
        }
      } catch (e) {
        console.error("Error getting file name:", e);
        uploadedFileName = "untitled";
      }
      
      // Generate template ID from file name without extension
      let templateId = "untitled";
      try {
        // Remove file extension
        let baseName = uploadedFileName.replace(/\.[^/.]+$/, "");
        // If empty after removing extension, use 'untitled'
        if (!baseName) baseName = "untitled";
        // Sanitize the name (keep only alphanumeric, underscore, hyphen)
        templateId = baseName.replace(/[^a-zA-Z0-9_-]/g, "_");
      } catch (e) {
        console.error("Error generating template ID, using fallback:", e);
        templateId = `doc_${Date.now()}`; // Fallback with timestamp
      }
      
      if (!dataPrepState.fieldMappings) {
        throw new Error("Aucun mappage de champ à enregistrer");
      }
      
      const response = await fetch(`${API_BASE_URL}/mappings`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Debug": "true",
        },
        body: JSON.stringify({
          template_id: templateId,
          field_map: dataPrepState.fieldMappings,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server response error:", response.status, errorText);
        throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
      }
      
      const responseData = await response.json();
      
      if (response.ok) {
        showNotification(
          `Mappings sauvegardés avec succès pour le template ${templateId}`,
          "success"
        );
        loadExistingMappings();
        return responseData; // Return the response data for further processing if needed
      } else {
        const errorMsg = responseData.detail || "Erreur lors de la sauvegarde";
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showNotification(`Erreur: ${error.message}`, "error");
      throw error; // Re-throw to allow error handling by the caller if needed
    } finally {
      setIsLoading(false);
    }
  }, [
    dataPrepState.selectedBoxes,
    dataPrepState.fieldMappings,
    showNotification,
    loadExistingMappings,
  ]);

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

  const goToMappingConfiguration = () => {
    setCurrentStep("dataprep");
    showNotification(
      "Configurez vos mappings pour le nouveau fournisseur/client",
      "info"
    );
  };

  const validateSetupAndProceed = (state = null) => {
    // If no state is provided, use the current component state
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
    // Use the provided state (which now always has the latest values)
    const currentState = state;

    // Check if invoice type is selected in the current component state
    // This ensures we always check the latest invoice type from the UI
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
    
    setExtractionState({
      uploadedFiles: finalState.selectedFiles,
      filePreviews: finalState.filePreviews.map((p) => p.preview),
      previewDimensions: finalState.filePreviews.map((p) => ({
        fileName: p.fileName,
        pageNumber: p.pageNumber,
        totalPages: p.totalPages,
      })),
      currentPdfIndex: 0,
      extractedDataList: Array(finalState.filePreviews.length).fill({}),
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

  // Function to remove a file from extraction view
  const removeFileFromExtraction = (indexToRemove) => {
    setExtractionState((prev) => {
      const newFilePreviews = [...prev.filePreviews];
      const newPreviewDimensions = [...prev.previewDimensions];
      const newExtractedDataList = [...prev.extractedDataList];
      const newConfidenceScores = [...(prev.confidenceScores || [])];
      
      // Remove the file and its associated data
      newFilePreviews.splice(indexToRemove, 1);
      newPreviewDimensions.splice(indexToRemove, 1);
      newExtractedDataList.splice(indexToRemove, 1);
      if (newConfidenceScores.length > 0) {
        newConfidenceScores.splice(indexToRemove, 1);
      }
      
      // Adjust currentPdfIndex if needed
      let newCurrentPdfIndex = prev.currentPdfIndex;
      if (
        newCurrentPdfIndex >= newFilePreviews.length &&
        newFilePreviews.length > 0
      ) {
        newCurrentPdfIndex = newFilePreviews.length - 1;
      } else if (newFilePreviews.length === 0) {
        newCurrentPdfIndex = 0;
      }
      
      return {
        ...prev,
        filePreviews: newFilePreviews,
        previewDimensions: newPreviewDimensions,
        extractedDataList: newExtractedDataList,
        confidenceScores: newConfidenceScores,
        currentPdfIndex: newCurrentPdfIndex,
      };
    });
    
    // Also update the setup state to keep them in sync
    setSetupState((prev) => ({
      ...prev,
      filePreviews: prev.filePreviews.filter(
        (_, index) => index !== indexToRemove
      ),
      selectedFiles: prev.selectedFiles.filter(
        (_, index) => index !== indexToRemove
      ),
    }));
    
    showNotification("Fichier supprimé avec succès", "success");
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

  const extractAllPdfs = async () => {
    setExtractionState((prev) => ({ ...prev, isProcessing: true }));
    const results = [...extractionState.extractedDataList];
    const confidenceScores = [...(extractionState.confidenceScores || [])];
    
    // Déterminer le template à utiliser
    let templateToUse = null;
    if (extractionState.processingMode === "same" && extractionState.selectedModel) {
      templateToUse = extractionState.selectedModel;
    }
    
    for (let i = 0; i < extractionState.filePreviews.length; i++) {
      const base64 = extractionState.filePreviews[i];
      const res = await fetch(base64);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, `page_${i}.png`);
      
      // Ajouter le template_id si on est en mode "same"
      if (templateToUse) {
        formData.append("template_id", templateToUse);
      } else if (extractionState.processingMode === "same" && extractionState.selectedModel) {
        // Fallback pour le mode "same"
        formData.append("template_id", extractionState.selectedModel);
      }
      
      try {
        const response = await fetch(`${API_BASE_URL}/extract-data`, {
          method: "POST",
          body: formData,
        });
        const result = await response.json();
        results[i] = result.data || {};
        confidenceScores[i] = result.confidence_scores || {};
      } catch (error) {
        results[i] = {};
        confidenceScores[i] = {};
      }
      setExtractionState((prev) => ({
        ...prev,
        extractedDataList: [...results],
        confidenceScores: [...confidenceScores],
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
      const matches = val.toString().match(/[a-zA-Z0-9\-\/ ]+/g);
      return matches ? matches.join("") : "";
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

  const backToSetup = () => {
    setCurrentStep("setup");
  };

  useEffect(() => {
    loadExistingMappings();
  }, [loadExistingMappings]);

  useEffect(() => {
    if (dataPrepState.uploadedImage && imageRef.current) {
      imageRef.current.onload = () => redrawCanvas();
      imageRef.current.src = dataPrepState.uploadedImage;
    }
  }, [dataPrepState.uploadedImage, redrawCanvas]);

  const [showDataPrepUpload, setShowDataPrepUpload] = useState(false);
  
  const handleSingleDataPrepUpload = useCallback(
    async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      setCurrentStep("dataprep");
      setIsLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
     
        // Create a preview URL for the uploaded file
        const filePreview = URL.createObjectURL(file);
        
        // Update dataPrepState with the uploaded file info
        setDataPrepState((prev) => ({
          ...prev,
          uploadedImage: file,
          fileName: file.name,
          filePreview: filePreview,
        }));
        
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
          }));
          setCurrentStep("dataprep");
          setShowDataPrepUpload(false);
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
        showNotification("Erreur lors du chargement de l'image", "error");
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification]
  );

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

  // Extraction automatique lors du changement de page sélectionnée
  useEffect(() => {
    if (
      extractionState.filePreviews.length > 0 &&
      (!extractionState.extractedDataList[extractionState.currentPdfIndex] ||
        Object.keys(
          extractionState.extractedDataList[extractionState.currentPdfIndex] ||
            {}
        ).length === 0)
    ) {
      extractCurrentPdf();
    }
    // eslint-disable-next-line
  }, [extractionState.currentPdfIndex]);

  // Fonction pour extraire la page courante
  const extractCurrentPdf = async (templateId, index) => {
    // En mode "same", utiliser le modèle sélectionné si aucun templateId n'est fourni
    if (!templateId && extractionState.processingMode === "same" && extractionState.selectedModel) {
      templateId = extractionState.selectedModel;
    }
    
    if (!templateId) {
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
    formData.append("template_id", templateId);
    try {
      const response = await fetch(`${API_BASE_URL}/extract-data`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      setExtractionState((prev) => {
        const newExtracted = [...prev.extractedDataList];
        newExtracted[idx] = result.data || {};
        const newScores = [...(prev.confidenceScores || [])];
        newScores[idx] = result.confidence_scores || {};
        return {
          ...prev,
          extractedDataList: newExtracted,
          confidenceScores: newScores,
          isProcessing: false,
        };
      });
    } catch (error) {
      setExtractionState((prev) => ({
        ...prev,
        isProcessing: false,
      }));
    }
  };

  // Extraction automatique du premier fichier à l'arrivée sur la page d'extraction
  useEffect(() => {
    if (
      currentStep === "extract" &&
      extractionState.filePreviews.length > 0 &&
      (!extractionState.extractedDataList[0] ||
        Object.keys(extractionState.extractedDataList[0] || {}).length === 0)
    ) {
      extractCurrentPdf();
    }
    // eslint-disable-next-line
  }, [currentStep]);

  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Ajoute ces fonctions utilitaires dans le composant
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

  // Ajoute cette fonction utilitaire dans le composant Extractor
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

  // Fonction pour lancer FoxPro
  const launchFoxPro = async () => {
    try {
      const response = await fetch('http://localhost:8000/launch-foxpro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('FoxPro lancé avec succès ! Le formulaire devrait s\'ouvrir.');
      } else {
        alert('Erreur: ' + result.message);
      }
    } catch (error) {
      console.error('Erreur lors du lancement de FoxPro:', error);
      alert('Erreur lors du lancement de FoxPro');
    }
  };

  // Ajoute l'état pour stocker l'aperçu OCR par champ
  const [ocrPreviewFields, setOcrPreviewFields] = useState({});

  // Ajoute un état pour le template sélectionné lors de l'extraction
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Ajoute un nouvel état pour la modale de sélection de modèle
  const [showModelSelectModal, setShowModelSelectModal] = useState(false);
  const [pendingExtractIndex, setPendingExtractIndex] = useState(null);
  const [modalSelectedTemplateId, setModalSelectedTemplateId] = useState("");

  // Déplace le menu déroulant et le bouton d'extraction dans une modale
  // Ajoute ce bloc juste avant le return principal
  const renderModelSelectModal = () => {
    if (!showModelSelectModal) return null;
    return createPortal(
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
                setSelectedTemplateId(modalSelectedTemplateId);
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
    );
  };

  // Ajoute ce useEffect pour afficher la modale dès l'arrivée sur l'étape d'extraction
  useEffect(() => {
    if (currentStep === "extract" && extractionState.filePreviews.length > 0) {
      // Afficher la modale seulement si on est en mode "different"
      if (extractionState.processingMode === "different") {
        setPendingExtractIndex(0);
        setShowModelSelectModal(true);
        setModalSelectedTemplateId("");
      } else if (extractionState.processingMode === "same" && extractionState.selectedModel) {
        // En mode "same", extraire directement avec le modèle sélectionné
        extractCurrentPdf(extractionState.selectedModel, 0);
      }
    }
    // eslint-disable-next-line
  }, [currentStep]);

  // Ajoute l'état pour le mode dessin extraction
  const [extractDrawState, setExtractDrawState] = useState({
    isDrawing: false,
    fieldKey: null,
    start: null,
    rect: null,
  });

  // Ajoute la gestion du dessin extraction sur le canvas d'extraction
  const handleExtractCanvasMouseDown = useCallback(
    (event) => {
      if (!extractDrawState.isDrawing) return;
      const canvas = extractCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left);
      const y = (event.clientY - rect.top);
      setExtractDrawState((prev) => ({
        ...prev,
        start: { x, y },
        rect: null,
      }));
    },
    [extractDrawState.isDrawing]
  );

  const handleExtractCanvasMouseMove = useCallback(
    (event) => {
      if (extractDrawState.isDrawing && extractDrawState.start) {
        const canvas = extractCanvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left);
        const y = (event.clientY - rect.top);
        const left = Math.min(extractDrawState.start.x, x);
        const top = Math.min(extractDrawState.start.y, y);
        const width = Math.abs(x - extractDrawState.start.x);
        const height = Math.abs(y - extractDrawState.start.y);
        setExtractDrawState((prev) => ({
          ...prev,
          rect: { left, top, width, height },
        }));
      }
    },
    [extractDrawState]
  );

  const handleExtractCanvasMouseUp = useCallback(
    async (event) => {
      if (
        extractDrawState.isDrawing &&
        extractDrawState.start &&
        extractDrawState.rect
      ) {
        const rect = extractDrawState.rect;
        // Récupère la taille réelle de l'image
        const img = previewImageRef.current;
        if (!img) return;
        const canvas = extractCanvasRef.current;
        if (!canvas) return;
        const canvasRect = canvas.getBoundingClientRect();
        // Calcule le ratio entre le canvas et l'image réelle
        const scaleX = img.naturalWidth / canvas.width;
        const scaleY = img.naturalHeight / canvas.height;
        // Convertit les coordonnées du rectangle en coordonnées réelles de l'image
        const realRect = {
          left: rect.left * scaleX,
          top: rect.top * scaleY,
          width: rect.width * scaleX,
          height: rect.height * scaleY,
        };
        // On récupère l'image affichée (base64)
        const base64 = extractionState.filePreviews[extractionState.currentPdfIndex];
        // Appel OCR preview
        try {
          const result = await ocrPreviewManual(realRect, base64);
          if (result.success) {
            setExtractionState((prev) => {
              const newExtracted = [...prev.extractedDataList];
              newExtracted[prev.currentPdfIndex] = {
                ...newExtracted[prev.currentPdfIndex],
                [extractDrawState.fieldKey]: result.text,
              };
              return { ...prev, extractedDataList: newExtracted };
            });
            showNotification(`Texte extrait: ${result.text}`, "success");
          } else {
            showNotification("Erreur OCR: " + result.text, "error");
          }
        } catch (e) {
          showNotification("Erreur lors de l'extraction OCR", "error");
        }
        setExtractDrawState({ isDrawing: false, fieldKey: null, start: null, rect: null });
      }
    },
    [extractDrawState, extractionState.filePreviews, extractionState.currentPdfIndex]
  );

  // Ajoute les listeners sur l'image d'extraction
  useEffect(() => {
    const img = previewImageRef.current;
    if (!img) return;
    if (!extractDrawState.isDrawing) return;
    img.addEventListener("mousedown", handleExtractCanvasMouseDown);
    img.addEventListener("mousemove", handleExtractCanvasMouseMove);
    img.addEventListener("mouseup", handleExtractCanvasMouseUp);
    return () => {
      img.removeEventListener("mousedown", handleExtractCanvasMouseDown);
      img.removeEventListener("mousemove", handleExtractCanvasMouseMove);
      img.removeEventListener("mouseup", handleExtractCanvasMouseUp);
    };
  }, [extractDrawState.isDrawing, handleExtractCanvasMouseDown, handleExtractCanvasMouseMove, handleExtractCanvasMouseUp]);

  // 3. Redessine le canvas d'extraction à chaque changement de rectangle ou d'image
  useEffect(() => {
    const canvas = extractCanvasRef.current;
    const img = previewImageRef.current;
    if (!canvas || !img) return;
    // Ajuste la taille du canvas à celle de l'image affichée
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Affiche le rectangle de sélection si en cours
    if (extractDrawState.isDrawing && extractDrawState.rect) {
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      const { left, top, width, height } = extractDrawState.rect;
      ctx.strokeRect(left, top, width, height);
      ctx.fillStyle = 'rgba(251,191,36,0.15)';
      ctx.fillRect(left, top, width, height);
      ctx.restore();
    }
  }, [extractDrawState, extractionState.currentPdfIndex, extractionState.filePreviews]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 w-full">
      <header className="relative bg-white/10 backdrop-blur-lg border-b border-white/20 py-2 w-full">
        <div className="px-6 py-2 w-full">
          <div className="text-center mb-2">
            <h1 className="text-3xl font-bold text-white mb-2">
              {currentStep === "setup"
                ? "Configuration Comptable"
                : currentStep === "extract"
                ? "Extraction de Factures"
                : "Configuration des Mappings"}
            </h1>
          </div>

          <div className="flex justify-center items-center gap-4">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
                currentStep === "setup"
                  ? "bg-white text-indigo-600"
                  : "text-white/70 hover:text-white"
              }`}
              onClick={() => setCurrentStep("setup")}
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">1. Préparation</span>
            </div>
            <ArrowRight className="w-4 h-4 text-white/50" />
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
                currentStep === "extract"
                  ? "bg-white text-indigo-600"
                  : "text-white/70 hover:text-white"
              }`}
              onClick={() => setCurrentStep("extract")}
            >
              <Search className="w-4 h-4" />
              <span className="font-medium">2. Extraction</span>
            </div>
            <ArrowRight className="w-4 h-4 text-white/50" />
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
                currentStep === "dataprep"
                  ? "bg-white text-indigo-600"
                  : "text-white/70 hover:text-white"
              }`}
              onClick={() => setCurrentStep("dataprep")}
            >
              <ZoomIn className="w-4 h-4" />
              <span className="font-medium">3. Paramétrage</span>
            </div>
          </div>
        </div>
      </header>

      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`flex items-center gap-3 px-6 py-4 rounded-xl backdrop-blur-lg border shadow-lg transform transition-all duration-300 animate-in slide-in-from-right ${
              notification.type === "success"
                ? "bg-green-500/20 border-green-400/30 text-green-100"
                : notification.type === "error"
                ? "bg-red-500/20 border-red-400/30 text-red-100"
                : "bg-blue-500/20 border-blue-400/30 text-blue-100"
            }`}
          >
            {notification.type === "success" && (
              <CheckCircle className="w-5 h-5" />
            )}
            {notification.type === "error" && (
              <AlertCircle className="w-5 h-5" />
            )}
            {notification.type === "info" && <FileText className="w-5 h-5" />}
            <span className="font-medium">{notification.message}</span>
          </div>
        ))}
      </div>

      <main className="w-full px-4 py-6">
        <>
          {currentStep === "setup" && (
            <div className="max-w-6xl mx-auto">
              <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8">
                <div className="max-w-4xl mx-auto">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                      <Receipt className="w-6 h-6" />
                      1. Type de facture
                    </h2>
                    <div className="grid md:grid-cols-2 gap-4">
                      <button
                        onClick={() =>
                          setSetupState((prev) => ({
                            ...prev,
                            invoiceType: "achat",
                          }))
                        }
                        className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                          setupState.invoiceType === "achat"
                            ? "border-blue-400 bg-blue-500/20 text-white shadow-lg scale-105"
                            : "border-white/30 bg-white/10 text-blue-100 hover:border-white/50"
                        }`}
                      >
                        <ShoppingCart className="w-12 h-12 mx-auto mb-3" />
                        <h3 className="text-xl font-semibold mb-2">
                          Facture d'Achat
                        </h3>
                        <p className="text-sm opacity-80">
                          Factures reçues de vos fournisseurs
                        </p>
                      </button>

                      <button
                        onClick={() =>
                          setSetupState((prev) => ({
                            ...prev,
                            invoiceType: "vente",
                          }))
                        }
                        className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                          setupState.invoiceType === "vente"
                            ? "border-green-400 bg-green-500/20 text-white shadow-lg scale-105"
                            : "border-white/30 bg-white/10 text-blue-100 hover:border-white/50"
                        }`}
                      >
                        <Receipt className="w-12 h-12 mx-auto mb-3" />
                        <h3 className="text-xl font-semibold mb-2">
                          Facture de Vente
                        </h3>
                        <p className="text-sm opacity-80">
                          Factures émises vers vos clients
                        </p>
                      </button>
                    </div>
                  </div>

                  {setupState.invoiceType && (
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                        <Building2 className="w-6 h-6" />
                        2. Ajout d'une facture{" "}
                        {setupState.invoiceType === "achat" ? "Achat" : "Vente"}
                      </h2>

                      <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                        <div className="space-y-4">
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleSingleDataPrepUpload}
                            className="hidden"
                            id="single-dataprep-upload"
                          />
                          <label
                            htmlFor="single-dataprep-upload"
                            className="w-full p-6 border-2 border-dashed border-blue-400/50 rounded-xl text-blue-200 hover:border-blue-400 hover:text-white hover:bg-blue-500/10 transition-all flex items-center justify-center gap-3 bg-blue-500/5 cursor-pointer"
                          >
                            <Plus className="w-6 h-6" />
                            <div className="text-center">
                              <div className="font-semibold text-lg">
                                Paramétrer une nouvelle facture
                              </div>
                            </div>
                            <ArrowRight className="w-6 h-6" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {setupState.invoiceType && (
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                        <FileText className="w-6 h-6" />
                        3. Documents à traiter
                      </h2>

                      <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                        {/* Mode de traitement */}
                        <div className="mb-6">
                          <h3 className="text-white font-semibold mb-3">Mode de traitement :</h3>
                          <div className="flex flex-col sm:flex-row gap-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="radio"
                                name="processingMode"
                                value="different"
                                checked={setupState.processingMode === "different"}
                                onChange={(e) => setSetupState(prev => ({
                                  ...prev,
                                  processingMode: e.target.value,
                                  selectedModel: "" // Reset selected model
                                }))}
                                className="w-4 h-4 text-blue-600 bg-white/20 border-white/30 focus:ring-blue-500"
                              />
                              <span className="text-white">Fichiers de modèles différents</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="radio"
                                name="processingMode"
                                value="same"
                                checked={setupState.processingMode === "same"}
                                onChange={(e) => setSetupState(prev => ({
                                  ...prev,
                                  processingMode: e.target.value
                                }))}
                                className="w-4 h-4 text-blue-600 bg-white/20 border-white/30 focus:ring-blue-500"
                              />
                              <span className="text-white">Fichiers du même modèle</span>
                            </label>
                          </div>
                        </div>

                        {/* Sélection du modèle pour le mode "same" */}
                        {setupState.processingMode === "same" && (
                          <div className="mb-6">
                            <label className="block text-white font-medium mb-2">
                              Sélectionnez le modèle à utiliser :
                            </label>
                            <select
                              value={setupState.selectedModel}
                              onChange={(e) => setSetupState(prev => ({
                                ...prev,
                                selectedModel: e.target.value
                              }))}
                              className="w-full px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                            >
                              <option value="">Sélectionnez un modèle</option>
                              {Object.keys(mappings).map(tpl => (
                                <option key={tpl} value={tpl}>{tpl}</option>
                              ))}
                            </select>
                            {setupState.processingMode === "same" && !setupState.selectedModel && (
                              <p className="text-yellow-300 text-sm mt-1">
                                ⚠️ Veuillez sélectionner un modèle pour continuer
                              </p>
                            )}
                          </div>
                        )}

                        <div className="mb-6">
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            multiple
                            onChange={handleSetupFileUpload}
                            className="hidden"
                            id="setup-file-input"
                          />
                          <label
                            htmlFor="setup-file-input"
                            className="flex flex-col items-center justify-center w-full p-8 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:border-white/50 transition-colors bg-white/10"
                          >
                            <Upload className="w-12 h-12 text-blue-200 mb-4" />
                            <span className="text-white font-medium text-lg mb-2">
                              Glissez vos fichiers ici ou cliquez pour
                              sélectionner
                            </span>
                            <span className="text-blue-200 text-sm">
                              PDF, PNG, JPG acceptés • Plusieurs fichiers
                              possible
                            </span>
                          </label>
                        </div>

                        {setupState.filePreviews.length > 0 && (
                          <div>
                            <h4 className="text-white font-medium mb-3">
                              Fichiers sélectionnés (
                              {setupState.filePreviews.length} page(s))
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                              {setupState.filePreviews.map((preview) => (
                                <div
                                  key={preview.id}
                                  className="relative group"
                                >
                                  <div className="aspect-[3/4] rounded-lg overflow-hidden border border-white/30 bg-white/10">
                                    <img
                                      src={preview.preview}
                                      alt={`${preview.fileName} - Page ${preview.pageNumber}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      const index =
                                        setupState.filePreviews.findIndex(
                                          (p) => p.id === preview.id
                                        );
                                      if (index !== -1) removeFile(index);
                                    }}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                  <div
                                    className="mt-2 text-xs text-blue-200 text-center truncate px-1"
                                    title={preview.fileName}
                                  >
                                    {preview.fileName}
                                    {preview.totalPages > 1 &&
                                      ` (${preview.pageNumber}/${preview.totalPages})`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {setupState.invoiceType &&
                    setupState.filePreviews.length > 0 && (
                      <div className="text-center">
                        <button
                          onClick={() =>
                            validateSetupAndProceed({
                            ...setupState,
                            // Ensure we're using the latest state values
                            invoiceType: setupState.invoiceType,
                            selectedFiles: setupState.selectedFiles,
                              filePreviews: setupState.filePreviews,
                            })
                          }
                          disabled={isLoading}
                          className="px-8 py-4 bg-gradient-to-r from-green-500 to-blue-600 text-white font-semibold text-lg rounded-2xl hover:from-green-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-3 mx-auto shadow-lg"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-6 h-6 animate-spin" />
                              Préparation...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-6 h-6" />
                              Valider
                              <ArrowRight className="w-6 h-6" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {currentStep === "extract" && (
            <div className="max-w-7xl mx-auto">
              <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-6 relative">
                <div className="flex justify-center mb-6">
                  <button
                    onClick={backToSetup}
                    className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-2 z-10"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Retour
                  </button>
                  {/* BOUTON DE TELECHARGEMENT DBF */}
                  {/* <button
                    onClick={() => {
                      window.open(`${API_BASE_URL}/download-dbf`, "_blank");
                    }}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 z-10"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger fichier FoxPro (.dbf)
                  </button> */}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Sidebar with extracted data */}
                  <div className="lg:col-span-1">
                    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30 h-full">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Données Extraites
                      </h3>

                      {/* <div className="mb-4 p-3 bg-blue-500/20 rounded-xl">
                        <div className="text-sm text-blue-100">
                          Type:{" "}
                          <span className="font-medium">
                            {setupState.invoiceType === "achat"
                              ? "Facture d'achat"
                              : "Facture de vente"}
                          </span>
                        </div>
                      </div> */}

                      {/* Invoice Selection Modal */}
                      {invoiceSelection.isOpen &&
                        createPortal(
                        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
                          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                            <div className="p-6 border-b">
                              <h3 className="text-xl font-semibold text-gray-800">
                                Sélectionner les factures à enregistrer
                              </h3>
                              <p className="text-gray-600 text-sm mt-1">
                                  Cochez les factures que vous souhaitez
                                  enregistrer dans la base de données.
                              </p>
                            </div>
                            
                            <div className="overflow-y-auto flex-1 p-4">
                              <div className="flex items-center gap-3 p-3 border-b sticky top-0 bg-white z-10">
                                <input
                                  type="checkbox"
                                  id="select-all"
                                    checked={
                                      invoiceSelection.selectedInvoices
                                        .length ===
                                      extractionState.extractedDataList.length
                                    }
                                    onChange={(e) =>
                                      toggleSelectAllInvoices(e.target.checked)
                                    }
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                  <label
                                    htmlFor="select-all"
                                    className="text-sm font-medium text-gray-700"
                                  >
                                  Sélectionner tout
                                </label>
                              </div>
                              
                              <div className="divide-y">
                                  {extractionState.extractedDataList.map(
                                    (data, index) => (
                                      <div
                                        key={index}
                                        className="p-3 hover:bg-gray-50 flex items-center gap-3"
                                      >
                                    <input
                                      type="checkbox"
                                      id={`invoice-${index}`}
                                          checked={invoiceSelection.selectedInvoices.includes(
                                            index
                                          )}
                                          onChange={() =>
                                            toggleInvoiceSelection(index)
                                          }
                                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900 truncate">
                                            {data.fournisseur ||
                                              `Facture ${index + 1}`}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                            {data.numeroFacture &&
                                              `N°${data.numeroFacture} • `}
                                      </div>
                                    </div>
                                  </div>
                                    )
                                  )}
                              </div>
                            </div>
                            
                            <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                              <button
                                  onClick={() =>
                                    setInvoiceSelection((prev) => ({
                                      ...prev,
                                      isOpen: false,
                                    }))
                                  }
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                              >
                                Annuler
                              </button>
                              <button
                                onClick={handleSaveInvoices}
                                  disabled={
                                    invoiceSelection.selectedInvoices.length ===
                                      0 || invoiceSelection.isSaving
                                  }
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                {invoiceSelection.isSaving ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Enregistrement...
                                  </>
                                ) : (
                                  <>
                                    <Save className="w-4 h-4" />
                                      Enregistrer (
                                      {invoiceSelection.selectedInvoices.length}
                                      )
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}

                      {/* <div className="mt-4">
                        <h4 className="text-sm font-medium text-white mb-2">
                          Données extraites:
                        </h4>
                      </div> */}

                      {/* Indicateur de mode de traitement */}
                      {/* <div className="mb-4 p-3 bg-white/10 rounded-xl border border-white/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Settings className="w-4 h-4 text-blue-200" />
                          <span className="text-sm font-medium text-blue-100">Mode de traitement</span>
                        </div>
                        <div className="text-xs text-white">
                          {extractionState.processingMode === "same" ? (
                            <>
                              <span className="text-green-300">✓ Mode "Même modèle"</span>
                              {extractionState.selectedModel && (
                                <span className="block text-green-200 mt-1">
                                  Modèle sélectionné : <b>{extractionState.selectedModel}</b>
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-yellow-300">⚠ Mode "Modèles différents"</span>
                              <span className="block text-blue-200 mt-1">
                                Sélectionnez un modèle pour chaque fichier
                              </span>
                            </>
                          )}
                        </div>
                      </div> */}

                      {/* Sélection du modèle seulement en mode "different" */}
                      {extractionState.processingMode === "different" && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-blue-100 mb-2">
                            Modèle de facture (template) à utiliser pour l'extraction
                          </label>
                          <select
                            value={selectedTemplateId}
                            onChange={e => setSelectedTemplateId(e.target.value)}
                            className="w-full px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          >
                            <option value="">Sélectionnez un modèle</option>
                            {Object.keys(mappings).map(tpl => (
                              <option key={tpl} value={tpl}>{tpl}</option>
                            ))}
                          </select>
                          {selectedTemplateId && (
                            <div className="text-xs text-green-200 mt-1">Modèle utilisé : <b>{selectedTemplateId}</b></div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={extractAllPdfs}
                        disabled={
                          extractionState.isProcessing || 
                          (extractionState.processingMode === "different" && !selectedTemplateId) ||
                          (extractionState.processingMode === "same" && !extractionState.selectedModel)
                        }
                        className="w-full mb-4 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2"
                      >
                        {extractionState.isProcessing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Extraction en cours...
                          </>
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            Extraire toutes les pages
                            {extractionState.processingMode === "same" && extractionState.selectedModel && (
                              <span className="text-xs opacity-75"> (Modèle: {extractionState.selectedModel})</span>
                            )}
                          </>
                        )}
                      </button>

                      <div className="space-y-3">
                        {EXTRACTION_FIELDS.map((field) => (
                          <div key={field.key}>
                            <label className="block text-sm font-medium text-blue-100 mb-1">
                              {field.label}
                            </label>
                            <div className="flex gap-2 items-center">
                              <input
                                type="text"
                                value={filterValue(
                                  extractionState.extractedDataList[
                                    extractionState.currentPdfIndex
                                  ]?.[field.key],
                                  field.key
                                )}
                                onChange={(e) =>
                                  setExtractionState((prev) => ({
                                    ...prev,
                                    extractedDataList:
                                      prev.extractedDataList.map(
                                      (data, index) =>
                                        index === prev.currentPdfIndex
                                          ? {
                                              ...data,
                                              [field.key]: e.target.value,
                                            }
                                          : data
                                    ),
                                  }))
                                }
                                className="flex-1 px-3 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                                placeholder={`${field.label} sera extrait automatiquement`}
                              />
                              {/* Bouton d'icône pour activer/désactiver le mode dessin extraction */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (extractDrawState.isDrawing && extractDrawState.fieldKey === field.key) {
                                    setExtractDrawState({ isDrawing: false, fieldKey: null, start: null, rect: null });
                                  } else {
                                    setExtractDrawState({ isDrawing: true, fieldKey: field.key, start: null, rect: null });
                                    showNotification(`Mode dessin extraction activé pour \"${field.label}\". Dessinez un rectangle sur l'image.`, "info");
                                  }
                                }}
                                className={`p-2 rounded-full border-2 transition-colors duration-200 ${extractDrawState.isDrawing && extractDrawState.fieldKey === field.key ? 'border-yellow-400 bg-yellow-500/20 text-yellow-100' : 'border-white/30 bg-white/10 text-blue-100 hover:border-blue-400'}`}
                                title={extractDrawState.isDrawing && extractDrawState.fieldKey === field.key ? 'Annuler le dessin' : 'Dessiner pour extraire'}
                              >
                                <ZoomIn className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        
                      <div className="flex flex-col gap-3 mb-4">
                      <button
                        onClick={openSaveModal}
                            disabled={
                              extractionState.extractedDataList.length === 0
                            }
                        className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        Enregistrer les factures
                      </button>
                      
                      <button
                        onClick={launchFoxPro}
                        disabled={
                          extractionState.extractedDataList.length === 0
                        }
                        className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Database className="w-4 h-4" />
                        Enregistrer dans FoxPro
                      </button>
                    </div>
                      </div>
                    </div>
                  </div>

                  {/* Main document preview area */}
                  <div className="lg:col-span-2">
                    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Eye className="w-5 h-5" />
                          Aperçu des Documents
                        </h3>
                        {extractionState.filePreviews.length > 0 && (
                          <div className="text-sm text-blue-200">
                            {extractionState.currentPdfIndex + 1} /{" "}
                            {extractionState.filePreviews.length}
                          </div>
                        )}
                      </div>

                      {extractionState.filePreviews.length > 0 ? (
                        <div className="space-y-4">
                          {/* Document preview container with proper sizing */}
                          <div className="bg-white/10 rounded-xl p-4 border border-white/10">
                            <div className="w-full" style={{ height: "70vh" }}>
                              <div className="w-full h-full overflow-auto bg-white rounded-lg shadow-lg p-4">
                                <div style={{ position: 'relative', width: '100%', height: 'auto' }}>
                                  <img
                                    ref={previewImageRef}
                                    src={
                                      extractionState.filePreviews[
                                        extractionState.currentPdfIndex
                                      ]
                                    }
                                    alt="Aperçu du document"
                                    className="w-full h-auto object-contain"
                                    style={{ minWidth: "100%", height: "auto" }}
                                  />
                                  {/* Canvas de dessin extraction superposé */}
                                  <canvas
                                    ref={extractCanvasRef}
                                    style={{
                                      position: 'absolute',
                                      left: 0,
                                      top: 0,
                                      width: '100%',
                                      height: '100%',
                                      pointerEvents: extractDrawState.isDrawing ? 'auto' : 'none',
                                      zIndex: 10,
                                      cursor: extractDrawState.isDrawing ? 'crosshair' : 'default',
                                    }}
                                    onMouseDown={handleExtractCanvasMouseDown}
                                    onMouseMove={handleExtractCanvasMouseMove}
                                    onMouseUp={handleExtractCanvasMouseUp}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 text-center">
                              <div className="text-white font-medium">
                                {
                                  extractionState.previewDimensions[
                                    extractionState.currentPdfIndex
                                  ]?.fileName
                                }
                              </div>
                              {extractionState.previewDimensions[
                                extractionState.currentPdfIndex
                              ]?.totalPages > 1 && (
                                <div className="text-blue-200 text-sm">
                                  Page{" "}
                                  {
                                    extractionState.previewDimensions[
                                      extractionState.currentPdfIndex
                                    ]?.pageNumber
                                  }{" "}
                                  sur{" "}
                                  {
                                    extractionState.previewDimensions[
                                      extractionState.currentPdfIndex
                                    ]?.totalPages
                                  }
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Navigation controls */}
                          {extractionState.filePreviews.length > 1 && (
                            <div className="bg-white/10 rounded-xl p-4 border border-white/10">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={goToPrevPdf}
                                  disabled={
                                    extractionState.currentPdfIndex === 0
                                  }
                                  className="p-2 bg-white/20 rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                >
                                  <ChevronLeft className="w-5 h-5 text-white" />
                                </button>
                                <div className="flex-1 overflow-x-auto">
                                  <div className="flex gap-2 pb-2">
                                    {extractionState.filePreviews.map(
                                      (preview, index) => {
                                        const fileName =
                                          extractionState.previewDimensions?.[
                                            index
                                          ]?.fileName || "";
                                        const extractionData =
                                          extractionState.extractedDataList[
                                            index
                                          ];
                                        const extractionOk =
                                          isExtractionComplete(extractionData);
                                        const showBadge =
                                          extractionData &&
                                          Object.keys(extractionData).length >
                                            0 &&
                                          !extractionOk;
                                        // Log pour diagnostic
                                        console.log(
                                          "ExtractionData (page",
                                          index + 1,
                                          "):",
                                          extractionData
                                        );
                                        return (
                                        <div
                                          key={index}
                                            className={`relative group transition-all duration-300`}
                                            onMouseEnter={() =>
                                              setHoveredIndex(index)
                                            }
                                            onMouseLeave={() =>
                                              setHoveredIndex(null)
                                            }
                                            style={{
                                              zIndex:
                                                hoveredIndex === index ? 2 : 1,
                                            }}
                                          >
                                            <div
                                              onClick={() => {
                                                if (extractionState.isProcessing) {
                                                  showNotification("Veuillez attendre la fin de l'extraction en cours.", "warning");
                                                  return;
                                                }
                                                scrollToIndex(index);
                                              }}
                                              className={
                                                `relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-300 ` +
                                                (index ===
                                                extractionState.currentPdfIndex
                                                  ? "border-blue-400 shadow-lg ring-2 ring-blue-400/50"
                                                  : "border-white/30 hover:border-blue-400")
                                              }
                                              style={{
                                                width:
                                                  hoveredIndex === index
                                                    ? 200
                                                    : 96,
                                                height:
                                                  hoveredIndex === index
                                                    ? 200
                                                    : 135,
                                                boxShadow:
                                                  hoveredIndex === index
                                                    ? "0 8px 32px rgba(0,0,0,0.25)"
                                                    : undefined,
                                                transform:
                                                  hoveredIndex === index
                                                    ? "scale(1.1)"
                                                    : "scale(1)",
                                                borderWidth:
                                                  hoveredIndex === index
                                                    ? 4
                                                    : 2,
                                                borderColor:
                                                  hoveredIndex === index
                                                    ? "#3b82f6"
                                                    : undefined,
                                              }}
                                            >
                                              <img
                                                src={preview}
                                                alt={`Page ${index + 1}`}
                                                className="w-full h-full object-contain bg-white"
                                              />
                                              {/* Badge d'avertissement si extraction incomplète */}
                                              {showBadge && (
                                                <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded shadow z-30 flex items-center gap-1">
                                                  <span>⚠️ Non paramétré</span>
                                                </div>
                                              )}
                                              {index ===
                                                extractionState.currentPdfIndex && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border border-white"></div>
                                              )}
                                              {extractionState
                                                .extractedDataList[index] && (
                                                <>
                                                  <div 
                                                    className="absolute top-1 left-1 text-xs font-bold px-1 rounded"
                                                    style={{
                                                      backgroundColor: `rgba(${
                                                        255 *
                                                        (1 -
                                                          Object.keys(
                                                            extractionState
                                                              .extractedDataList[
                                                              index
                                                            ] || {}
                                                          ).length /
                                                            6)
                                                      }, ${
                                                        255 *
                                                        (Object.keys(
                                                          extractionState
                                                            .extractedDataList[
                                                            index
                                                          ] || {}
                                                        ).length /
                                                          6)
                                                      }, 0, 0.9)`,
                                                      color: "white",
                                                      textShadow:
                                                        "0 0 2px rgba(0,0,0,0.5)",
                                                    }}
                                                  >
                                                    {
                                                      Object.keys(
                                                        extractionState
                                                          .extractedDataList[
                                                          index
                                                        ] || {}
                                                      ).length
                                                    }
                                                  </div>
                                                  {extractionState
                                                    .confidenceScores?.[
                                                    index
                                                  ] &&
                                                    Object.keys(
                                                      extractionState
                                                        .confidenceScores[
                                                        index
                                                      ] || {}
                                                    ).length > 0 && (
                                                    <div 
                                                      className="absolute bottom-1 right-1 text-[10px] font-bold px-1 rounded"
                                                      style={{
                                                          backgroundColor:
                                                            "rgba(0, 0, 0, 0.7)",
                                                          color: "white",
                                                          textShadow:
                                                            "0 0 2px rgba(0,0,0,0.5)",
                                                      }}
                                                    >
                                                      {Math.min(
                                                          ...Object.values(
                                                            extractionState
                                                              .confidenceScores[
                                                              index
                                                            ] || {}
                                                          )
                                                            .filter(
                                                              (score) =>
                                                                typeof score ===
                                                                "number"
                                                            )
                                                            .map(
                                                              (score) =>
                                                                Math.round(
                                                                  score * 100
                                                                ) / 100
                                                            )
                                                        )
                                                          .toFixed(2)
                                                          .replace("0.", "")}
                                                        %
                                                    </div>
                                                  )}
                                                </>
                                              )}
                                              {/* Cancel button (X) - appears on hover */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  removeFileFromExtraction(
                                                    index
                                                  );
                                                }}
                                                className={`absolute ${
                                                  hoveredIndex === index
                                                    ? "top-2 right-2 w-10 h-10"
                                                    : "-top-2 -right-2 w-5 h-5"
                                                } bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-600`}
                                                style={{
                                                  fontSize:
                                                    hoveredIndex === index
                                                      ? 24
                                                      : 14,
                                                }}
                                                title="Supprimer ce fichier"
                                              >
                                                <X
                                                  className={
                                                    hoveredIndex === index
                                                      ? "w-6 h-6"
                                                      : "w-3 h-3"
                                                  }
                                                />
                                              </button>
                                              {/* Bouton pour paramétrer si extraction incomplète */}
                                              {showBadge && (
                                                <button
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setCurrentStep("dataprep");
                                                    setIsLoading(true);
                                                    // Envoie l'image base64 de la page affichée
                                                    const res = await fetch(
                                                      preview
                                                    );
                                                    const blob =
                                                      await res.blob();
                                                    const formData =
                                                      new FormData();
                                                    formData.append(
                                                      "file",
                                                      blob,
                                                      fileName || "page.png"
                                                    );
                                                    try {
                                                      const response =
                                                        await fetch(
                                                          `${API_BASE_URL}/upload-for-dataprep`,
                                                          {
                                                            method: "POST",
                                                            body: formData,
                                                          }
                                                        );
                                                      const result =
                                                        await response.json();
                                                      if (result.success) {
                                                        const imageToUse =
                                                          result.unwarped_image ||
                                                          result.image;
                                                        const widthToUse =
                                                          result.unwarped_width ||
                                                          result.width;
                                                        const heightToUse =
                                                          result.unwarped_height ||
                                                          result.height;
                                                        setDataPrepState(
                                                          (prev) => ({
                                                            ...prev,
                                                            uploadedImage:
                                                              imageToUse,
                                                            fileName: fileName,
                                                            filePreview:
                                                              imageToUse,
                                                            imageDimensions: {
                                                              width: widthToUse,
                                                              height:
                                                                heightToUse,
                                                            },
                                                            ocrBoxes:
                                                              result.boxes ||
                                                              [],
                                                            fieldMappings: {},
                                                            selectedBoxes: {},
                                                          })
                                                        );
                                                      }
                                                    } catch (error) {
                                                      // Optionnel : notification d'erreur
                                                    } finally {
                                                      setIsLoading(false);
                                                    }
                                                  }}
                                                  className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-white text-xs font-bold px-3 py-1 rounded shadow z-30 hover:bg-yellow-600 transition-colors"
                                                >
                                                  Paramétrer ce fichier
                                                </button>
                                              )}
                                              </div>
                                            </div>
                                        );
                                      }
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={goToNextPdf}
                                  disabled={
                                    extractionState.currentPdfIndex ===
                                    extractionState.filePreviews.length - 1
                                  }
                                  className="p-2 bg-white/20 rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                >
                                  <ChevronRight className="w-5 h-5 text-white" />
                                </button>
                              </div>
                              <div className="text-center mt-3">
                                <span className="text-blue-200 text-sm">
                                  {extractionState.currentPdfIndex + 1} /{" "}
                                  {extractionState.filePreviews.length} pages
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/30 rounded-xl">
                          <FileText className="w-12 h-12 text-blue-200 mb-4" />
                          <p className="text-blue-100">
                            Aucun document à afficher
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === "dataprep" && (
            <div className="max-w-7xl mx-auto">
              <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-6 relative">
                <div className="flex justify-center gap-4 mb-6">
                  <button
                    onClick={() => setCurrentStep("setup")}
                    className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-2 z-10"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Retour
                  </button>
                  <label className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 z-10 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Nouveau fichier
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={handleSingleDataPrepUpload}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Fields panel */}
                  <div className="lg:col-span-1">
                    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30 h-full">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Champs à mapper
                      </h3>
                      {dataPrepState.isSelecting && (
                        <div className="mb-4 p-3 bg-blue-500/20 border border-blue-400/30 rounded-xl">
                          <p className="text-blue-100 text-sm font-medium">
                            🎯 Mode sélection actif pour:{" "}
                            <strong>{dataPrepState.selectedField}</strong>
                          </p>
                          <p className="text-blue-200 text-xs mt-1">
                            Cliquez sur une boîte OCR rouge dans l'image
                          </p>
                          <button
                            onClick={() =>
                              setDataPrepState((prev) => ({
                                ...prev,
                                isSelecting: false,
                                selectedField: null,
                                ocrPreview: "Sélection annulée",
                              }))
                            }
                            className="mt-2 px-3 py-1 bg-red-500/20 border border-red-400/30 text-red-100 rounded text-xs hover:bg-red-500/30 transition-colors"
                          >
                            Annuler la sélection
                          </button>
                        </div>
                      )}

                      {manualDrawState.isDrawing && (
                        <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-400/30 rounded-xl">
                          <p className="text-yellow-100 text-sm font-medium">
                            ✏️ Mode dessin actif pour:{" "}
                            <strong>{manualDrawState.fieldKey}</strong>
                          </p>
                          <p className="text-yellow-200 text-xs mt-1">
                            Dessinez un rectangle sur la zone à extraire
                          </p>
                          <button
                            onClick={() =>
                              setManualDrawState({
                                isDrawing: false,
                                fieldKey: null,
                                start: null,
                                rect: null,
                              })
                            }
                            className="mt-2 px-3 py-1 bg-red-500/20 border border-red-400/30 text-red-100 rounded text-xs hover:bg-red-500/30 transition-colors"
                          >
                            Annuler le dessin
                          </button>
                        </div>
                      )}

                      <div className="space-y-3">
                        {EXTRACTION_FIELDS.map((field) => {
                          const rect = manualDrawState.isDrawing && manualDrawState.fieldKey === field.key && manualDrawState.rect ? manualDrawState.rect : null;
                          return (
                          <div
                            key={field.key}
                            className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 transition-all hover:bg-white/20"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-sm font-medium text-blue-100">
                                {field.label}
                              </label>
                              {dataPrepState.selectedBoxes[field.key] && (
                                <div className="text-xs text-green-200 font-mono bg-green-500/20 px-2 py-1 rounded">
                                  Mappé
                                </div>
                              )}
                            </div>
                            {dataPrepState.selectedBoxes[field.key] && (
                              <div className="text-xs text-white bg-white/20 p-2 rounded mb-2 font-mono">
                                "
                                {filterValue(
                                  dataPrepState.selectedBoxes[field.key].text,
                                  field.key
                                )}
                                "
                              </div>
                            )}
                              {/* Affiche le texte OCR extrait si disponible */}
                              {ocrPreviewFields[field.key] && (
                                <div className="text-xs text-green-200 mt-1">
                                  <span className="font-bold">Texte extrait :</span> {ocrPreviewFields[field.key]}
                                </div>
                              )}
                              {/* Affiche la taille de la zone en cours de sélection */}
                              {rect && (
                                <div className="text-xs text-blue-200 mt-1">
                                  Zone sélectionnée : {Math.round(rect.width)}×{Math.round(rect.height)} px
                                </div>
                              )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => startFieldSelection(field.key)}
                                disabled={
                                  dataPrepState.isSelecting ||
                                  !dataPrepState.uploadedImage ||
                                  dataPrepState.ocrBoxes.length === 0
                                }
                                className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors ${
                                  dataPrepState.selectedBoxes[field.key]
                                    ? "bg-green-500/20 border border-green-400/30 text-green-100"
                                    : "bg-blue-500/20 border border-blue-400/30 text-blue-100"
                                } hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {dataPrepState.selectedBoxes[field.key]
                                  ? "Changer"
                                  : "Sélectionner"}
                              </button>
                              <button
                                onClick={() => startManualDraw(field.key)}
                                disabled={
                                  manualDrawState.isDrawing ||
                                  !dataPrepState.uploadedImage
                                }
                                className="flex-1 px-3 py-2 text-xs rounded-lg bg-yellow-500/20 border border-yellow-400/30 text-yellow-100 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {dataPrepState.fieldMappings[field.key]?.manual
                                  ? "Redessiner"
                                  : "Dessiner"}
                              </button>
                            </div>
                            {dataPrepState.fieldMappings[field.key]?.manual && (
                              <div className="text-xs text-yellow-400 text-center mt-2 bg-yellow-500/20 py-1 rounded">
                                [Manuel]
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={saveMappings}
                        disabled={
                          isLoading ||
                          Object.keys(dataPrepState.selectedBoxes).length === 0
                        }
                        className="w-full mt-6 px-4 py-3 bg-gradient-to-r from-green-500 to-blue-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Sauvegarde...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            Sauvegarder le mapping
                          </>
                        )}
                      </button>

                      {Object.keys(mappings).length > 0 && (
                        <div className="mt-6 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                          <h4 className="text-base font-semibold text-white mb-3">
                            Mappings existants
                          </h4>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {Object.keys(mappings).map((key) => (
                              <div
                                key={key}
                                className="text-xs text-blue-200 bg-white/10 rounded-lg p-2 flex items-center justify-between"
                              >
                                <span className="font-mono">{key}</span>
                                <button
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(
                                        `${API_BASE_URL}/mappings/${key}`,
                                        {
                                          method: "DELETE",
                                        }
                                      );
                                      if (response.ok) {
                                        showNotification(
                                          `Mapping ${key} supprimé`,
                                          "success"
                                        );
                                        loadExistingMappings();
                                      }
                                    } catch (error) {
                                      showNotification(
                                        "Erreur lors de la suppression",
                                        "error"
                                      );
                                    }
                                  }}
                                  className="p-1 text-red-300 hover:text-red-100 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Canvas/document area */}
                  <div className="lg:col-span-2">
                    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Eye className="w-5 h-5" />
                          Aperçu du Document
                        </h3>
                        <div className="flex items-center gap-3">
                          {dataPrepState.ocrBoxes.length > 0 && (
                            <div className="text-sm text-blue-200 bg-blue-500/20 px-3 py-1 rounded-lg">
                              {dataPrepState.ocrBoxes.length} boîtes OCR
                            </div>
                          )}
                          {dataPrepState.uploadedImage && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleZoomChange(0.8)}
                                className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                              >
                                <ZoomOut className="w-4 h-4 text-white" />
                              </button>
                              <span className="text-white text-sm px-2">
                                {Math.round(dataPrepState.currentZoom * 100)}%
                              </span>
                              <button
                                onClick={() => handleZoomChange(1.25)}
                                className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                              >
                                <ZoomIn className="w-4 h-4 text-white" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {dataPrepState.uploadedImage ? (
                        <div className="bg-white/10 rounded-xl p-4 border border-white/10">
                          <div
                            className="w-full overflow-auto"
                            style={{ maxHeight: "70vh" }}
                          >
                            <div className="bg-white rounded p-2 min-w-max">
                              <canvas
                                ref={canvasRef}
                                onMouseDown={handleCanvasMouseDown}
                                onMouseMove={handleCanvasMouseMove}
                                onMouseUp={handleCanvasMouseUp}
                                className={`cursor-${
                                  dataPrepState.isSelecting
                                    ? "pointer"
                                    : manualDrawState.isDrawing
                                    ? "crosshair"
                                    : "default"
                                } border border-gray-300 rounded`}
                                style={{
                                  width:
                                    dataPrepState.imageDimensions.width *
                                    dataPrepState.currentZoom,
                                  height:
                                    dataPrepState.imageDimensions.height *
                                    dataPrepState.currentZoom,
                                  backgroundColor: "white",
                                  display: "block",
                                }}
                              />
                              <img
                                ref={imageRef}
                                src={dataPrepState.uploadedImage}
                                alt="Document de référence"
                                className="hidden"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-64 border-2 border-dashed border-white/30 rounded-xl">
                          <FileText className="w-12 h-12 text-blue-200 mb-4" />
                          <p className="text-blue-100">
                            {" "}
                            Fichier en cours de traitement ...
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      </main>
      {renderModelSelectModal()}
      {extractDrawState.isDrawing && extractDrawState.rect && (
        <div
          style={{
            position: 'absolute',
            left: extractDrawState.rect.left,
            top: extractDrawState.rect.top,
            width: extractDrawState.rect.width,
            height: extractDrawState.rect.height,
            border: '2px dashed #fbbf24',
            background: 'rgba(251,191,36,0.15)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
};

export default Extractor;

// Helper to compute zoom so image fits container (default 900px width) g
const getDefaultZoom = (imgWidth, containerWidth = 900) => {
  if (!imgWidth) return 1;
  return Math.min(1, containerWidth / imgWidth);
};
