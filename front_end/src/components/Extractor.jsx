import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileText, Eye, Download, Copy, Trash2, ZoomIn, ZoomOut, RotateCcw, Settings, CheckCircle, AlertCircle, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000';

const Extractor = () => {
  // États principaux
  const [activeView, setActiveView] = useState('extract');
  const [mappings, setMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // État d'extraction mis à jour
  const [extractionState, setExtractionState] = useState({
    uploadedFiles: [],
    filePreviews: [], // array of images/pages
    previewDimensions: [], // array of {width, height}
    currentPdfIndex: 0,
    extractedDataList: [], // array of extracted data per page
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
    ocrBoxes: [],
    selectedBoxes: {}
  });

  // Refs
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const previewImageRef = useRef(null);
  const horizontalScrollRef = useRef(null);

  // Constantes
  const EXTRACTION_FIELDS = [
    { key: 'fournisseur', label: 'Fournisseur', icon: '🏢' },
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

  // Gestionnaire de fichiers multiples avec défilement horizontal
  const handleExtractionFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    setExtractionState(prev => ({ ...prev, isProcessing: true }));

    let allImages = [];
    let allDimensions = [];
    const fileNames = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const response = await fetch(`${API_BASE_URL}/upload-for-dataprep`, {
          method: 'POST',
          body: formData
        });
        const result = await response.json();
        if (result.images) {
          // PDF avec plusieurs pages
          allImages = allImages.concat(result.images);
          allDimensions = allDimensions.concat(result.widths.map((w, i) => ({ 
            width: w, 
            height: result.heights[i],
            fileName: file.name,
            pageNumber: i + 1,
            totalPages: result.images.length
          })));
        } else if (result.image) {
          // Image simple
          allImages.push(result.image);
          allDimensions.push({ 
            width: result.width, 
            height: result.height,
            fileName: file.name,
            pageNumber: 1,
            totalPages: 1
          });
        }
        fileNames.push(file.name);
      } catch (error) {
        console.error('Erreur lors du chargement du fichier:', error);
      }
    }

    setExtractionState(prev => ({
      ...prev,
      uploadedFiles: files,
      filePreviews: allImages,
      previewDimensions: allDimensions,
      currentPdfIndex: 0,
      extractedDataList: Array(allImages.length).fill({}),
      isProcessing: false
    }));

    showNotification(
      `${files.length} fichier(s) chargé(s) avec succès (${allImages.length} page(s) au total)`,
      'success'
    );
  };

  // Navigation dans le défilement horizontal
  const scrollToIndex = (index) => {
    setExtractionState(prev => ({ ...prev, currentPdfIndex: index }));
    
    // Faire défiler la vue miniature vers l'élément sélectionné
    if (horizontalScrollRef.current) {
      const thumbnailWidth = 120; // largeur approximative d'une miniature
      const scrollPosition = index * (thumbnailWidth + 12); // +12 pour le gap
      horizontalScrollRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      });
    }
  };

  const goToPrevPdf = () => {
    const newIndex = Math.max(0, extractionState.currentPdfIndex - 1);
    scrollToIndex(newIndex);
  };

  const goToNextPdf = () => {
    const newIndex = Math.min(extractionState.filePreviews.length - 1, extractionState.currentPdfIndex + 1);
    scrollToIndex(newIndex);
  };

  // Extraction de toutes les pages
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

  // Helper functions pour filtrer les valeurs
  const filterValue = (val, fieldKey) => {
    if (!val) return '';
    if (fieldKey === 'fournisseur') return val;
    const matches = val.match(/[0-9.,;:/\\-]+/g);
    return matches ? matches.join('') : '';
  };

  // Export functions
  const exportData = (format) => {
    const dataToExport = extractionState.extractedDataList.map((data, index) => ({
      ...data,
      pageNumber: index + 1,
      fileName: extractionState.previewDimensions[index]?.fileName || `page_${index + 1}`,
      dateExtraction: new Date().toISOString()
    }));

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extraction_batch_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const headers = ['pageNumber', 'fileName', ...EXTRACTION_FIELDS.map(f => f.key), 'dateExtraction'];
      const csvData = [
        headers.join(','),
        ...dataToExport.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extraction_batch_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    showNotification(`Données de ${dataToExport.length} page(s) exportées en ${format.toUpperCase()}`, 'success');
  };

  const copyToClipboard = () => {
    const currentData = extractionState.extractedDataList[extractionState.currentPdfIndex] || {};
    const text = EXTRACTION_FIELDS
      .map(field => `${field.label}: ${filterValue(currentData[field.key], field.key) || 'N/A'}`)
      .join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      showNotification('Données de la page actuelle copiées', 'success');
    });
  };

  // Fonctions DataPrep (simplifées pour cet exemple)
  const handleDataPrepFileUpload = async (event) => {
    // Implementation simplifiée
    showNotification('Fonction de configuration à implémenter', 'info');
  };

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
                  
                  {/* Upload button */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-blue-100 mb-2">
                      Fichiers PDF/Images
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        multiple
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
                          {extractionState.filePreviews.length > 0 ? `${extractionState.filePreviews.length} page(s) chargée(s)` : 'Sélectionner des fichiers'}
                        </span>
                      </label>
                    </div>
                  </div>
                  
                  {/* Extraction button */}
                  <button
                    onClick={extractAllPdfs}
                    disabled={extractionState.isProcessing || extractionState.filePreviews.length === 0}
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
                        Extraire toutes les pages
                      </>
                    )}
                  </button>
                </div>

                {/* Données extraites */}
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Données Extraites
                  </h3>
                  
                  {extractionState.filePreviews.length > 0 && (
                    <div className="mb-2 text-xs text-blue-200">
                      Page actuelle: <span className="font-mono">
                        {extractionState.previewDimensions[extractionState.currentPdfIndex]?.fileName || 'Aucun fichier'} 
                        {extractionState.previewDimensions[extractionState.currentPdfIndex]?.totalPages > 1 && 
                          ` (${extractionState.previewDimensions[extractionState.currentPdfIndex]?.pageNumber}/${extractionState.previewDimensions[extractionState.currentPdfIndex]?.totalPages})`
                        }
                      </span>
                    </div>
                  )}
                  
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

                  {/* Export/copy buttons */}
                  {extractionState.extractedDataList.length > 0 && (
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
                          JSON (Toutes)
                        </button>
                        <button
                          onClick={() => exportData('csv')}
                          className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-400/30 text-blue-100 rounded-lg hover:bg-blue-500/30 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          CSV (Toutes)
                        </button>
                        <button
                          onClick={copyToClipboard}
                          className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 border border-purple-400/30 text-purple-100 rounded-lg hover:bg-purple-500/30 transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                          Copier (Actuelle)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Document display section */}
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
                    <>
                      

                      {/* Aperçu principal */}
                      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                        <div id="pdf-preview-container" className="relative flex-1 flex items-center justify-center w-full h-full overflow-auto" style={{ minHeight: '60vh', height: '60vh' }}>
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
                        
                        {/* Info du document actuel */}
                        <div className="mt-4 text-center">
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

                      {/* Défilement horizontal des miniatures */}
                      {extractionState.filePreviews.length > 1 && (
                        <div className="mb-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={goToPrevPdf}
                              disabled={extractionState.currentPdfIndex === 0}
                              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4 text-white" />
                            </button>
                            
                            <div 
                              ref={horizontalScrollRef}
                              className="flex-1 overflow-x-auto scrollbar-hide"
                              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                              <div className="flex gap-3 pb-2">
                                {extractionState.filePreviews.map((preview, index) => (
                                  <div
                                    key={index}
                                    onClick={() => scrollToIndex(index)}
                                    className={`flex-shrink-0 w-24 h-32 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                                      index === extractionState.currentPdfIndex
                                        ? 'border-blue-400 shadow-lg scale-105'
                                        : 'border-white/30 hover:border-white/50'
                                    }`}
                                  >
                                    <img
                                      src={preview}
                                      alt={`Page ${index + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    {/* <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-1 py-0.5 text-center">
                                      {extractionState.previewDimensions[index]?.fileName}
                                    </div> */}
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <button
                              onClick={goToNextPdf}
                              disabled={extractionState.currentPdfIndex === extractionState.filePreviews.length - 1}
                              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronRight className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/30 rounded-xl">
                      {extractionState.isProcessing ? (
                        <>
                          <Loader2 className="w-12 h-12 text-blue-200 animate-spin mb-4" />
                          <p className="text-blue-100">Génération des aperçus...</p>
                        </>
                      ) : (
                        <>
                          <FileText className="w-12 h-12 text-blue-200 mb-4" />
                          <p className="text-blue-100">Sélectionnez des fichiers pour voir les aperçus</p>
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
            <div className="text-center text-blue-200">
              Interface de configuration à implémenter...
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default Extractor;