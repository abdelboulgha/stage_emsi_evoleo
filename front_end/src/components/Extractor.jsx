 import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileText, Eye, Download, Copy, Trash2, ZoomIn, ZoomOut, RotateCcw, Settings, CheckCircle, AlertCircle, Loader2, Search } from 'lucide-react';

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
    previewZoom: 1, // Ajout du zoom pour l'aperçu
    extractedData: {
      numeroFacture: '',
      tauxTVA: '',
      montantHT: '',
      montantTVA: '',
      montantTTC: ''
    },
    isProcessing: false
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
    ocrPreview: '',
    ocrBoxes: [], // Boîtes OCR détectées automatiquement
    selectedBoxes: {} // Boîtes sélectionnées pour chaque champ
  });

  // Refs pour les canvas et images
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const previewImageRef = useRef(null);

  // Constantes
  const EXTRACTION_FIELDS = [
    { key: 'numeroFacture', label: 'Numéro de Facture', icon: '📄' },
    { key: 'tauxTVA', label: 'Taux TVA', icon: '📊' },
    { key: 'montantHT', label: 'Montant HT', icon: '💰' },
    { key: 'montantTVA', label: 'Montant TVA', icon: '📈' },
    { key: 'montantTTC', label: 'Montant TTC', icon: '💳' }
  ];

  // Système de notifications amélioré
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
          previewZoom: 1, // Reset du zoom lors du chargement
          isProcessing: false
        }));
        
        showNotification(
          `Fichier chargé avec succès (${result.width} × ${result.height} px)`,
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

  // Extraction des données
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
      // Étape 1: Charger l'image
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/upload-for-dataprep`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Étape 2: Détecter les boîtes OCR
        const ocrFormData = new FormData();
        ocrFormData.append('file', file);

        const ocrResponse = await fetch(`${API_BASE_URL}/detect-ocr-boxes`, {
          method: 'POST',
          body: ocrFormData
        });

        const ocrResult = await ocrResponse.json();

        setDataPrepState(prev => ({
          ...prev,
          uploadedImage: result.image,
          imageDimensions: { width: result.width, height: result.height },
          currentZoom: 1,
          fieldMappings: {},
          selectionHistory: [],
          ocrBoxes: ocrResult.success ? ocrResult.boxes : [],
          selectedBoxes: {}
        }));
        
        showNotification(
          `Image chargée avec succès (${result.width} × ${result.height} px) - ${ocrResult.success ? ocrResult.boxes.length : 0} boîtes OCR détectées`,
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
      ocrPreview: `Cliquez sur une boîte OCR pour l'assigner à ${fieldKey}`
    }));
  };

  // Gestionnaires d'événements pour le canvas
  const [drawingState, setDrawingState] = useState({
    isDrawing: false,
    startPos: { x: 0, y: 0 },
    currentRect: null
  });

  const handleCanvasMouseDown = (event) => {
    if (!dataPrepState.isSelecting || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / dataPrepState.currentZoom;
    const y = (event.clientY - rect.top) / dataPrepState.currentZoom;

    // Trouver la boîte OCR cliquée
    const clickedBox = findClickedBox(x, y);
    if (clickedBox) {
      // Assigner cette boîte au champ sélectionné
      setDataPrepState(prev => ({
        ...prev,
        selectedBoxes: {
          ...prev.selectedBoxes,
          [prev.selectedField]: clickedBox
        },
        fieldMappings: {
          ...prev.fieldMappings,
          [prev.selectedField]: clickedBox.coords
        },
        isSelecting: false,
        selectedField: null,
        ocrPreview: `Boîte ${clickedBox.id} assignée à ${prev.selectedField}: "${clickedBox.text}"`
      }));
    }
  };

  const findClickedBox = (x, y) => {
    if (!dataPrepState.ocrBoxes.length) return null;

    const displayScale = dataPrepState.currentZoom;
    
    for (const box of dataPrepState.ocrBoxes) {
      const boxX = box.coords.left * displayScale;
      const boxY = box.coords.top * displayScale;
      const boxWidth = box.coords.width * displayScale;
      const boxHeight = box.coords.height * displayScale;

      if (x >= boxX && x <= boxX + boxWidth && y >= boxY && y <= boxY + boxHeight) {
        return box;
      }
    }
    return null;
  };

  // Supprimé les handlers de dessin manuel car nous utilisons maintenant les boîtes OCR détectées

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

  // Redessiner le canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataPrepState.uploadedImage) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dessiner l'image
    if (imageRef.current && imageRef.current.complete) {
      const scaledWidth = dataPrepState.imageDimensions.width * dataPrepState.currentZoom;
      const scaledHeight = dataPrepState.imageDimensions.height * dataPrepState.currentZoom;
      
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      
      ctx.drawImage(imageRef.current, 0, 0, scaledWidth, scaledHeight);

      // Dessiner toutes les boîtes OCR détectées
      dataPrepState.ocrBoxes.forEach((box, index) => {
        const isSelected = Object.values(dataPrepState.selectedBoxes).some(selectedBox => selectedBox.id === box.id);
        const isSelecting = dataPrepState.isSelecting && dataPrepState.selectedField;
        
        drawOcrBox(ctx, box, isSelected, isSelecting);
      });
    }
  }, [dataPrepState]);

  // Dessiner une boîte OCR sur le canvas
  const drawOcrBox = (ctx, box, isSelected, isSelecting) => {
    const x = box.coords.left * dataPrepState.currentZoom;
    const y = box.coords.top * dataPrepState.currentZoom;
    const width = box.coords.width * dataPrepState.currentZoom;
    const height = box.coords.height * dataPrepState.currentZoom;

    // Choisir la couleur selon l'état
    let color, fillColor;
    if (isSelected) {
      color = '#22d3ee'; // Cyan vif pour la boîte sélectionnée
      fillColor = 'rgba(34, 211, 238, 0.10)';
    } else if (isSelecting) {
      color = '#3b82f6'; // Bleu vif pour sélection
      fillColor = 'rgba(59, 130, 246, 0.10)';
    } else {
      color = '#f43f5e'; // Rouge vif pour les autres
      fillColor = 'rgba(244, 63, 94, 0.07)';
    }

    // Rectangle
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, width, height);

    // Fond très léger
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, width, height);
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
    if (!dataPrepState.issuerName || Object.keys(dataPrepState.selectedBoxes).length === 0) {
      showNotification('Veuillez entrer un émetteur et sélectionner au moins un champ', 'error');
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

  // Helper to filter extracted values
  const filterValue = (val) => {
    if (!val) return '';
    // Only keep numbers and symbols (no letters)
    const matches = val.match(/[0-9.,;:/\\-]+/g);
    return matches ? matches.join('') : '';
  };

  const [pdfZoom, setPdfZoom] = useState(1);
  const [isPdfFullscreen, setIsPdfFullscreen] = useState(false);

  // Reset zoom when a new PDF is loaded
  useEffect(() => {
    setPdfZoom(1);
  }, [extractionState.filePreview]);

  useEffect(() => {
    if (!isPdfFullscreen) return;
    const onKey = (e) => { if (e.key === 'Escape') setIsPdfFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPdfFullscreen]);



  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Header */}
      <header className="relative bg-white/10 backdrop-blur-lg border-b border-white/20 py-2">
        <div className="max-w-7xl mx-auto px-6 py-2">
          <div className="text-center mb-2">
            <h1 className="text-3xl font-bold text-white mb-2">Extraction de factures</h1>
          </div>
          {/* Navigation */}
          <nav className="flex justify-center">
            <div className="bg-white/20 backdrop-blur-md rounded-2xl p-1 border border-white/30 flex gap-2">
              {[
                { id: 'extract', label: 'Extraction', icon: <Search className="w-5 h-5" /> },
                { id: 'dataprep', label: 'Configuration', icon: <Settings className="w-5 h-5" /> }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(tab.id)}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl font-semibold transition-all duration-300 ${
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
      <main className="max-w-7xl mx-auto px-2 py-4">
        {activeView === 'extract' && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-4 w-full max-w-[1400px] mx-auto">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">Extraction de Données</h2>
            <div className="flex flex-row gap-6">
              {/* Config/fields section (30%) */}
              <div className="flex-1 max-w-[30%] min-w-[320px] space-y-4">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Configuration
                  </h3>
                  {/* Emetteur selection only (no new emetteur) */}
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
                        className="w-full px-4 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      >
                        <option value="">Sélectionnez un émetteur</option>
                        {Object.keys(mappings).map(issuer => (
                          <option key={issuer} value={issuer} className="text-gray-900">
                            {issuer}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* Upload button smaller */}
                  <div className="mt-4">
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
                        className="flex items-center justify-center w-full px-2 py-3 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:border-white/50 transition-colors bg-white/10 backdrop-blur-md"
                      >
                        <Upload className="w-8 h-8 text-blue-200 mx-auto mr-2" />
                        <span className="text-blue-100 font-medium">
                          {extractionState.uploadedFile ? extractionState.uploadedFile.name : 'Sélectionner un fichier'}
                        </span>
                      </label>
                    </div>
                  </div>
                  {/* Extraction button */}
                  <button
                    onClick={performDataExtraction}
                    disabled={extractionState.isProcessing || !extractionState.uploadedFile || !extractionState.selectedIssuer}
                    className="w-full mt-4 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
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
                {/* Données extraites (unchanged) */}
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Données Extraites
                  </h3>
                  <div className="space-y-3">
                    {EXTRACTION_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-blue-100 mb-1">
                          {field.icon} {field.label}
                        </label>
                        <input
                          type="text"
                          value={filterValue(extractionState.extractedData[field.key])}
                          onChange={(e) => setExtractionState(prev => ({
                            ...prev,
                            extractedData: {
                              ...prev.extractedData,
                              [field.key]: e.target.value
                            }
                          }))}
                          className="w-full px-3 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          placeholder={`${field.label} sera extrait automatiquement`}
                        />
                      </div>
                    ))}
                  </div>
                  {/* Export/copy buttons unchanged */}
                  {Object.values(extractionState.extractedData).some(val => val) && (
                    <div className="mt-4 pt-4 border-t border-white/20">
                      <h4 className="text-base font-semibold text-white mb-2">
                        Exporter les données
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => exportData('json')}
                          className="flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-400/30 text-green-100 rounded-lg hover:bg-green-500/30 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          JSON
                        </button>
                        <button
                          onClick={() => exportData('csv')}
                          className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-400/30 text-blue-100 rounded-lg hover:bg-blue-500/30 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          CSV
                        </button>
                        <button
                          onClick={copyToClipboard}
                          className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 border border-purple-400/30 text-purple-100 rounded-lg hover:bg-purple-500/30 transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                          Copier
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* PDF display section (70%) */}
              <div className="flex-[2] min-w-0">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30 h-full flex flex-col">
                                  <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Aperçu du Document
                  </h3>
                  {extractionState.filePreview && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPdfZoom(z => Math.max(0.2, z * 0.8))}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                      >
                        <ZoomOut className="w-4 h-4 text-white" />
                      </button>
                      <span className="text-white font-medium px-2 py-1 bg-white/20 rounded-lg min-w-12 text-center">
                        {Math.round(pdfZoom * 100)}%
                      </span>
                      <button
                        onClick={() => setPdfZoom(z => Math.min(5, z * 1.2))}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                      >
                        <ZoomIn className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => setPdfZoom(1)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => setIsPdfFullscreen(true)}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        title="Plein écran"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 0 2 2h3m8-18h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3"/></svg>
                      </button>
                    </div>
                  )}
                </div>
                  {extractionState.filePreview ? (
                    <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                      <div id="pdf-preview-container" className="relative flex-1 flex items-center justify-center w-full h-full overflow-auto">
                        <img
                          ref={previewImageRef}
                          src={extractionState.filePreview}
                          alt="Aperçu du document"
                          className="object-contain rounded-xl border border-white/10 shadow"
                          style={{
                            maxHeight: '70vh',
                            maxWidth: '100%',
                            width: `${pdfZoom * 100}%`,
                            height: 'auto',
                            transition: 'width 0.2s',
                          }}
                        />
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
              {/* Canvas de sélection - identique à l'original */}
              <div className="lg:col-span-3">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white">
                      Zone de sélection
                    </h3>
                    {dataPrepState.ocrBoxes.length > 0 && (
                      <div className="text-sm text-blue-200 bg-blue-500/20 px-3 py-1 rounded-lg">
                        {dataPrepState.ocrBoxes.length} boîtes OCR détectées
                      </div>
                    )}
                  </div>
                  
                  {dataPrepState.uploadedImage ? (
                    <div className="bg-white/10 rounded-xl overflow-auto max-h-97 border border-white/20">
                      <canvas
                        ref={canvasRef}
                        onMouseDown={handleCanvasMouseDown}
                        className={`cursor-${dataPrepState.isSelecting ? 'pointer' : 'default'} max-w-full`}
                        style={{
                          width: dataPrepState.imageDimensions.width * dataPrepState.currentZoom,
                          height: dataPrepState.imageDimensions.height * dataPrepState.currentZoom
                        }}
                      />
                      <img
                        ref={imageRef}
                        src={dataPrepState.uploadedImage}
                        alt="Document de référence"
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/30 rounded-xl">
                      <FileText className="w-12 h-12 text-blue-200 mb-4" />
                      <p className="text-blue-100">Chargez un fichier pour commencer la configuration</p>
                    </div>
                  )}
                  
                  {dataPrepState.ocrPreview && false && (
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
                        Cliquez sur une boîte OCR pour l'assigner à ce champ
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
                              disabled={dataPrepState.isSelecting || !dataPrepState.uploadedImage || dataPrepState.ocrBoxes.length === 0}
                              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                dataPrepState.selectedBoxes[field.key]
                                  ? 'bg-green-500/20 border border-green-400/30 text-green-100'
                                  : 'bg-blue-500/20 border border-blue-400/30 text-blue-100'
                              } hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {dataPrepState.selectedBoxes[field.key] ? 'Changer' : 'Sélectionner'}
                            </button>
                            {dataPrepState.selectedBoxes[field.key] && (
                              <button
                                onClick={() => setDataPrepState(prev => {
                                  const newMappings = { ...prev.fieldMappings };
                                  const newSelectedBoxes = { ...prev.selectedBoxes };
                                  delete newMappings[field.key];
                                  delete newSelectedBoxes[field.key];
                                  return { ...prev, fieldMappings: newMappings, selectedBoxes: newSelectedBoxes };
                                })}
                                className="p-1 bg-red-500/20 border border-red-400/30 text-red-100 rounded hover:bg-red-500/30 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {dataPrepState.selectedBoxes[field.key] && (
                          <div className="text-xs text-green-200 font-mono">
                            <div>"{filterValue(dataPrepState.selectedBoxes[field.key].text)}"</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={saveMappings}
                    disabled={isLoading || !dataPrepState.issuerName || Object.keys(dataPrepState.selectedBoxes).length === 0}
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
      {/* <footer className="text-center py-8 text-blue-200">
        <p className="text-sm">
          🚀 Propulsé par l'Intelligence Artificielle • 
          Traitement automatique de documents • 
          Extraction de données précise
        </p>
      </footer> */}

      {/* Fullscreen PDF modal */}
      {isPdfFullscreen && (
        <div id="pdf-fullscreen-modal" className="fixed inset-0 z-50 bg-black bg-opacity-95 flex flex-col items-center justify-center">
          <button
            onClick={() => setIsPdfFullscreen(false)}
            className="absolute top-4 right-4 p-3 bg-white/20 rounded-full hover:bg-white/40 text-white"
            title="Fermer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <div className="flex-1 flex items-center justify-center w-full h-full">
            <img
              src={extractionState.filePreview}
              alt="Aperçu du document plein écran"
              className="object-contain rounded-xl border border-white/10 shadow-2xl"
              style={{
                maxHeight: '85vh',
                maxWidth: '95vw',
                width: `${pdfZoom * 100}%`,
                height: 'auto',
                transition: 'width 0.2s',
              }}
            />
          </div>

        </div>
      )}
    </div>
  );
};

export default Extractor;