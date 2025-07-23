import React, { useState, useEffect, useRef, useCallback } from "react";
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
  });

  const [extractionState, setExtractionState] = useState({
    uploadedFiles: [],
    filePreviews: [],
    previewDimensions: [],
    currentPdfIndex: 0,
    extractedDataList: [],
    isProcessing: false,
  });

  const [dataPrepState, setDataPrepState] = useState({
    uploadedImage: null,
    imageDimensions: { width: 0, height: 0 },
    currentZoom: 1.5,
    isSelecting: false,
    selectedField: null,
    fieldMappings: {},
    selectionHistory: [],
    ocrPreview: "",
    ocrBoxes: [],
    selectedBoxes: {},
  });

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const previewImageRef = useRef(null);
  const horizontalScrollRef = useRef(null);

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

      if (response.ok) {
        const data = await response.json();
        setMappings(data.mappings || {});
        showNotification(
          `${Object.keys(data.mappings || {}).length} mappings chargés`,
          "info"
        );
      }
    } catch (error) {
      console.error("Erreur lors du chargement des mappings:", error);
      showNotification("Erreur lors du chargement des mappings", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

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
        console.log("Aucune boîte OCR disponible");
        return null;
      }

      console.log(
        `Recherche de boîte à la position (${x.toFixed(2)}, ${y.toFixed(2)})`
      );

      for (const box of dataPrepState.ocrBoxes) {
        if (!box.coords) continue;

        const boxLeft = box.coords.left;
        const boxTop = box.coords.top;
        const boxRight = boxLeft + box.coords.width;
        const boxBottom = boxTop + box.coords.height;

        console.log(
          `Boîte ${box.id}: (${boxLeft.toFixed(2)}, ${boxTop.toFixed(
            2
          )}) -> (${boxRight.toFixed(2)}, ${boxBottom.toFixed(2)}) : "${
            box.text
          }"`
        );

        if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
          console.log(`✅ Boîte trouvée: ${box.id} - "${box.text}"`);
          return box;
        }
      }

      console.log("❌ Aucune boîte trouvée à cette position");
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
          console.log('Clicked box coords:', clickedBox.coords);
          
          const fieldMappingsUpdate = {
            ...dataPrepState.fieldMappings,
            [dataPrepState.selectedField]: {
              left: parseFloat(clickedBox.coords.left),
              top: parseFloat(clickedBox.coords.top),
              width: parseFloat(clickedBox.coords.width),
              height: parseFloat(clickedBox.coords.height),
              manual: false
            }
          };
          
          console.log('Updated fieldMappings:', fieldMappingsUpdate);
          
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

  const handleCanvasMouseUp = useCallback(
    (event) => {
      if (
        manualDrawState.isDrawing &&
        manualDrawState.start &&
        manualDrawState.rect
      ) {
        const fieldKey = manualDrawState.fieldKey;
        const rect = manualDrawState.rect;
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
      }
    },
    [manualDrawState]
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
    console.log('saveMappings called');
    
    if (!dataPrepState || !dataPrepState.selectedBoxes) {
      console.error('dataPrepState or selectedBoxes is undefined');
      showNotification("Erreur: État de l'application invalide", "error");
      return;
    }
    
    if (Object.keys(dataPrepState.selectedBoxes).length === 0) {
      showNotification("Veuillez sélectionner au moins un champ", "error");
      return;
    }

    setIsLoading(true);

    try {
      console.log('Getting uploaded file name...');
      let uploadedFileName = '';
      
      try {
        // Safely get the file name with multiple fallbacks
        uploadedFileName = dataPrepState.uploadedImage?.name || 
                         dataPrepState.fileName || 
                         new Date().toISOString().slice(0, 10);
        console.log('Original file name:', uploadedFileName);
        
        if (typeof uploadedFileName !== 'string') {
          console.warn('Uploaded file name is not a string, converting...');
          uploadedFileName = String(uploadedFileName);
        }
      } catch (e) {
        console.error('Error getting file name:', e);
        uploadedFileName = 'untitled';
      }
      
      console.log('Processing file name:', uploadedFileName);
      
      // Generate template ID from file name without extension
      let templateId = 'untitled';
      try {
        // Remove file extension
        let baseName = uploadedFileName.replace(/\.[^/.]+$/, '');
        // If empty after removing extension, use 'untitled'
        if (!baseName) baseName = 'untitled';
        // Sanitize the name (keep only alphanumeric, underscore, hyphen)
        templateId = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
        console.log('Generated template ID:', templateId);
      } catch (e) {
        console.error('Error generating template ID, using fallback:', e);
        templateId = `doc_${Date.now()}`; // Fallback with timestamp
      }
      
      console.log('Final template ID:', templateId);
      
      if (!dataPrepState.fieldMappings) {
        throw new Error("Aucun mappage de champ à enregistrer");
      }
      
      console.log('Sending request to server...');
      const response = await fetch(`${API_BASE_URL}/mappings`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Debug": "true"
        },
        body: JSON.stringify({
          template_id: templateId,
          field_map: dataPrepState.fieldMappings,
          timestamp: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response error:', response.status, errorText);
        throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
      }
      
      const responseData = await response.json();
      console.log('Server response:', responseData);
      
      if (response.ok) {
        showNotification(`Mappings sauvegardés avec succès pour le template ${templateId}`, "success");
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
    if (!files.length) return;

    setIsLoading(true);

    try {
      const previews = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        // Enlever les paramètres non supportés par votre backend
        // formData.append('dpi', '200');
        // formData.append('preserve_aspect_ratio', 'true');
        // formData.append('include_margins', 'true');

        // Use /upload-basic for fast preview (no OCR)
        const response = await fetch(`${API_BASE_URL}/upload-basic`, {
          method: "POST",
          body: formData,
        });
        const result = await response.json();

        if (result.success) {
          if (result.images) {
            result.images.forEach((img, index) => {
              previews.push({
                file: file,
                preview: img,
                fileName: file.name,
                pageNumber: index + 1,
                totalPages: result.images.length,
              });
            });
          } else if (result.image) {
            previews.push({
              file: file,
              preview: result.image,
              fileName: file.name,
              pageNumber: 1,
              totalPages: 1,
            });
          }
        }
      }

      setSetupState((prev) => ({
        ...prev,
        selectedFiles: files,
        filePreviews: previews,
      }));

      showNotification(
        `${files.length} fichier(s) ajouté(s) (${previews.length} page(s))`,
        "success"
      );
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

  const validateSetupAndProceed = () => {
    if (!setupState.invoiceType) {
      showNotification("Veuillez sélectionner le type de facture", "error");
      return;
    }

    if (setupState.filePreviews.length === 0) {
      showNotification("Veuillez sélectionner au moins un fichier", "error");
      return;
    }

    setExtractionState({
      uploadedFiles: setupState.selectedFiles,
      filePreviews: setupState.filePreviews.map((p) => p.preview),
      previewDimensions: setupState.filePreviews.map((p) => ({
        fileName: p.fileName,
        pageNumber: p.pageNumber,
        totalPages: p.totalPages,
      })),
      currentPdfIndex: 0,
      extractedDataList: Array(setupState.filePreviews.length).fill({}),
      isProcessing: false,
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
    }));
  };

  const scrollToIndex = (index) => {
    setExtractionState((prev) => ({ ...prev, currentPdfIndex: index }));
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
    for (let i = 0; i < extractionState.filePreviews.length; i++) {
      const base64 = extractionState.filePreviews[i];
      const res = await fetch(base64);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, `page_${i}.png`);
      try {
        const response = await fetch(`${API_BASE_URL}/extract-data`, {
          method: "POST",
          body: formData,
        });
        const result = await response.json();
        results[i] = result.data || {};
      } catch (error) {
        results[i] = {};
      }
      setExtractionState((prev) => ({
        ...prev,
        extractedDataList: [...results],
        isProcessing: i < extractionState.filePreviews.length - 1,
      }));
    }
    showNotification("Extraction terminée pour tous les fichiers", "success");
  };

  const filterValue = (val, fieldKey) => {
    if (!val) return "";
    if (fieldKey === "fournisseur") return val;
    const matches = val.match(/[0-9.,;:/\\-]+/g);
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

  // Dans la fonction handleSingleDataPrepUpload, assurez-vous que currentZoom est à 0.6 * getDefaultZoom
  const handleSingleDataPrepUpload = useCallback(
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
              onClick={() =>
                currentStep !== "setup" && setCurrentStep("extract")
              }
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
                              {setupState.filePreviews.map((preview, index) => (
                                <div key={index} className="relative group">
                                  <div className="aspect-[3/4] rounded-lg overflow-hidden border border-white/30 bg-white/10">
                                    <img
                                      src={preview.preview}
                                      alt={`${preview.fileName} - Page ${preview.pageNumber}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <button
                                    onClick={() => removeFile(index)}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                  <div className="mt-2 text-xs text-blue-200 text-center">
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
                          onClick={validateSetupAndProceed}
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
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Sidebar with extracted data */}
                  <div className="lg:col-span-1">
                    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30 h-full">
                      <h3 className="text-lg font-semibold text-white mb-4">
                        Données Extraites
                      </h3>

                      <div className="mb-4 p-3 bg-blue-500/20 rounded-xl">
                        <div className="text-sm text-blue-100">
                          Type:{" "}
                          <span className="font-medium">
                            {setupState.invoiceType === "achat"
                              ? "Facture d'achat"
                              : "Facture de vente"}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={extractAllPdfs}
                        disabled={extractionState.isProcessing}
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
                          </>
                        )}
                      </button>

                      <div className="space-y-3">
                        {EXTRACTION_FIELDS.map((field) => (
                          <div key={field.key}>
                            <label className="block text-sm font-medium text-blue-100 mb-1">
                              {field.label}
                            </label>
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
                                  extractedDataList: prev.extractedDataList.map(
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
                              className="w-full px-3 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                              placeholder={`${field.label} sera extrait automatiquement`}
                            />
                          </div>
                        ))}
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
                                <img
                                  ref={previewImageRef}
                                  src={
                                    extractionState.filePreviews[
                                      extractionState.currentPdfIndex
                                    ]
                                  }
                                  alt="Aperçu du document"
                                  className="w-full h-auto object-contain"
                                  style={{
                                    minWidth: "100%",
                                    height: "auto",
                                  }}
                                />
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
                                      (preview, index) => (
                                        <div
                                          key={index}
                                          onClick={() => scrollToIndex(index)}
                                          className="group relative"
                                        >
                                          <div
                                            className={`relative flex-shrink-0 w-16 h-20 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                                              index ===
                                              extractionState.currentPdfIndex
                                                ? "border-blue-400 shadow-lg ring-2 ring-blue-400/50"
                                                : "border-white/30 hover:border-blue-400"
                                            }`}
                                          >
                                            <img
                                              src={preview}
                                              alt={`Page ${index + 1}`}
                                              className="w-full h-full object-cover"
                                            />
                                            {index ===
                                              extractionState.currentPdfIndex && (
                                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border border-white"></div>
                                            )}
                                          </div>

                                          <div className="hidden group-hover:block fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
                                            <div className="bg-white rounded-lg shadow-2xl p-2">
                                              <img
                                                src={preview}
                                                alt={`Page ${index + 1}`}
                                                className="w-[300px] h-auto object-contain"
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      )
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
                <div className="flex justify-center mb-6">
                  <button
                    onClick={() => setCurrentStep("setup")}
                    className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-2 z-10"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Retour
                  </button>
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
                        {EXTRACTION_FIELDS.map((field) => (
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
                        ))}
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
    </div>
  );
};

export default Extractor;

// Helper to compute zoom so image fits container (default 900px width)
const getDefaultZoom = (imgWidth, containerWidth = 900) => {
  if (!imgWidth) return 1;
  return Math.min(1, containerWidth / imgWidth);
};
