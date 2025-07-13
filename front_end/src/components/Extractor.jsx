import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileText, Eye, Download, Copy, Trash2, ZoomIn, ZoomOut, RotateCcw, Settings, CheckCircle, AlertCircle, Loader2, Search, Target } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000';

const Extractor = () => {
  // États principaux
  const [activeView, setActiveView] = useState('extract');
  const [mappings, setMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // États pour l'extraction
  const [extractionState, setExtractionState] = useState({
    selectedIssuer: '',
    customIssuer: '',
    uploadedFile: null,
    filePreview: null,
    previewDimensions: { width: 0, height: 0 },
    previewZoom: 1,
    extractedData: {
      numeroFacture: '',
      tauxTVA: '',
      montantHT: '',
      montantTVA: '',
      montantTTC: ''
    },
    isProcessing: false,
    // États pour la sélection manuelle
    isManualSelecting: false,
    selectedFieldForManual: null,
    manualSelectionMode: false
  });

  // États pour DataPrep
  const [dataPrepState, setDataPrepState] = useState({
    issuerName: '',
    uploadedImage: null,
    imageDimensions: { width: 0, height: 0 },
    currentZoom: 1,
    isSelecting: false,
    selectedField: null,
    fieldMappings: {},
    selectionHistory: [],
    ocrPreview: ''
  });

  // Refs
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const previewImageRef = useRef(null);
  const extractionCanvasRef = useRef(null);
  const extractionImageRef = useRef(null);

  // États pour la sélection manuelle dans l'extraction
  const [extractionDrawingState, setExtractionDrawingState] = useState({
    isDrawing: false,
    startPos: { x: 0, y: 0 },
    currentRect: null
  });

  // Constantes
  const EXTRACTION_FIELDS = [
    { key: 'numeroFacture', label: 'Numéro de Facture', icon: '📄' },
    { key: 'tauxTVA', label: 'Taux TVA', icon: '📊' },
    { key: 'montantHT', label: 'Montant HT', icon: '💰' },
    { key: 'montantTVA', label: 'Montant TVA', icon: '📈' },
    { key: 'montantTTC', label: 'Montant TTC', icon: '💳' }
  ];

  // Système de notifications
  const showNotification = useCallback((message, type = 'success', duration = 5000) => {
    const id = Date.now();
    const notification = { id, message, type, duration };
    
    setNotifications(prev => [...prev, notification]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  // Chargement initial des mappings
  useEffect(() => {
    loadExistingMappings();
  }, []);

  const loadExistingMappings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/mappings`);
      
      if (response.ok) {
        const data = await response.json();
        setMappings(data.mappings || {});
        showNotification(`${Object.keys(data.mappings || {}).length} mappings chargés`, 'info');
      }
    } catch (error) {
      console.error('Erreur lors du chargement des mappings:', error);
      showNotification('Erreur lors du chargement des mappings', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Gestionnaire de fichiers pour l'extraction
  const handleExtractionFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setExtractionState(prev => ({ ...prev, uploadedFile: file, isProcessing: true }));

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/upload-for-dataprep`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setExtractionState(prev => ({
          ...prev,
          filePreview: result.image,
          previewDimensions: { width: result.width, height: result.height },
          previewZoom: 1,
          isProcessing: false
        }));
        
        showNotification(
          `Fichier chargé: ${result.is_digital ? 'PDF numérique' : 'PDF scanné'} (${result.dpi} DPI)`,
          'success'
        );
      } else {
        throw new Error(result.message || 'Erreur lors du chargement');
      }
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur lors du chargement du fichier', 'error');
      setExtractionState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // Gestion du zoom pour l'aperçu d'extraction
  const handlePreviewZoomChange = (factor) => {
    setExtractionState(prev => {
      const newZoom = Math.max(0.1, Math.min(5, prev.previewZoom * factor));
      return { ...prev, previewZoom: newZoom };
    });
  };

  // Activer le mode sélection manuelle
  const startManualSelection = (fieldKey) => {
    setExtractionState(prev => ({
      ...prev,
      isManualSelecting: true,
      selectedFieldForManual: fieldKey,
      manualSelectionMode: true
    }));
    showNotification(`Mode sélection activé pour ${EXTRACTION_FIELDS.find(f => f.key === fieldKey)?.label}`, 'info');
  };

  // Gestionnaires d'événements pour le canvas d'extraction - VERSION CORRIGÉE POUR LE SCROLL
  const handleExtractionCanvasMouseDown = (event) => {
    if (!extractionState.isManualSelecting || !extractionCanvasRef.current) return;

    const rect = extractionCanvasRef.current.getBoundingClientRect();
    const scrollContainer = extractionCanvasRef.current.parentElement;
    
    // Prendre en compte le scroll de la zone d'aperçu
    const scrollLeft = scrollContainer.scrollLeft || 0;
    const scrollTop = scrollContainer.scrollTop || 0;
    
    const x = Math.round((event.clientX - rect.left + scrollLeft) / extractionState.previewZoom);
    const y = Math.round((event.clientY - rect.top + scrollTop) / extractionState.previewZoom);

    // Vérifier que les coordonnées sont dans les limites de l'image
    const maxX = extractionState.previewDimensions.width;
    const maxY = extractionState.previewDimensions.height;
    
    if (x < 0 || x >= maxX || y < 0 || y >= maxY) return;

    setExtractionDrawingState({
      isDrawing: true,
      startPos: { x, y },
      currentRect: null
    });
  };

  const handleExtractionCanvasMouseMove = (event) => {
    if (!extractionDrawingState.isDrawing || !extractionState.isManualSelecting || !extractionCanvasRef.current) return;

    const rect = extractionCanvasRef.current.getBoundingClientRect();
    const scrollContainer = extractionCanvasRef.current.parentElement;
    
    // Prendre en compte le scroll
    const scrollLeft = scrollContainer.scrollLeft || 0;
    const scrollTop = scrollContainer.scrollTop || 0;
    
    const x = Math.round((event.clientX - rect.left + scrollLeft) / extractionState.previewZoom);
    const y = Math.round((event.clientY - rect.top + scrollTop) / extractionState.previewZoom);

    // Contraindre les coordonnées dans les limites de l'image
    const maxX = extractionState.previewDimensions.width;
    const maxY = extractionState.previewDimensions.height;
    const constrainedX = Math.max(0, Math.min(maxX - 1, x));
    const constrainedY = Math.max(0, Math.min(maxY - 1, y));

    const currentRect = {
      left: Math.min(extractionDrawingState.startPos.x, constrainedX),
      top: Math.min(extractionDrawingState.startPos.y, constrainedY),
      width: Math.abs(constrainedX - extractionDrawingState.startPos.x),
      height: Math.abs(constrainedY - extractionDrawingState.startPos.y)
    };

    setExtractionDrawingState(prev => ({ ...prev, currentRect }));
    redrawExtractionCanvas(currentRect);
  };

  const handleExtractionCanvasMouseUp = async () => {
    if (!extractionDrawingState.isDrawing || !extractionState.selectedFieldForManual) return;

    const { currentRect } = extractionDrawingState;
    
    // Validation de la taille minimum
    if (!currentRect || currentRect.width < 5 || currentRect.height < 5) {
      showNotification('Sélection trop petite (minimum 5×5 pixels)', 'error');
      resetExtractionDrawingState();
      return;
    }

    // Vérifier que la sélection est dans les limites
    const maxX = extractionState.previewDimensions.width;
    const maxY = extractionState.previewDimensions.height;
    
    if (currentRect.left + currentRect.width > maxX || currentRect.top + currentRect.height > maxY) {
      showNotification('Sélection en dehors des limites du document', 'error');
      resetExtractionDrawingState();
      return;
    }

    // Extraire le texte
    await extractTextFromSelection(currentRect, extractionState.selectedFieldForManual);
    
    // Désactiver le mode sélection
    setExtractionState(prev => ({
      ...prev,
      isManualSelecting: false,
      selectedFieldForManual: null,
      manualSelectionMode: false
    }));
    
    resetExtractionDrawingState();
  };

  const resetExtractionDrawingState = () => {
    setExtractionDrawingState({
      isDrawing: false,
      startPos: { x: 0, y: 0 },
      currentRect: null
    });
  };

  // Extraire le texte de la zone sélectionnée
  const extractTextFromSelection = async (coords, fieldKey) => {
    if (!extractionState.filePreview) return;

    try {
      setIsLoading(true);
      
      const formData = new FormData();
      formData.append('left', Math.round(coords.left).toString());
      formData.append('top', Math.round(coords.top).toString());
      formData.append('width', Math.round(coords.width).toString());
      formData.append('height', Math.round(coords.height).toString());
      formData.append('image_data', extractionState.filePreview.split(',')[1]);

      const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success && result.text) {
        const cleanedText = result.text.trim();
        
        if (cleanedText.length === 0) {
          showNotification('Aucun texte détecté dans la zone sélectionnée', 'warning');
          return;
        }
        
        // Mettre à jour le champ
        setExtractionState(prev => ({
          ...prev,
          extractedData: {
            ...prev.extractedData,
            [fieldKey]: cleanedText
          }
        }));
        
        const fieldLabel = EXTRACTION_FIELDS.find(f => f.key === fieldKey)?.label;
        showNotification(`✅ Texte extrait pour "${fieldLabel}": "${cleanedText}"`, 'success');
      } else {
        showNotification('Aucun texte lisible détecté', 'warning');
      }
    } catch (error) {
      console.error('Erreur OCR:', error);
      showNotification('Erreur lors de l\'extraction du texte', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Redessiner le canvas d'extraction - VERSION AMÉLIORÉE IDENTIQUE À CONFIGURATION
  const redrawExtractionCanvas = useCallback((tempRect = null) => {
    const canvas = extractionCanvasRef.current;
    if (!canvas || !extractionState.filePreview) return;

    const ctx = canvas.getContext('2d');
    
    // Dimensionner le canvas selon les vraies dimensions
    const scaledWidth = extractionState.previewDimensions.width * extractionState.previewZoom;
    const scaledHeight = extractionState.previewDimensions.height * extractionState.previewZoom;
    
    // Utiliser les dimensions réelles pour éviter la troncature
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${scaledWidth}px`;
    canvas.style.height = `${scaledHeight}px`;
    
    ctx.clearRect(0, 0, scaledWidth, scaledHeight);

    // Dessiner l'image
    if (extractionImageRef.current?.complete) {
      ctx.drawImage(extractionImageRef.current, 0, 0, scaledWidth, scaledHeight);

      // Dessiner le rectangle de sélection
      if (tempRect && extractionState.isManualSelecting) {
        const x = tempRect.left * extractionState.previewZoom;
        const y = tempRect.top * extractionState.previewZoom;
        const width = tempRect.width * extractionState.previewZoom;
        const height = tempRect.height * extractionState.previewZoom;

        // Sauvegarder le contexte
        ctx.save();

        // Rectangle principal avec bordure pointillée
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(x, y, width, height);

        // Fond semi-transparent
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.fillRect(x, y, width, height);

        // Bordure intérieure pour plus de netteté
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

        // Label avec fond
        const fontSize = Math.max(11, 13 * extractionState.previewZoom);
        ctx.font = `bold ${fontSize}px Arial`;
        const labelText = extractionState.selectedFieldForManual;
        const textMetrics = ctx.measureText(labelText);
        
        // Fond du label
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
        const labelPadding = 4;
        const labelX = x;
        const labelY = Math.max(y - fontSize - labelPadding, 0);
        ctx.fillRect(labelX, labelY, textMetrics.width + labelPadding * 2, fontSize + labelPadding);
        
        // Texte du label
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, labelX + labelPadding, labelY + fontSize);

        // Coordonnées en bas à droite de la sélection
        const coordText = `${Math.round(tempRect.width)}×${Math.round(tempRect.height)}`;
        ctx.font = `${Math.max(9, 11 * extractionState.previewZoom)}px monospace`;
        const coordMetrics = ctx.measureText(coordText);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const coordX = x + width - coordMetrics.width - 6;
        const coordY = y + height - 4;
        ctx.fillRect(coordX - 2, coordY - 12, coordMetrics.width + 4, 14);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(coordText, coordX, coordY);

        ctx.restore();
      }
    }
  }, [extractionState]);

  // Effet pour charger l'image et redessiner
  useEffect(() => {
    if (extractionState.filePreview && extractionImageRef.current) {
      extractionImageRef.current.onload = () => redrawExtractionCanvas();
      extractionImageRef.current.src = extractionState.filePreview;
    }
  }, [extractionState.filePreview, extractionState.previewZoom, redrawExtractionCanvas]);

  // Extraction automatique des données
  const performDataExtraction = async () => {
    const { selectedIssuer, customIssuer, uploadedFile } = extractionState;
    const issuer = customIssuer || selectedIssuer;

    if (!issuer || !uploadedFile) {
      showNotification('Veuillez sélectionner un émetteur et un fichier', 'error');
      return;
    }

    setExtractionState(prev => ({ ...prev, isProcessing: true }));

    try {
      const formData = new FormData();
      formData.append('emetteur', issuer);
      formData.append('file', uploadedFile);

      const response = await fetch(`${API_BASE_URL}/extract-data`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setExtractionState(prev => ({
          ...prev,
          extractedData: { ...prev.extractedData, ...result.data },
          isProcessing: false
        }));
        showNotification('Extraction réussie !', 'success');
      } else {
        throw new Error(result.message || 'Erreur lors de l\'extraction');
      }
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur lors de l\'extraction', 'error');
      setExtractionState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // Gestionnaire de fichiers pour DataPrep
  const handleDataPrepFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/upload-for-dataprep`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setDataPrepState(prev => ({
          ...prev,
          uploadedImage: result.image,
          imageDimensions: { width: result.width, height: result.height },
          currentZoom: 1,
          fieldMappings: {},
          selectionHistory: []
        }));
        
        showNotification(
          `Image chargée: ${result.is_digital ? 'PDF numérique' : 'PDF scanné'} (${result.dpi} DPI)`,
          'success'
        );
      } else {
        throw new Error(result.message || 'Erreur lors du chargement');
      }
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur lors du chargement de l\'image', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Gestion du zoom pour DataPrep
  const handleZoomChange = (factor) => {
    setDataPrepState(prev => {
      const newZoom = Math.max(0.1, Math.min(5, prev.currentZoom * factor));
      return { ...prev, currentZoom: newZoom };
    });
  };

  // Démarrer la sélection d'un champ
  const startFieldSelection = (fieldKey) => {
    setDataPrepState(prev => ({
      ...prev,
      isSelecting: true,
      selectedField: fieldKey,
      ocrPreview: `Sélectionnez la zone pour ${fieldKey} en cliquant et glissant sur l'image`
    }));
  };

  // Gestionnaires d'événements pour le canvas DataPrep - VERSION CORRIGÉE
  const [drawingState, setDrawingState] = useState({
    isDrawing: false,
    startPos: { x: 0, y: 0 },
    currentRect: null
  });

  const handleCanvasMouseDown = (event) => {
    if (!dataPrepState.isSelecting || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scrollContainer = canvasRef.current.parentElement;
    
    // Prendre en compte le scroll de la zone de configuration
    const scrollLeft = scrollContainer.scrollLeft || 0;
    const scrollTop = scrollContainer.scrollTop || 0;
    
    const x = Math.round((event.clientX - rect.left + scrollLeft) / dataPrepState.currentZoom);
    const y = Math.round((event.clientY - rect.top + scrollTop) / dataPrepState.currentZoom);

    // Vérifier que les coordonnées sont dans les limites de l'image
    const maxX = dataPrepState.imageDimensions.width;
    const maxY = dataPrepState.imageDimensions.height;
    
    if (x < 0 || x >= maxX || y < 0 || y >= maxY) return;

    setDrawingState({
      isDrawing: true,
      startPos: { x, y },
      currentRect: null
    });
  };

  const handleCanvasMouseMove = (event) => {
    if (!drawingState.isDrawing || !dataPrepState.isSelecting || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scrollContainer = canvasRef.current.parentElement;
    
    // Prendre en compte le scroll
    const scrollLeft = scrollContainer.scrollLeft || 0;
    const scrollTop = scrollContainer.scrollTop || 0;
    
    const x = Math.round((event.clientX - rect.left + scrollLeft) / dataPrepState.currentZoom);
    const y = Math.round((event.clientY - rect.top + scrollTop) / dataPrepState.currentZoom);

    // Contraindre les coordonnées dans les limites de l'image
    const maxX = dataPrepState.imageDimensions.width;
    const maxY = dataPrepState.imageDimensions.height;
    const constrainedX = Math.max(0, Math.min(maxX - 1, x));
    const constrainedY = Math.max(0, Math.min(maxY - 1, y));

    const currentRect = {
      left: Math.min(drawingState.startPos.x, constrainedX),
      top: Math.min(drawingState.startPos.y, constrainedY),
      width: Math.abs(constrainedX - drawingState.startPos.x),
      height: Math.abs(constrainedY - drawingState.startPos.y)
    };

    setDrawingState(prev => ({ ...prev, currentRect }));
    redrawCanvas(currentRect);
  };

  const handleCanvasMouseUp = async (event) => {
    if (!drawingState.isDrawing || !dataPrepState.selectedField) return;

    const { currentRect } = drawingState;
    
    // Validation de la taille minimum
    if (!currentRect || currentRect.width < 5 || currentRect.height < 5) {
      showNotification('Sélection trop petite (minimum 5×5 pixels)', 'error');
      resetDrawingState();
      return;
    }

    // Vérifier que la sélection est dans les limites
    const maxX = dataPrepState.imageDimensions.width;
    const maxY = dataPrepState.imageDimensions.height;
    
    if (currentRect.left + currentRect.width > maxX || currentRect.top + currentRect.height > maxY) {
      showNotification('Sélection en dehors des limites du document', 'error');
      resetDrawingState();
      return;
    }

    // Sauvegarder la sélection
    setDataPrepState(prev => ({
      ...prev,
      fieldMappings: {
        ...prev.fieldMappings,
        [prev.selectedField]: currentRect
      },
      selectionHistory: [...prev.selectionHistory, {
        field: prev.selectedField,
        coords: currentRect,
        timestamp: Date.now()
      }],
      isSelecting: false,
      selectedField: null
    }));

    // Prévisualiser l'OCR
    await previewOCR(currentRect);
    resetDrawingState();
  };

  const resetDrawingState = () => {
    setDrawingState({
      isDrawing: false,
      startPos: { x: 0, y: 0 },
      currentRect: null
    });
  };

  // Prévisualisation OCR
  const previewOCR = async (coords) => {
    if (!dataPrepState.uploadedImage) return;

    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append('left', coords.left.toString());
      formData.append('top', coords.top.toString());
      formData.append('width', coords.width.toString());
      formData.append('height', coords.height.toString());
      formData.append('image_data', dataPrepState.uploadedImage.split(',')[1]);

      const response = await fetch(`${API_BASE_URL}/ocr-preview`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        setDataPrepState(prev => ({
          ...prev,
          ocrPreview: `Aperçu: "${result.text}"`
        }));
      } else {
        setDataPrepState(prev => ({
          ...prev,
          ocrPreview: 'Erreur lors de la prévisualisation OCR'
        }));
      }
    } catch (error) {
      console.error('Erreur OCR:', error);
      setDataPrepState(prev => ({
        ...prev,
        ocrPreview: 'Erreur lors de la prévisualisation OCR'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Redessiner le canvas DataPrep - VERSION AMÉLIORÉE
  const redrawCanvas = useCallback((tempRect = null) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataPrepState.uploadedImage) return;

    const ctx = canvas.getContext('2d');
    
    // Dimensionner le canvas selon les vraies dimensions
    const scaledWidth = dataPrepState.imageDimensions.width * dataPrepState.currentZoom;
    const scaledHeight = dataPrepState.imageDimensions.height * dataPrepState.currentZoom;
    
    // Utiliser les dimensions réelles pour éviter la troncature
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${scaledWidth}px`;
    canvas.style.height = `${scaledHeight}px`;
    
    ctx.clearRect(0, 0, scaledWidth, scaledHeight);

    // Dessiner l'image
    if (imageRef.current && imageRef.current.complete) {
      ctx.drawImage(imageRef.current, 0, 0, scaledWidth, scaledHeight);

      // Dessiner les rectangles existants (mappings sauvegardés)
      Object.entries(dataPrepState.fieldMappings).forEach(([field, coords]) => {
        drawRectangle(ctx, coords, field, '#e53e3e', false);
      });

      // Dessiner le rectangle temporaire (en cours de sélection)
      if (tempRect && dataPrepState.isSelecting) {
        drawRectangle(ctx, tempRect, dataPrepState.selectedField, '#3182ce', true);
      }
    }
  }, [dataPrepState]);

  // Dessiner un rectangle sur le canvas - VERSION AMÉLIORÉE
  const drawRectangle = (ctx, coords, field, color, isTemporary) => {
    const x = coords.left * dataPrepState.currentZoom;
    const y = coords.top * dataPrepState.currentZoom;
    const width = coords.width * dataPrepState.currentZoom;
    const height = coords.height * dataPrepState.currentZoom;

    // Sauvegarder le contexte
    ctx.save();

    // Rectangle principal
    ctx.strokeStyle = color;
    ctx.lineWidth = isTemporary ? 3 : 2;
    ctx.setLineDash(isTemporary ? [8, 4] : []);
    ctx.strokeRect(x, y, width, height);

    // Fond semi-transparent
    ctx.fillStyle = isTemporary ? 'rgba(49, 130, 206, 0.15)' : 'rgba(229, 62, 62, 0.1)';
    ctx.fillRect(x, y, width, height);

    // Bordure intérieure pour plus de netteté
    if (isTemporary) {
      ctx.strokeStyle = '#1e40af';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    }

    // Label avec fond
    const fontSize = Math.max(11, 13 * dataPrepState.currentZoom);
    ctx.font = `bold ${fontSize}px Arial`;
    const labelText = field;
    const textMetrics = ctx.measureText(labelText);
    
    // Fond du label
    const labelColor = isTemporary ? 'rgba(49, 130, 206, 0.9)' : 'rgba(229, 62, 62, 0.9)';
    ctx.fillStyle = labelColor;
    const labelPadding = 4;
    const labelX = x;
    const labelY = Math.max(y - fontSize - labelPadding, 0);
    ctx.fillRect(labelX, labelY, textMetrics.width + labelPadding * 2, fontSize + labelPadding);
    
    // Texte du label
    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, labelX + labelPadding, labelY + fontSize);

    // Coordonnées pour les sélections temporaires
    if (isTemporary) {
      const coordText = `${Math.round(coords.width)}×${Math.round(coords.height)}`;
      ctx.font = `${Math.max(9, 11 * dataPrepState.currentZoom)}px monospace`;
      const coordMetrics = ctx.measureText(coordText);
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      const coordX = x + width - coordMetrics.width - 6;
      const coordY = y + height - 4;
      ctx.fillRect(coordX - 2, coordY - 12, coordMetrics.width + 4, 14);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(coordText, coordX, coordY);
    }

    ctx.restore();
  };

  // Effet pour redessiner le canvas
  useEffect(() => {
    if (dataPrepState.uploadedImage && imageRef.current) {
      imageRef.current.onload = () => redrawCanvas();
      imageRef.current.src = dataPrepState.uploadedImage;
    }
  }, [dataPrepState.uploadedImage, dataPrepState.currentZoom, dataPrepState.fieldMappings, redrawCanvas]);

  // Sauvegarder les mappings
  const saveMappings = async () => {
    if (!dataPrepState.issuerName || Object.keys(dataPrepState.fieldMappings).length === 0) {
      showNotification('Veuillez entrer un émetteur et mapper au moins un champ', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const mappingData = {
        emetteur: dataPrepState.issuerName,
        field_map: dataPrepState.fieldMappings
      };

      const response = await fetch(`${API_BASE_URL}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingData)
      });

      if (response.ok) {
        showNotification(`Mappings sauvegardés pour ${dataPrepState.issuerName}`, 'success');
        await loadExistingMappings();
      } else {
        throw new Error('Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur lors de la sauvegarde', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Exportation des données
  const exportData = (format) => {
    const dataToExport = {
      emetteur: extractionState.customIssuer || extractionState.selectedIssuer,
      ...extractionState.extractedData,
      dateExtraction: new Date().toISOString()
    };

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extraction_${dataToExport.emetteur}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const csv = [
        Object.keys(dataToExport).join(','),
        Object.values(dataToExport).join(',')
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extraction_${dataToExport.emetteur}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    showNotification(`Données exportées en ${format.toUpperCase()}`, 'success');
  };

  const copyToClipboard = () => {
    const text = EXTRACTION_FIELDS
      .map(field => `${field.label}: ${extractionState.extractedData[field.key] || 'N/A'}`)
      .join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      showNotification('Données copiées dans le presse-papier', 'success');
    });
  };

  

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="relative bg-white/10 backdrop-blur-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent mb-4">
              🧾 Invoice Extractor Pro
            </h1>
            <p className="text-blue-100 text-lg">
              Intelligence artificielle pour l'extraction automatique de données de factures
            </p>
          </div>
          
          {/* Navigation */}
          <nav className="flex justify-center">
            <div className="bg-white/20 backdrop-blur-md rounded-2xl p-2 border border-white/30">
              {[
                { id: 'extract', label: 'Extraction', icon: <Search className="w-5 h-5" /> },
                { id: 'dataprep', label: 'Configuration', icon: <Settings className="w-5 h-5" /> }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(tab.id)}
                  className={`flex items-center gap-3 px-8 py-4 rounded-xl font-semibold transition-all duration-300 ${
                    activeView === tab.id
                      ? 'bg-white text-indigo-600 shadow-lg transform scale-105'
                      : 'text-white hover:bg-white/20 hover:transform hover:scale-105'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`flex items-center gap-3 px-6 py-4 rounded-xl backdrop-blur-lg border shadow-lg transform transition-all duration-300 animate-in slide-in-from-right ${
              notification.type === 'success'
                ? 'bg-green-500/20 border-green-400/30 text-green-100'
                : notification.type === 'error'
                ? 'bg-red-500/20 border-red-400/30 text-red-100'
                : 'bg-blue-500/20 border-blue-400/30 text-blue-100'
            }`}
          >
            {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
            {notification.type === 'info' && <FileText className="w-5 h-5" />}
            <span className="font-medium">{notification.message}</span>
          </div>
        ))}
      </div>

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeView === 'extract' && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">
              Extraction de Données
            </h2>
            
            {/* Mode sélection manuelle actif */}
            {extractionState.manualSelectionMode && (
              <div className="mb-6 p-4 bg-blue-500/20 border border-blue-400/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Target className="w-6 h-6 text-blue-200" />
                    <div>
                      <h3 className="text-blue-100 font-semibold">
                        Mode Sélection Manuelle Activé
                      </h3>
                      <p className="text-blue-200 text-sm">
                        Sélectionnez une zone sur l'image pour extraire le texte du champ : 
                        <strong> {EXTRACTION_FIELDS.find(f => f.key === extractionState.selectedFieldForManual)?.label}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setExtractionState(prev => ({
                      ...prev,
                      isManualSelecting: false,
                      selectedFieldForManual: null,
                      manualSelectionMode: false
                    }))}
                    className="px-4 py-2 bg-red-500/20 border border-red-400/30 text-red-100 rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
            
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Section de configuration */}
              <div className="space-y-6">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                  <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Configuration
                  </h3>
                  
                  {/* Sélection d'émetteur */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-blue-100 mb-2">
                        Émetteur existant
                      </label>
                      <select
                        value={extractionState.selectedIssuer}
                        onChange={(e) => setExtractionState(prev => ({ 
                          ...prev, 
                          selectedIssuer: e.target.value,
                          customIssuer: '' 
                        }))}
                        className="w-full px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      >
                        <option value="">Sélectionnez un émetteur</option>
                        {Object.keys(mappings).map(issuer => (
                          <option key={issuer} value={issuer} className="text-gray-900">
                            {issuer}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="text-center text-blue-200 font-medium">OU</div>

                    <div>
                      <label className="block text-sm font-medium text-blue-100 mb-2">
                        Nouvel émetteur
                      </label>
                      <input
                        type="text"
                        value={extractionState.customIssuer}
                        onChange={(e) => setExtractionState(prev => ({ 
                          ...prev, 
                          customIssuer: e.target.value,
                          selectedIssuer: '' 
                        }))}
                        placeholder="Nom du nouvel émetteur"
                        className="w-full px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Upload de fichier */}
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-blue-100 mb-2">
                      Fichier PDF/Image
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={handleExtractionFileUpload}
                        className="hidden"
                        id="extraction-file-input"
                      />
                      <label
                        htmlFor="extraction-file-input"
                        className="flex items-center justify-center w-full px-6 py-8 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:border-white/50 transition-colors bg-white/10 backdrop-blur-md"
                      >
                        <div className="text-center">
                          <Upload className="w-12 h-12 text-blue-200 mx-auto mb-4" />
                          <p className="text-blue-100 font-medium">
                            {extractionState.uploadedFile ? extractionState.uploadedFile.name : 'Cliquez pour sélectionner un fichier'}
                          </p>
                          {extractionState.uploadedFile && (
                            <p className="text-blue-200 text-sm mt-2">
                              {(extractionState.uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Bouton d'extraction */}
                  <button
                    onClick={performDataExtraction}
                    disabled={extractionState.isProcessing || !extractionState.uploadedFile || (!extractionState.selectedIssuer && !extractionState.customIssuer)}
                    className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    {extractionState.isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Extraction en cours...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        Extraire les données
                      </>
                    )}
                  </button>
                </div>

                {/* Données extraites avec sélection manuelle */}
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white">
                      Données Extraites
                    </h3>
                    {extractionState.filePreview && (
                      <div className="text-xs text-blue-200">
                        💡 Cliquez sur l'icône cible pour sélectionner manuellement
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    {EXTRACTION_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-blue-100 mb-2">
                          {field.icon} {field.label}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={extractionState.extractedData[field.key]}
                            onChange={(e) => setExtractionState(prev => ({
                              ...prev,
                              extractedData: {
                                ...prev.extractedData,
                                [field.key]: e.target.value
                              }
                            }))}
                            className="flex-1 px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                            placeholder={`${field.label} sera extrait automatiquement`}
                          />
                          {extractionState.filePreview && (
                            <button
                              onClick={() => startManualSelection(field.key)}
                              disabled={extractionState.isManualSelecting}
                              className={`px-3 py-3 rounded-xl transition-colors flex items-center justify-center ${
                                extractionState.selectedFieldForManual === field.key
                                  ? 'bg-blue-500/30 border border-blue-400/50 text-blue-100'
                                  : 'bg-white/20 border border-white/30 text-blue-200 hover:bg-white/30'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                              title="Sélection manuelle"
                            >
                              <Target className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Boutons d'export */}
                  {Object.values(extractionState.extractedData).some(val => val) && (
                    <div className="mt-6 pt-6 border-t border-white/20">
                      <h4 className="text-lg font-semibold text-white mb-4">
                        Exporter les données
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => exportData('json')}
                          className="flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-400/30 text-green-100 rounded-lg hover:bg-green-500/30 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          JSON
                        </button>
                        <button
                          onClick={() => exportData('csv')}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-400/30 text-blue-100 rounded-lg hover:bg-blue-500/30 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          CSV
                        </button>
                        <button
                          onClick={copyToClipboard}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-400/30 text-purple-100 rounded-lg hover:bg-purple-500/30 transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                          Copier
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section de prévisualisation avec sélection interactive */}
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Aperçu du Document
                    {extractionState.manualSelectionMode && (
                      <span className="text-blue-200 text-sm">- Mode Sélection</span>
                    )}
                  </h3>
                  
                  {/* Contrôles de zoom pour l'aperçu */}
                  {extractionState.filePreview && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePreviewZoomChange(0.8)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                      >
                        <ZoomOut className="w-4 h-4 text-white" />
                      </button>
                      <span className="text-white font-medium px-3 py-1 bg-white/20 rounded-lg min-w-16 text-center">
                        {Math.round(extractionState.previewZoom * 100)}%
                      </span>
                      <button
                        onClick={() => handlePreviewZoomChange(1.2)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                      >
                        <ZoomIn className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => setExtractionState(prev => ({ ...prev, previewZoom: 1 }))}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  )}
                </div>
                
                {extractionState.filePreview ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm text-blue-100">
                      <span>📐 {extractionState.previewDimensions.width} × {extractionState.previewDimensions.height} px</span>
                      <div className="flex items-center gap-4">
                        {mappings[extractionState.selectedIssuer || extractionState.customIssuer] && (
                          <span className="bg-green-500/20 border border-green-400/30 text-green-100 px-2 py-1 rounded">
                            ✅ Mapping disponible
                          </span>
                        )}
                        {extractionState.manualSelectionMode && (
                          <span className="bg-blue-500/20 border border-blue-400/30 text-blue-100 px-2 py-1 rounded flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            Sélection active
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Zone d'aperçu avec canvas interactif - VERSION AMÉLIORÉE IDENTIQUE À CONFIGURATION */}
                    <div className="bg-white/10 rounded-xl border border-white/20 relative" style={{ maxHeight: '500px', overflow: 'auto' }}>
                      <div className="relative" style={{ minWidth: 'max-content' }}>
                        {/* Mode sélection manuelle - Canvas interactif */}
                        {extractionState.manualSelectionMode ? (
                          <div className="relative">
                            <canvas
                              ref={extractionCanvasRef}
                              onMouseDown={handleExtractionCanvasMouseDown}
                              onMouseMove={handleExtractionCanvasMouseMove}
                              onMouseUp={handleExtractionCanvasMouseUp}
                              className="cursor-crosshair block"
                              style={{
                                width: extractionState.previewDimensions.width * extractionState.previewZoom,
                                height: extractionState.previewDimensions.height * extractionState.previewZoom,
                                border: '2px solid #3b82f6',
                                borderRadius: '4px'
                              }}
                            />
                            
                            {/* Instructions de sélection */}
                            <div className="absolute bottom-4 left-4 bg-black/90 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-10">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                Cliquez et glissez pour sélectionner
                              </div>
                              <div className="text-gray-300 mt-1">
                                Min: 5×5px • Zoom: {Math.round(extractionState.previewZoom * 100)}% • Scrollez si nécessaire
                              </div>
                            </div>
                            
                            {/* Coordonnées en temps réel */}
                            {/* {extractionDrawingState.currentRect && (
                              <div className="absolute top-4 right-4 bg-black/90 text-white text-xs px-3 py-2 rounded-lg font-mono shadow-lg z-10">
                                Sélection: {Math.round(extractionDrawingState.currentRect.width)}×{Math.round(extractionDrawingState.currentRect.height)}px
                                <br />
                                Position: ({Math.round(extractionDrawingState.currentRect.left)}, {Math.round(extractionDrawingState.currentRect.top)})
                              </div>
                            )} */}
                            
                            {/* Indicateur de champ actif */}
                            <div className="absolute top-4 left-4 bg-blue-500/80 text-white text-xs px-2 py-1 rounded shadow-lg z-10">
                              🎯 Extraction: {extractionState.selectedFieldForManual}
                            </div>
                          </div>
                        ) : (
                          // Mode aperçu normal
                          <img
                            ref={previewImageRef}
                            src={extractionState.filePreview}
                            alt="Aperçu du document"
                            className="block"
                            style={{
                              width: extractionState.previewDimensions.width * extractionState.previewZoom,
                              height: extractionState.previewDimensions.height * extractionState.previewZoom
                            }}
                          />
                        )}
                        
                        {/* Image cachée pour le canvas */}
                        <img
                          ref={extractionImageRef}
                          src={extractionState.filePreview}
                          alt="Document de référence"
                          className="hidden"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/30 rounded-xl">
                    {extractionState.isProcessing ? (
                      <>
                        <Loader2 className="w-12 h-12 text-blue-200 animate-spin mb-4" />
                        <p className="text-blue-100">Génération de l'aperçu...</p>
                      </>
                    ) : (
                      <>
                        <FileText className="w-12 h-12 text-blue-200 mb-4" />
                        <p className="text-blue-100">Sélectionnez un fichier pour voir l'aperçu</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeView === 'dataprep' && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">
              Configuration des Mappings
            </h2>
            
            {/* Contrôles de configuration */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                <label className="block text-sm font-medium text-blue-100 mb-2">
                  Fichier d'entraînement
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleDataPrepFileUpload}
                    className="hidden"
                    id="dataprep-file-input"
                  />
                  <label
                    htmlFor="dataprep-file-input"
                    className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:border-white/50 transition-colors bg-white/10 backdrop-blur-md"
                  >
                    <Upload className="w-5 h-5 text-blue-200 mr-2" />
                    <span className="text-blue-100">Choisir un fichier</span>
                  </label>
                </div>
              </div>

              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                <label className="block text-sm font-medium text-blue-100 mb-2">
                  Nom de l'émetteur
                </label>
                <input
                  type="text"
                  value={dataPrepState.issuerName}
                  onChange={(e) => setDataPrepState(prev => ({ ...prev, issuerName: e.target.value }))}
                  placeholder="Ex: Entreprise ABC"
                  className="w-full px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>

              {dataPrepState.uploadedImage && (
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                  <label className="block text-sm font-medium text-blue-100 mb-2">
                    Contrôles de zoom
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleZoomChange(0.8)}
                      className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                    >
                      <ZoomOut className="w-4 h-4 text-white" />
                    </button>
                    <span className="text-white font-medium px-3 py-1 bg-white/20 rounded-lg min-w-16 text-center">
                      {Math.round(dataPrepState.currentZoom * 100)}%
                    </span>
                    <button
                      onClick={() => handleZoomChange(1.2)}
                      className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                    >
                      <ZoomIn className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => setDataPrepState(prev => ({ ...prev, currentZoom: 1 }))}
                      className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-4 gap-8">
              {/* Canvas de sélection */}
              <div className="lg:col-span-3">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    Zone de sélection
                  </h3>
                  
                  {dataPrepState.uploadedImage ? (
                    <div className="bg-white/10 rounded-xl border border-white/20 relative" style={{ maxHeight: '500px', overflow: 'auto' }}>
                      <div className="relative" style={{ minWidth: 'max-content' }}>
                        <canvas
                          ref={canvasRef}
                          onMouseDown={handleCanvasMouseDown}
                          onMouseMove={handleCanvasMouseMove}
                          onMouseUp={handleCanvasMouseUp}
                          className={`cursor-${dataPrepState.isSelecting ? 'crosshair' : 'default'} block`}
                          style={{
                            width: dataPrepState.imageDimensions.width * dataPrepState.currentZoom,
                            height: dataPrepState.imageDimensions.height * dataPrepState.currentZoom,
                            border: dataPrepState.isSelecting ? '2px solid #3b82f6' : 'none',
                            borderRadius: '4px'
                          }}
                        />
                        <img
                          ref={imageRef}
                          src={dataPrepState.uploadedImage}
                          alt="Document de référence"
                          className="hidden"
                        />
                        
                        {/* Instructions pour la sélection */}
                        {dataPrepState.isSelecting && (
                          <>
                            <div className="absolute bottom-4 left-4 bg-black/90 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-10">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                Cliquez et glissez pour mapper: {dataPrepState.selectedField}
                              </div>
                              <div className="text-gray-300 mt-1">
                                Min: 5×5px • Zoom: {Math.round(dataPrepState.currentZoom * 100)}% • Scrollez si nécessaire
                              </div>
                            </div>
                            
                            {/* Coordonnées en temps réel */}
                            {/* {drawingState.currentRect && (
                              <div className="absolute top-4 right-4 bg-black/90 text-white text-xs px-3 py-2 rounded-lg font-mono shadow-lg z-10">
                                Sélection: {Math.round(drawingState.currentRect.width)}×{Math.round(drawingState.currentRect.height)}px
                                <br />
                                Position: ({Math.round(drawingState.currentRect.left)}, {Math.round(drawingState.currentRect.top)})
                              </div>
                            )} */}
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/30 rounded-xl">
                      <FileText className="w-12 h-12 text-blue-200 mb-4" />
                      <p className="text-blue-100">Chargez un fichier pour commencer la configuration</p>
                    </div>
                  )}
                  
                  {dataPrepState.ocrPreview && (
                    <div className="mt-4 p-4 bg-white/20 backdrop-blur-md rounded-xl border border-white/30">
                      <h4 className="text-sm font-medium text-blue-100 mb-2">Aperçu OCR:</h4>
                      <p className="text-white">{dataPrepState.ocrPreview}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Panneau de contrôle des champs */}
              <div className="space-y-6">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                  <h3 className="text-xl font-semibold text-white mb-4">
                    Champs à mapper
                  </h3>
                  
                  {dataPrepState.isSelecting && (
                    <div className="mb-4 p-3 bg-blue-500/20 border border-blue-400/30 rounded-xl">
                      <p className="text-blue-100 text-sm font-medium">
                        🎯 Sélection: <strong>{dataPrepState.selectedField}</strong>
                      </p>
                      <p className="text-blue-200 text-xs mt-1">
                        Cliquez et glissez sur l'image pour définir la zone
                      </p>
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
                            {field.icon} {field.label}
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => startFieldSelection(field.key)}
                              disabled={dataPrepState.isSelecting || !dataPrepState.uploadedImage}
                              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                dataPrepState.fieldMappings[field.key]
                                  ? 'bg-green-500/20 border border-green-400/30 text-green-100'
                                  : 'bg-blue-500/20 border border-blue-400/30 text-blue-100'
                              } hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {dataPrepState.fieldMappings[field.key] ? 'Remapper' : 'Sélectionner'}
                            </button>
                            {dataPrepState.fieldMappings[field.key] && (
                              <button
                                onClick={() => setDataPrepState(prev => {
                                  const newMappings = { ...prev.fieldMappings };
                                  delete newMappings[field.key];
                                  return { ...prev, fieldMappings: newMappings };
                                })}
                                className="p-1 bg-red-500/20 border border-red-400/30 text-red-100 rounded hover:bg-red-500/30 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {dataPrepState.fieldMappings[field.key] && (
                          <div className="text-xs text-blue-200 font-mono">
                            Zone: ({Math.round(dataPrepState.fieldMappings[field.key].left)}, 
                            {Math.round(dataPrepState.fieldMappings[field.key].top)}, 
                            {Math.round(dataPrepState.fieldMappings[field.key].width)}, 
                            {Math.round(dataPrepState.fieldMappings[field.key].height)})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={saveMappings}
                    disabled={isLoading || !dataPrepState.issuerName || Object.keys(dataPrepState.fieldMappings).length === 0}
                    className="w-full mt-6 px-6 py-4 bg-gradient-to-r from-green-500 to-blue-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
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
                </div>

                {/* Historique des sélections */}
                {dataPrepState.selectionHistory.length > 0 && (
                  <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Historique
                    </h3>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {dataPrepState.selectionHistory.slice(-5).map((entry, index) => (
                        <div key={index} className="text-xs text-blue-200 bg-white/10 rounded-lg p-2">
                          <div className="font-medium">{entry.field}</div>
                          <div className="opacity-75">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-blue-200">
        <p className="text-sm">
          🚀 Propulsé par l'Intelligence Artificielle • 
          Traitement automatique de documents • 
          Extraction de données précise
        </p>
      </footer>
    </div>
  );
};

export default Extractor;