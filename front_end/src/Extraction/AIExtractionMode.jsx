import React, { useState, useRef, useEffect } from "react";
import { Upload, FileText, X, Play, CheckCircle, AlertCircle, Loader2, Database, Save } from "lucide-react";
import ExtractionSidebar from "./ExtractionSidebar";
import ExtractionPreview from "./ExtractionPreview";
import "./AIExtractionMode.css";

const AIExtractionMode = () => {
  const [files, setFiles] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [extractionResults, setExtractionResults] = useState(null);
  const [extractionState, setExtractionState] = useState({
    selectedFiles: [],
    filePreviews: [],
    currentIndex: 0,
    currentPdfIndex: 0, // Ajouté pour ExtractionSidebar
    extractedData: [],
    extractedDataList: [], // Ajouté pour ExtractionSidebar
    isExtractionComplete: false,
    isProcessing: false, // Ajouté pour ExtractionSidebar
    processingMode: 'ai' // Ajouté pour ExtractionSidebar
  });
     const [extractDrawState, setExtractDrawState] = useState({});
   const fileInputRef = useRef(null);
 
   // Effet pour synchroniser l'affichage des données quand on change de page
   useEffect(() => {
     if (extractionState.isExtractionComplete && extractionState.currentPdfIndex >= 0) {
       updateSidebarData(extractionState.currentPdfIndex);
     }
   }, [extractionState.currentPdfIndex, extractionState.isExtractionComplete]);

  const handleFileUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files);
    
    if (!selectedFiles.length) {
      return;
    }

    setIsLoading(true);

    try {
      const newFiles = [];
      
      for (const [fileIndex, file] of selectedFiles.entries()) {
        const formData = new FormData();
        formData.append("file", file);

        // Utiliser le même endpoint que la section "Documents à traiter"
        const response = await fetch('http://localhost:8000/upload-basic', {
          method: "POST",
          body: formData,
        });
        
        const result = await response.json();

        if (result.success) {
          if (result.images) {
            // Handle multi-page PDFs - même logique que useSetup
            result.images.forEach((img, index) => {
              const uniqueId = `${file.name}-${file.lastModified}-${Date.now()}-${index}`;
              const pageFile = {
                id: uniqueId,
                file: file, // Garder le fichier original
                name: file.name,
                type: 'image/jpeg', // Après conversion côté backend
                size: file.size,
                isPDF: true,
                pageNumber: index + 1,
                totalPages: result.images.length,
                preview: img, // L'image convertie par le backend
                originalFile: file
              };
              newFiles.push(pageFile);
            });
          } else {
            // Handle single page documents or images
            const uniqueId = `${file.name}-${file.lastModified}-${Date.now()}`;
            const imageFile = {
              id: uniqueId,
              file: file,
              name: file.name,
              type: file.type,
              size: file.size,
              isPDF: false,
              pageNumber: 1,
              totalPages: 1,
              preview: result.preview || URL.createObjectURL(file),
              originalFile: file
            };
            newFiles.push(imageFile);
          }
        }
      }

      // Ajouter les nouveaux fichiers
      setFiles(prev => [...prev, ...newFiles]);
      
    } catch (error) {
      console.error("Erreur lors du téléchargement des fichiers:", error);
      // Fallback : créer des entrées simples
      const fallbackFiles = selectedFiles.map((file, index) => ({
        id: Date.now() + Math.random() + index,
        file: file,
        name: file.name,
        type: file.type,
        size: file.size,
        isPDF: file.type === 'application/pdf',
        pageNumber: 1,
        totalPages: 1,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        originalFile: file
      }));
      setFiles(prev => [...prev, ...fallbackFiles]);
    } finally {
      setIsLoading(false);
    }
    
    event.target.value = null; // Reset input
  };



  const removeFile = (fileId) => {
    setFiles(prev => {
      const fileToRemove = prev.find(f => f.id === fileId);
      if (fileToRemove && fileToRemove.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  const clearAllFiles = () => {
    files.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setFiles([]);
    setExtractionResults(null);
         // Réinitialiser l'état d'extraction
     setExtractionState(prev => ({
       ...prev,
       selectedFiles: [],
       filePreviews: [],
       extractedData: [],
       extractedDataList: [],
       currentPdfIndex: 0,
       isExtractionComplete: false,
       isProcessing: false,
       processingMode: 'ai'
     }));
  };

  const handleExtractAll = async () => {
    if (files.length === 0) return;

    setIsExtracting(true);
    setExtractionResults(null);

    try {
             const formData = new FormData();
       files.forEach(file => {
         // Pour les PDFs, envoyer le fichier original avec l'information de la page
         if (file.isPDF) {
           formData.append('files', file.originalFile);
           formData.append('page_info', JSON.stringify({
             page: file.pageNumber,
             total_pages: file.totalPages
           }));
         } else {
           formData.append('files', file.file);
         }
       });

      const response = await fetch('http://localhost:8000/api/ai-extract', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setExtractionResults(result.results);
        
                 // Traiter les résultats et créer l'état d'extraction
         const processedFiles = [];
         const processedPreviews = [];
         const processedData = [];
         
         // S'assurer que nous avons le bon nombre de résultats
         const maxLength = Math.max(result.results.length, files.length);
         
         for (let index = 0; index < maxLength; index++) {
           const fileResult = result.results[index];
           const originalFile = files[index];
           
           if (fileResult && fileResult.success && fileResult.extracted_data) {
             // Créer un objet fichier traité avec le vrai aperçu
             const processedFile = {
               id: index,
               name: originalFile ? originalFile.name : `Fichier ${index + 1}`,
               type: 'image/jpeg', // Après conversion PDF -> image
               size: originalFile ? originalFile.size : 0,
               preview: originalFile ? originalFile.preview : null
             };
             
             processedFiles.push(processedFile);
             // Utiliser le vrai aperçu du fichier original
             processedPreviews.push(originalFile ? originalFile.preview : null);
             
             // Créer les données extraites avec une structure complète
             const extractedData = {
               fournisseur: '',
               numFacture: '',
               date: '',
               HT: '',
               TTC: '',
               TVA: '',
               taux: ''
             };
             
             // Remplir avec les données extraites si disponibles
             if (fileResult.extracted_data) {
               Object.entries(fileResult.extracted_data).forEach(([field, values]) => {
                 if (values && values.length > 0) {
                   extractedData[field] = values[0];
                 }
               });
             }
             
             processedData.push(extractedData);
           }
         }

                 // Mettre à jour l'état d'extraction avec la structure attendue par ExtractionSidebar
         setExtractionState(prev => ({
           ...prev,
           selectedFiles: processedFiles,
           filePreviews: processedPreviews,
           extractedDataList: processedData, // Changé de extractedData à extractedDataList
           currentPdfIndex: 0, // Ajouté pour ExtractionSidebar
           isExtractionComplete: true,
           isProcessing: false // Ajouté pour ExtractionSidebar
         }));

      } else {
        setExtractionResults([{
          error: result.error || "Erreur lors de l'extraction"
        }]);
      }
    } catch (error) {
      console.error('Erreur lors de l\'extraction:', error);
      setExtractionResults([{
        error: "Erreur de connexion au serveur"
      }]);
    } finally {
      setIsExtracting(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType) => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    return '📁';
  };

  // Fonctions nécessaires pour l'interface par défaut
  const extractAllPdfs = () => {
    // Cette fonction est déjà gérée par handleExtractAll
    console.log('Extraction déjà effectuée');
  };

  const openSaveModal = () => {
    // Ouvrir le modal de sauvegarde
    console.log('Ouvrir modal de sauvegarde');
  };

  const launchFoxPro = () => {
    // Lancer FoxPro
    console.log('Lancer FoxPro');
  };

     const scrollToIndex = (index) => {
     setExtractionState(prev => ({ ...prev, currentPdfIndex: index }));
   };
 
   const goToPrevPdf = () => {
     setExtractionState(prev => ({
       ...prev,
       currentPdfIndex: Math.max(0, prev.currentPdfIndex - 1)
     }));
   };
 
   const goToNextPdf = () => {
     setExtractionState(prev => ({
       ...prev,
       currentPdfIndex: Math.min(prev.selectedFiles.length - 1, prev.currentPdfIndex + 1)
     }));
   };

     const setHoveredIndex = (index) => {
     // Gérer l'index survolé
   };
 
   const setCurrentStep = (step) => {
     // Gérer l'étape actuelle
   };
 
   const handleSetIsLoading = (loading) => {
     // Gérer le chargement
   };
 
   const setDataPrepState = (state) => {
     // Gérer l'état de préparation des données
   };
 
   // Fonction pour gérer le clic sur les miniatures
   const handleThumbnailClick = (index) => {
     setExtractionState(prev => ({ ...prev, currentPdfIndex: index }));
     updateSidebarData(index);
   };
 
   // Fonction pour mettre à jour les données affichées dans la sidebar
   const updateSidebarData = (index) => {
     if (extractionState.extractedDataList && extractionState.extractedDataList[index]) {
       // Les données sont déjà dans extractedDataList, pas besoin de les modifier
       // ExtractionSidebar les affichera automatiquement selon currentPdfIndex
       console.log(`Affichage des données de la page ${index + 1}`);
     }
   };

    // Si l'extraction est terminée, afficher l'interface par défaut
  if (extractionState.isExtractionComplete) {
    return (
      <div className="extraction-container">
        <div className="extraction-content">
          <div className="extraction-header">
            <h1 className="extraction-title">Extraction AI - Données Extraites</h1>
            <p>Vos factures ont été traitées par le modèle YOLO. Vous pouvez maintenant les enregistrer.</p>
          </div>

          <div className="extraction-grid">
            {/* Sidebar with extracted data */}
                         <ExtractionSidebar
               extractionState={extractionState}
               setExtractionState={setExtractionState}
               extractAllPdfs={extractAllPdfs}
               openSaveModal={openSaveModal}
               launchFoxPro={launchFoxPro}
               filterValue={(value, key) => value || ''} // Fonction filterValue simple
               EXTRACTION_FIELDS={[
                 { key: 'fournisseur', label: 'Fournisseur' },
                 { key: 'numFacture', label: 'Numéro de Facture' },
                 { key: 'date', label: 'Date' },
                 { key: 'HT', label: 'Montant HT' },
                 { key: 'TTC', label: 'Montant TTC' },
                 { key: 'TVA', label: 'Montant TVA' },
                 { key: 'taux', label: 'Taux TVA' }
               ]}
               extractDrawState={extractDrawState}
               setExtractDrawState={setExtractDrawState}
               showNotification={() => {}}
             />

            {/* Main document preview area */}
                         <ExtractionPreview
               extractionState={{
                 ...extractionState,
                 selectedFiles: extractionState.selectedFiles || [],
                 filePreviews: (extractionState.filePreviews || []).map(preview => 
                   preview || { preview: null, name: 'Aperçu non disponible' }
                 ),
                 currentIndex: extractionState.currentPdfIndex // Synchroniser avec currentPdfIndex
               }}
               scrollToIndex={handleThumbnailClick} // Utiliser handleThumbnailClick pour la navigation
               goToPrevPdf={goToPrevPdf}
               goToNextPdf={goToNextPdf}
               hoveredIndex={null}
               setHoveredIndex={setHoveredIndex}
               isExtractionComplete={true}
               mappings={{}}
               setCurrentStep={setCurrentStep}
               setIsLoading={handleSetIsLoading}
               setDataPrepState={setDataPrepState}
             />
          </div>
        </div>
      </div>
    );
  }

  // Interface d'upload et d'extraction
  return (
    <div className="ai-extraction-mode">
      <div className="ai-extraction-header">
        <h1>Extraction avec Modèle AI</h1>
        <p>Votre modèle YOLO détectera automatiquement les champs des factures</p>
      </div>

      <div className="ai-extraction-content">
        {/* Section Upload des fichiers */}
        <div className="file-upload-section">
          <div className="section-header">
            <h2>1. Sélection des fichiers</h2>
            <p>Uploadez vos factures (PDF, PNG, JPG, etc.)</p>
          </div>
          
          <div className="upload-area">
                         <input
               ref={fileInputRef}
               type="file"
               multiple
               accept=".pdf,.png,.jpg,.jpeg,.bmp,.tiff"
               onChange={handleFileUpload}
               className="file-input"
               disabled={isLoading}
             />
                         <div className="upload-placeholder" onClick={() => fileInputRef.current?.click()}>
               {isLoading ? (
                 <>
                   <Loader2 className="upload-icon animate-spin" />
                   <div className="upload-text">
                     <strong>Conversion en cours...</strong>
                     <span>Veuillez patienter pendant le traitement</span>
                   </div>
                 </>
               ) : (
                 <>
                   <Upload className="upload-icon" />
                   <div className="upload-text">
                     <strong>Cliquez pour sélectionner des fichiers</strong>
                     <span>ou glissez-déposez vos factures ici</span>
                   </div>
                   <div className="upload-formats">
                     PDF, PNG, JPG, JPEG, BMP, TIFF acceptés
                   </div>
                 </>
               )}
             </div>
          </div>

          {/* Liste des fichiers */}
          {files.length > 0 && (
            <div className="files-list">
              <div className="files-header">
                <h3>Fichiers sélectionnés ({files.length})</h3>
                <button 
                  onClick={clearAllFiles}
                  className="clear-all-btn"
                  disabled={isExtracting}
                >
                  <X className="w-4 h-4" />
                  Tout effacer
                </button>
              </div>
              
              <div className="files-grid">
                {files.map((file, index) => (
                  <div key={file.id} className="file-item">
                                         <div className="file-preview">
                       {file.preview ? (
                         <img 
                           src={file.preview} 
                           alt={file.name}
                           className="file-image"
                         />
                       ) : (
                         <div className="file-icon">
                           {file.isPDF ? '📄' : '🖼️'}
                         </div>
                       )}
                      <button
                        onClick={() => removeFile(file.id)}
                        className="remove-file-btn"
                        disabled={isExtracting}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                                         <div className="file-info">
                       <div className="file-name" title={file.name}>
                         {file.isPDF ? `${file.name} - Page ${file.pageNumber}/${file.totalPages}` : file.name}
                       </div>
                       <div className="file-details">
                         {file.isPDF ? `Page ${file.pageNumber}` : formatFileSize(file.size)}
                       </div>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section Extraction */}
        <div className="extraction-section">
          <div className="section-header">
            <h2>2. Extraction des données</h2>
            <p>Lancez l'extraction automatique avec le modèle YOLO</p>
          </div>
          
          <button
            onClick={handleExtractAll}
            disabled={files.length === 0 || isExtracting}
            className="extract-button"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Extraction en cours...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Extraire toutes les factures
              </>
            )}
          </button>
        </div>

        {/* Section Résultats */}
        {extractionResults && (
          <div className="results-section">
            <div className="section-header">
              <h2>3. Résultats de l'extraction</h2>
              <p>Données extraites par le modèle AI</p>
            </div>
            
            <div className="results-content">
              {/* Résultats par fichier */}
              <div className="file-results">
                <h3>Résultats par fichier</h3>
                {extractionResults.map((result, fileIndex) => (
                  <div key={fileIndex} className="file-result-card">
                                         <div className="file-result-header">
                       <h4>📄 {files[fileIndex]?.isPDF ? 
                         `${files[fileIndex].name} - Page ${files[fileIndex].pageNumber}` : 
                         (result.file_path || `Fichier ${fileIndex + 1}`)
                       }</h4>
                       {result.success ? (
                         <span className="success-badge">✅ Succès</span>
                       ) : (
                         <span className="error-badge">❌ Erreur</span>
                       )}
                     </div>
                    
                    {result.error ? (
                      <div className="error-detail">
                        <AlertCircle className="w-4 h-4" />
                        <span>Erreur: {result.error}</span>
                      </div>
                    ) : result.extracted_data ? (
                      <div className="extracted-fields">
                        <div className="fields-grid">
                          {Object.entries(result.extracted_data).map(([field, values]) => (
                            <div key={field} className="field-group">
                              <label>{field}</label>
                              <input
                                type="text"
                                value={Array.isArray(values) ? values.join(', ') : values}
                                readOnly
                                placeholder={`${field} extrait automatiquement`}
                                className="field-input"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="no-data">
                        <span>Aucune donnée extraite</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Résumé global */}
              <div className="global-summary">
                <h3>Résumé global</h3>
                <div className="summary-stats">
                  <div className="stat-item">
                    <span className="stat-label">Fichiers traités:</span>
                    <span className="stat-value">{extractionResults.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Succès:</span>
                    <span className="stat-value success">
                      {extractionResults.filter(r => r.success).length}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Erreurs:</span>
                    <span className="stat-value error">
                      {extractionResults.filter(r => !r.success).length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIExtractionMode;
