import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileText, Eye, Download, Copy, Trash2, ZoomIn, ZoomOut, RotateCcw, Settings, CheckCircle, AlertCircle, Loader2, Search, ChevronLeft, ChevronRight, Plus, Building2, ShoppingCart, Receipt, ArrowRight, X } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000';

const Extractor = () => {
  const [currentStep, setCurrentStep] = useState('setup');
  const [mappings, setMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const [setupState, setSetupState] = useState({
    invoiceType: 'achat',
    selectedFiles: [],
    filePreviews: []
  });

  // const [suppliers, setSuppliers] = useState([
  //   { id: 1, name: 'ACME Corporation', type: 'both' },
  //   { id: 2, name: 'TechSupply SARL', type: 'achat' },
  //   { id: 3, name: 'ClientCorp', type: 'vente' },
  //   { id: 4, name: 'MaterialCo', type: 'achat' }
  // ]);

  const [extractionState, setExtractionState] = useState({
    uploadedFiles: [],
    filePreviews: [],
    previewDimensions: [],
    currentPdfIndex: 0,
    extractedDataList: [],
    isProcessing: false
  });

  const [dataPrepState, setDataPrepState] = useState({
    uploadedImage: null,
    imageDimensions: { width: 0, height: 0 },
    currentZoom: 1,
    isSelecting: false,
    selectedField: null,
    fieldMappings: {},
    selectionHistory: [],
    ocrPreview: '',
    ocrBoxes: [],
    selectedBoxes: {}
  });

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const previewImageRef = useRef(null);
  const horizontalScrollRef = useRef(null);

  const EXTRACTION_FIELDS = [
    { key: 'fournisseur', label: 'Fournisseur', icon: '🏢' },
    { key: 'numeroFacture', label: 'Numéro de Facture', icon: '📄' },
    { key: 'tauxTVA', label: 'Taux TVA', icon: '📊' },
    { key: 'montantHT', label: 'Montant HT', icon: '💰' },
    { key: 'montantTVA', label: 'Montant TVA', icon: '📈' },
    { key: 'montantTTC', label: 'Montant TTC', icon: '💳' }
  ];

  const showNotification = useCallback((message, type = 'success', duration = 5000) => {
    const id = Date.now();
    const notification = { id, message, type, duration };
    
    setNotifications(prev => [...prev, notification]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  const loadExistingMappings = useCallback(async () => {
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
  }, [showNotification]);

  const handleDataPrepFileUpload = useCallback(async (event) => {
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
  }, [showNotification]);

  const handleZoomChange = useCallback((factor) => {
    setDataPrepState(prev => {
      const newZoom = Math.max(0.1, Math.min(5, prev.currentZoom * factor));
      return { ...prev, currentZoom: newZoom };
    });
  }, []);

  const startFieldSelection = useCallback((fieldKey) => {
    setDataPrepState(prev => ({
      ...prev,
      isSelecting: true,
      selectedField: fieldKey,
      ocrPreview: `Cliquez sur une boîte OCR pour l'assigner à ${fieldKey}`
    }));
  }, []);

  const findClickedBox = useCallback((x, y) => {
    if (!dataPrepState.ocrBoxes.length) return null;

    for (const box of dataPrepState.ocrBoxes) {
      const boxX = box.coords.left;
      const boxY = box.coords.top;
      const boxWidth = box.coords.width;
      const boxHeight = box.coords.height;

      if (x >= boxX && x <= boxX + boxWidth && y >= boxY && y <= boxY + boxHeight) {
        return box;
      }
    }
    return null;
  }, [dataPrepState.ocrBoxes]);

  const handleCanvasMouseDown = useCallback((event) => {
    if (!dataPrepState.isSelecting || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / dataPrepState.currentZoom;
    const y = (event.clientY - rect.top) / dataPrepState.currentZoom;

    const clickedBox = findClickedBox(x, y);
    if (clickedBox) {
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
  }, [dataPrepState.isSelecting, dataPrepState.currentZoom, dataPrepState.selectedField, findClickedBox]);

  const drawOcrBox = useCallback((ctx, box, isSelected, isSelecting) => {
    const x = box.coords.left * dataPrepState.currentZoom;
    const y = box.coords.top * dataPrepState.currentZoom;
    const width = box.coords.width * dataPrepState.currentZoom;
    const height = box.coords.height * dataPrepState.currentZoom;

    let color, fillColor;
    if (isSelected) {
      color = '#22d3ee';
      fillColor = 'rgba(34, 211, 238, 0.10)';
    } else if (isSelecting) {
      color = '#3b82f6';
      fillColor = 'rgba(59, 130, 246, 0.10)';
    } else {
      color = '#f43f5e';
      fillColor = 'rgba(244, 63, 94, 0.07)';
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, width, height);
  }, [dataPrepState.currentZoom]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataPrepState.uploadedImage) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (imageRef.current && imageRef.current.complete) {
      const scaledWidth = dataPrepState.imageDimensions.width * dataPrepState.currentZoom;
      const scaledHeight = dataPrepState.imageDimensions.height * dataPrepState.currentZoom;
      
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      
      ctx.drawImage(imageRef.current, 0, 0, scaledWidth, scaledHeight);

      dataPrepState.ocrBoxes.forEach((box) => {
        const isSelected = Object.values(dataPrepState.selectedBoxes).some(selectedBox => selectedBox.id === box.id);
        const isSelecting = dataPrepState.isSelecting && dataPrepState.selectedField;
        
        drawOcrBox(ctx, box, isSelected, isSelecting);
      });
    }
  }, [dataPrepState.uploadedImage, dataPrepState.imageDimensions, dataPrepState.currentZoom, dataPrepState.ocrBoxes, dataPrepState.selectedBoxes, dataPrepState.isSelecting, dataPrepState.selectedField, drawOcrBox]);

  const saveMappings = useCallback(async () => {
    if (Object.keys(dataPrepState.selectedBoxes).length === 0) {
      showNotification('Veuillez sélectionner au moins un champ', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const mappingData = {
        field_map: dataPrepState.fieldMappings
      };

      const response = await fetch(`${API_BASE_URL}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingData)
      });

      if (response.ok) {
        showNotification(`Mappings sauvegardés`, 'success');
        loadExistingMappings();
      } else {
        throw new Error('Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur lors de la sauvegarde', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [dataPrepState.selectedBoxes, dataPrepState.fieldMappings, showNotification, loadExistingMappings]);

  const handleSetupFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    setIsLoading(true);

    try {
      const previews = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/upload-for-dataprep`, {
          method: 'POST',
          body: formData
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
                totalPages: result.images.length
              });
            });
          } else if (result.image) {
            previews.push({
              file: file,
              preview: result.image,
              fileName: file.name,
              pageNumber: 1,
              totalPages: 1
            });
          }
        }
      }

      setSetupState(prev => ({
        ...prev,
        selectedFiles: files,
        filePreviews: previews
      }));

      showNotification(`${files.length} fichier(s) ajouté(s) (${previews.length} page(s))`, 'success');
    } catch (error) {
      showNotification('Erreur lors du chargement des fichiers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour rediriger vers la configuration des mappings
  const goToMappingConfiguration = () => {
    setCurrentStep('dataprep');
    showNotification('Configurez vos mappings pour le nouveau fournisseur/client', 'info');
  };

  const validateSetupAndProceed = () => {
    if (!setupState.invoiceType) {
      showNotification('Veuillez sélectionner le type de facture', 'error');
      return;
    }

    if (setupState.filePreviews.length === 0) {
      showNotification('Veuillez sélectionner au moins un fichier', 'error');
      return;
    }

    setExtractionState({
      uploadedFiles: setupState.selectedFiles,
      filePreviews: setupState.filePreviews.map(p => p.preview),
      previewDimensions: setupState.filePreviews.map(p => ({
        fileName: p.fileName,
        pageNumber: p.pageNumber,
        totalPages: p.totalPages
      })),
      currentPdfIndex: 0,
      extractedDataList: Array(setupState.filePreviews.length).fill({}),
      isProcessing: false
    });

    setCurrentStep('extract');
    showNotification('Configuration validée, début de l\'extraction', 'success');
  };

  const removeFile = (indexToRemove) => {
    setSetupState(prev => ({
      ...prev,
      filePreviews: prev.filePreviews.filter((_, index) => index !== indexToRemove)
    }));
  };

  const scrollToIndex = (index) => {
    setExtractionState(prev => ({ ...prev, currentPdfIndex: index }));
  };

  const goToPrevPdf = () => {
    const newIndex = Math.max(0, extractionState.currentPdfIndex - 1);
    scrollToIndex(newIndex);
  };

  const goToNextPdf = () => {
    const newIndex = Math.min(extractionState.filePreviews.length - 1, extractionState.currentPdfIndex + 1);
    scrollToIndex(newIndex);
  };

  const extractAllPdfs = async () => {
    setExtractionState(prev => ({ ...prev, isProcessing: true }));
    const results = [];
    
    for (let i = 0; i < extractionState.filePreviews.length; i++) {
      const base64 = extractionState.filePreviews[i];
      const res = await fetch(base64);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append('file', blob, `page_${i}.png`);
      
      try {
        const response = await fetch(`${API_BASE_URL}/extract-data`, {
          method: 'POST',
          body: formData
        });
        const result = await response.json();
        results.push(result.data || {});
      } catch (error) {
        results.push({});
      }
    }
    
    setExtractionState(prev => ({
      ...prev,
      extractedDataList: results,
      isProcessing: false
    }));
    
    showNotification('Extraction terminée pour tous les fichiers', 'success');
  };

  const filterValue = (val, fieldKey) => {
    if (!val) return '';
    if (fieldKey === 'fournisseur') return val;
    const matches = val.match(/[0-9.,;:/\\-]+/g);
    return matches ? matches.join('') : '';
  };

  const backToSetup = () => {
    setCurrentStep('setup');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      <header className="relative bg-white/10 backdrop-blur-lg border-b border-white/20 py-2">
        <div className="max-w-7xl mx-auto px-6 py-2">
          <div className="text-center mb-2">
            <h1 className="text-3xl font-bold text-white mb-2">
              {currentStep === 'setup' ? 'Configuration Comptable' : currentStep === 'extract' ? 'Extraction de Factures' : 'Configuration des Mappings'}
            </h1>
          </div>
          
          <div className="flex justify-center items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${currentStep === 'setup' ? 'bg-white text-indigo-600' : 'text-white/70 hover:text-white'}`}
                 onClick={() => setCurrentStep('setup')}>
              <Settings className="w-4 h-4" />
              <span className="font-medium">1. Configuration</span>
            </div>
            <ArrowRight className="w-4 h-4 text-white/50" />
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${currentStep === 'extract' ? 'bg-white text-indigo-600' : 'text-white/70 hover:text-white'}`}
                 onClick={() => currentStep !== 'setup' && setCurrentStep('extract')}>
              <Search className="w-4 h-4" />
              <span className="font-medium">2. Extraction</span>
            </div>
            <ArrowRight className="w-4 h-4 text-white/50" />
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${currentStep === 'dataprep' ? 'bg-white text-indigo-600' : 'text-white/70 hover:text-white'}`}
                 onClick={() => setCurrentStep('dataprep')}>
              <ZoomIn className="w-4 h-4" />
              <span className="font-medium">3. Mappings</span>
            </div>
          </div>
        </div>
      </header>

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

      <main className="max-w-7xl mx-auto px-4 py-6">
        {currentStep === 'setup' && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8">
            <div className="max-w-4xl mx-auto">
              
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <Receipt className="w-6 h-6" />
                  1. Type de facture
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setSetupState(prev => ({ ...prev, invoiceType: 'achat' }))}
                    className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                      setupState.invoiceType === 'achat'
                        ? 'border-blue-400 bg-blue-500/20 text-white shadow-lg scale-105'
                        : 'border-white/30 bg-white/10 text-blue-100 hover:border-white/50'
                    }`}
                  >
                    <ShoppingCart className="w-12 h-12 mx-auto mb-3" />
                    <h3 className="text-xl font-semibold mb-2">Facture d'Achat</h3>
                    <p className="text-sm opacity-80">Factures reçues de vos fournisseurs</p>
                  </button>
                  
                  <button
                    onClick={() => setSetupState(prev => ({ ...prev, invoiceType: 'vente' }))}
                    className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                      setupState.invoiceType === 'vente'
                        ? 'border-green-400 bg-green-500/20 text-white shadow-lg scale-105'
                        : 'border-white/30 bg-white/10 text-blue-100 hover:border-white/50'
                    }`}
                  >
                    <Receipt className="w-12 h-12 mx-auto mb-3" />
                    <h3 className="text-xl font-semibold mb-2">Facture de Vente</h3>
                    <p className="text-sm opacity-80">Factures émises vers vos clients</p>
                  </button>
                </div>
              </div>

              {setupState.invoiceType && (
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                    <Building2 className="w-6 h-6" />
                    2. Ajout d'un {setupState.invoiceType === 'achat' ? 'Fournisseur' : 'Client'}
                  </h2>
                  
                  <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                    <div className="space-y-4">
                      {/* <div className="grid gap-3">
                        {suppliers
                          .filter(s => s.type === setupState.invoiceType || s.type === 'both')
                          .map(supplier => (
                            <div
                              key={supplier.id}
                              className="flex items-center p-4 rounded-xl border border-white/30 bg-white/10"
                            >
                              <Building2 className="w-5 h-5 text-blue-200 mr-3" />
                              <span className="text-white font-medium">{supplier.name}</span>
                            </div>
                          ))}
                      </div> */}
                      
                      <button
                        onClick={goToMappingConfiguration}
                        className="w-full p-6 border-2 border-dashed border-blue-400/50 rounded-xl text-blue-200 hover:border-blue-400 hover:text-white hover:bg-blue-500/10 transition-all flex items-center justify-center gap-3 bg-blue-500/5"
                      >
                        <Plus className="w-6 h-6" />
                        <div className="text-center">
                          <div className="font-semibold text-lg">
                            Ajouter un nouveau {setupState.invoiceType === 'achat' ? 'fournisseur' : 'client'}
                          </div>
                          <div className="text-sm opacity-80">
                            Cliquez ici pour configurer les mappings pour un nouveau partenaire
                          </div>
                        </div>
                        <ArrowRight className="w-6 h-6" />
                      </button>
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
                          Glissez vos fichiers ici ou cliquez pour sélectionner
                        </span>
                        <span className="text-blue-200 text-sm">
                          PDF, PNG, JPG acceptés • Plusieurs fichiers possible
                        </span>
                      </label>
                    </div>

                    {setupState.filePreviews.length > 0 && (
                      <div>
                        <h4 className="text-white font-medium mb-3">
                          Fichiers sélectionnés ({setupState.filePreviews.length} page(s))
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
                                {preview.totalPages > 1 && ` (${preview.pageNumber}/${preview.totalPages})`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {setupState.invoiceType && setupState.filePreviews.length > 0 && (
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
        )}

        {currentStep === 'extract' && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Extraction en cours</h2>
              <button
                onClick={backToSetup}
                className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Retour à la configuration
              </button>
            </div>
            
            <div className="flex flex-row gap-6">
              <div className="flex-1 max-w-[30%] min-w-[320px] space-y-4">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30">
                  <h3 className="text-lg font-semibold text-white mb-4">Données Extraites</h3>
                  
                  <div className="mb-4 p-3 bg-blue-500/20 rounded-xl">
                    <div className="text-sm text-blue-100">
                      Type: <span className="font-medium">{setupState.invoiceType === 'achat' ? 'Facture d\'achat' : 'Facture de vente'}</span>
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
                          {field.icon} {field.label}
                        </label>
                        <input
                          type="text"
                          value={filterValue(extractionState.extractedDataList[extractionState.currentPdfIndex]?.[field.key], field.key)}
                          onChange={(e) => setExtractionState(prev => ({
                            ...prev,
                            extractedDataList: prev.extractedDataList.map((data, index) =>
                              index === prev.currentPdfIndex ? { ...data, [field.key]: e.target.value } : data
                            )
                          }))}
                          className="w-full px-3 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          placeholder={`${field.label} sera extrait automatiquement`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-[2] min-w-0">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      Aperçu des Documents
                    </h3>
                    {extractionState.filePreviews.length > 0 && (
                      <div className="text-sm text-blue-200">
                        {extractionState.currentPdfIndex + 1} / {extractionState.filePreviews.length}
                      </div>
                    )}
                  </div>

                  {extractionState.filePreviews.length > 0 ? (
                    <div className="flex-1 flex flex-col">
                      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                        <div className="relative flex-1 flex items-center justify-center w-full h-full overflow-auto" style={{ minHeight: '60vh', height: '60vh' }}>
                          <img
                            ref={previewImageRef}
                            src={extractionState.filePreviews[extractionState.currentPdfIndex]}
                            alt="Aperçu du document"
                            className="object-contain rounded-xl border border-white/10 shadow-lg"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              display: 'block',
                            }}
                          />
                        </div>
                        
                        <div className="mt-2 text-center">
                          <div className="text-white font-medium">
                            {extractionState.previewDimensions[extractionState.currentPdfIndex]?.fileName}
                          </div>
                          {extractionState.previewDimensions[extractionState.currentPdfIndex]?.totalPages > 1 && (
                            <div className="text-blue-200 text-sm">
                              Page {extractionState.previewDimensions[extractionState.currentPdfIndex]?.pageNumber} sur {extractionState.previewDimensions[extractionState.currentPdfIndex]?.totalPages}
                            </div>
                          )}
                        </div>
                      </div>

                      {extractionState.filePreviews.length > 1 && (
                        <div className="mt-4 pt-4 border-t border-white/20">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={goToPrevPdf}
                              disabled={extractionState.currentPdfIndex === 0}
                              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                            >
                              <ChevronLeft className="w-4 h-4 text-white" />
                            </button>
                            
                            <div 
                              ref={horizontalScrollRef}
                              className="flex-1 overflow-x-auto"
                              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                              <div className="flex gap-3 pb-2">
                                {extractionState.filePreviews.map((preview, index) => (
                                  <div
                                    key={index}
                                    onClick={() => scrollToIndex(index)}
                                    className={`relative flex-shrink-0 w-16 h-20 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                                      index === extractionState.currentPdfIndex
                                        ? 'border-blue-400 shadow-lg scale-110 ring-2 ring-blue-400/50'
                                        : 'border-white/30 hover:border-white/50 hover:scale-105'
                                    }`}
                                  >
                                    <img
                                      src={preview}
                                      alt={`Page ${index + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    {index === extractionState.currentPdfIndex && (
                                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border border-white"></div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <button
                              onClick={goToNextPdf}
                              disabled={extractionState.currentPdfIndex === extractionState.filePreviews.length - 1}
                              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                            >
                              <ChevronRight className="w-4 h-4 text-white" />
                            </button>
                          </div>
                          
                          <div className="text-center mt-2">
                            <span className="text-blue-200 text-sm">
                              {extractionState.currentPdfIndex + 1} / {extractionState.filePreviews.length} pages
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/30 rounded-xl">
                      <FileText className="w-12 h-12 text-blue-200 mb-4" />
                      <p className="text-blue-100">Aucun document à afficher</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'dataprep' && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-white">
                Configuration des Mappings
              </h2>
              <button
                onClick={() => setCurrentStep('setup')}
                className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Retour à la configuration
              </button>
            </div>

           
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                <label className="block text-sm font-medium text-blue-100 mb-2">
                  Document d'exemple
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
                <p className="text-xs text-blue-300 mt-2">
                  Chargez une facture type pour définir les zones d'extraction
                </p>
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

              {Object.keys(dataPrepState.selectedBoxes).length > 0 && (
                <div className="bg-green-500/20 backdrop-blur-md rounded-2xl p-6 border border-green-400/30">
                  <label className="block text-sm font-medium text-green-100 mb-2">
                    Progression
                  </label>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-100 mb-1">
                      {Object.keys(dataPrepState.selectedBoxes).length}/6
                    </div>
                    <div className="text-xs text-green-200">
                      champs configurés
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-4 gap-8">
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
                      <p className="text-blue-100 text-center">
                        Chargez un document exemple pour commencer<br/>
                        la configuration des mappings
                      </p>
                    </div>
                  )}
                </div>
              </div>

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
                            <div>"{filterValue(dataPrepState.selectedBoxes[field.key].text, field.key)}"</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={saveMappings}
                    disabled={isLoading || Object.keys(dataPrepState.selectedBoxes).length === 0}
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

                {Object.keys(mappings).length > 0 && (
                  <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Mappings existants
                    </h3>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {Object.keys(mappings).map((key) => (
                        <div key={key} className="text-xs text-blue-200 bg-white/10 rounded-lg p-2 flex items-center justify-between">
                          <span className="font-mono">{key}</span>
                          <button
                            onClick={async () => {
                              try {
                                const response = await fetch(`${API_BASE_URL}/mappings/${key}`, {
                                  method: 'DELETE'
                                });
                                if (response.ok) {
                                  showNotification(`Mapping ${key} supprimé`, 'success');
                                  loadExistingMappings();
                                }
                              } catch (error) {
                                showNotification('Erreur lors de la suppression', 'error');
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
          </div>
        )}
      </main>
    </div>
  );
};

export default Extractor;