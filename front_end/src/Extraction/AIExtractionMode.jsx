import React, { useState, useRef } from "react";
import { Upload, FileText, X, Play, CheckCircle, AlertCircle, Loader2, Database, Save } from "lucide-react";
import ExtractionSidebar from "./ExtractionSidebar";
import ExtractionPreview from "./ExtractionPreview";
import { useExtraction } from "../hooks/useExtraction";
import "./AIExtractionMode.css";

const AIExtractionMode = () => {
  const [files, setFiles] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [extractionResults, setExtractionResults] = useState(null);
  const [currentStep, setCurrentStep] = useState('upload'); // 'upload' ou 'extraction'
  const [extractionState, setExtractionState] = useState({
    selectedFiles: [],
    filePreviews: [],
    currentIndex: 0,
    currentPdfIndex: 0,
    extractedData: [],
    extractedDataList: [],
    isExtractionComplete: false,
    isProcessing: false, // Initialement pas en cours de traitement
    processingMode: 'ai',
    extractionBoxes: [],
    selectedModelId: null,
    selectedModelName: null
  });
  const [extractDrawState, setExtractDrawState] = useState({});
  const fileInputRef = useRef(null);

  // Fonction de notification simple
  const showNotification = (message, type = 'info') => {
    console.log(`${type.toUpperCase()}: ${message}`);
    // Ici vous pourriez intégrer avec votre système de notifications
  };

  // Utiliser le hook useExtraction pour les vraies fonctions d'enregistrement
  const { saveCorrectedData, launchFoxPro, saveAllCorrectedDataAndLaunchFoxPro } = useExtraction(extractionState, setExtractionState, showNotification);

  // Fonction pour mettre à jour les données affichées dans la sidebar
  const updateSidebarData = (index) => {
    if (extractionState && 
        extractionState.extractedDataList && 
        extractionState.extractedDataList[index]) {
      // Les données sont déjà dans extractedDataList, pas besoin de les modifier
      // ExtractionSidebar les affichera automatiquement selon currentPdfIndex
      console.log(`Affichage des données de la page ${index + 1}`);
    }
  };

  const handleValidate = () => {
    if (files.length === 0) {
      return;
    }
    
    // Basculer vers la deuxième partie (affichage des fichiers et champs)
    setCurrentStep('extraction');
    
    // Mettre à jour l'état d'extraction avec les fichiers uploadés
    // et s'assurer que le premier fichier est sélectionné
    setExtractionState(prev => ({
      ...prev,
      selectedFiles: files.map((file, index) => ({
        id: index,
        name: file.name,
        type: file.type,
        size: file.size,
        preview: file.preview
      })),
      filePreviews: files.map(file => file.preview),
      extractedDataList: files.map(() => ({
        fournisseur: '',
        numeroFacture: '',
        dateFacturation: '',
        tauxTVA: '',
        montantHT: '',
        montantTVA: '',
        montantTTC: ''
      })),
      currentPdfIndex: 0, // Premier fichier sélectionné par défaut
      isExtractionComplete: false,
      isProcessing: false,
      processingMode: 'ai'
    }));
  };

  const handleFileUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files);
    
    if (!selectedFiles.length) {
      return;
    }

    console.log('🚀 === DÉBUT UPLOAD ===');
    console.log('📁 Fichiers sélectionnés:', selectedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })));

    setIsLoading(true);

    try {
      const newFiles = [];
      
      for (const [fileIndex, file] of selectedFiles.entries()) {
        console.log(`\n📄 Traitement du fichier ${fileIndex + 1}: ${file.name}`);
        
        const formData = new FormData();
        formData.append("file", file);

        console.log(`📤 Envoi vers /upload-basic pour le fichier: ${file.name}`);

        // Utiliser le même endpoint que la section "Documents à traiter"
        const response = await fetch('http://localhost:8000/upload-basic', {
          method: "POST",
          body: formData,
        });
        
        const result = await response.json();
        console.log(`📥 Réponse du backend pour ${file.name}:`, result);

        if (result.success) {
          if (result.images) {
            console.log(`🔄 PDF multi-pages détecté: ${result.images.length} pages`);
            
            // Handle multi-page PDFs - même logique que useSetup
            result.images.forEach((img, index) => {
              const uniqueId = `${file.name}-${file.lastModified}-${Date.now()}-${index}`;
              console.log(`📄 Création de la page ${index + 1}/${result.images.length} pour ${file.name}`);
              console.log(`🆔 ID unique généré: ${uniqueId}`);
              
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
              
              console.log(`📋 Page ${index + 1} créée:`, {
                id: pageFile.id,
                pageNumber: pageFile.pageNumber,
                totalPages: pageFile.totalPages,
                previewLength: pageFile.preview ? pageFile.preview.length : 0
              });
              
              newFiles.push(pageFile);
            });
          } else {
            console.log(`🖼️ Document simple détecté: ${file.name}`);
            
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
            
            console.log(`📋 Fichier simple créé:`, {
              id: imageFile.id,
              type: imageFile.type,
              previewLength: imageFile.preview ? imageFile.preview.length : 0
            });
            
            newFiles.push(imageFile);
          }
        }
      }

      console.log(`\n📊 === RÉSUMÉ UPLOAD ===`);
      console.log(`📁 Nouveaux fichiers créés: ${newFiles.length}`);
      newFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name} - Page ${file.pageNumber}/${file.totalPages} - ID: ${file.id}`);
      });

      // Ajouter les nouveaux fichiers
      const updatedFiles = [...files, ...newFiles];
      setFiles(updatedFiles);
      
      console.log(`📊 Total des fichiers après upload: ${updatedFiles.length}`);
      
    } catch (error) {
      console.error("❌ Erreur lors du téléchargement des fichiers:", error);
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
      const updatedFiles = [...files, ...fallbackFiles];
      setFiles(updatedFiles);
    } finally {
      setIsLoading(false);
    }
    
    event.target.value = null; // Reset input
  };

  const removeFile = (fileId) => {
    console.log(`🗑️ Suppression du fichier avec ID: ${fileId}`);
    
    // Trouver le fichier avant suppression pour le log
    const fileToRemove = files.find(f => f.id === fileId);
    if (fileToRemove) {
      console.log(`📄 Fichier à supprimer:`, {
        name: fileToRemove.name,
        pageNumber: fileToRemove.pageNumber,
        totalPages: fileToRemove.totalPages,
        isPDF: fileToRemove.isPDF
      });
    }
    
    const updatedFiles = files.filter(f => f.id !== fileId);
    setFiles(updatedFiles);
    
    console.log(`📊 Fichiers restants après suppression: ${updatedFiles.length}`);
    updatedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name} - Page ${file.pageNumber}/${file.totalPages} - ID: ${file.id}`);
    });
  };

  const clearAllFiles = () => {
    console.log('🧹 === SUPPRESSION DE TOUS LES FICHIERS ===');
    console.log(`📁 Nombre de fichiers avant suppression: ${files.length}`);
    
    files.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setFiles([]);
    setExtractionResults(null);
    setCurrentStep('upload'); // Retourner à la première étape
    setExtractionState(prev => ({
      ...prev,
      selectedFiles: [],
      filePreviews: [],
      extractedData: [],
      extractedDataList: [],
      currentPdfIndex: 0,
      isExtractionComplete: false,
      isProcessing: false, // Remettre à false
      processingMode: 'ai',
      extractionBoxes: [],
      selectedModelId: null,
      selectedModelName: null
    }));
    
    console.log('✅ Tous les fichiers ont été supprimés');
  };

  const handleExtractAll = async () => {
    if (files.length === 0) return;

    console.log('🚀 === DÉBUT EXTRACTION ===');
    console.log(`📁 Nombre de fichiers à traiter: ${files.length}`);
    
    // Log détaillé de chaque fichier avant envoi
    files.forEach((file, index) => {
      console.log(`📄 Fichier ${index + 1}:`, {
        id: file.id,
        name: file.name,
        pageNumber: file.pageNumber,
        totalPages: file.totalPages,
        isPDF: file.isPDF,
        hasOriginalFile: !!file.originalFile,
        originalFileName: file.originalFile ? file.originalFile.name : 'N/A',
        hasPreview: !!file.preview
      });
    });

    setIsExtracting(true);
    setExtractionResults(null);
    
    // Mettre à jour l'état pour indiquer que l'extraction est en cours
    setExtractionState(prev => ({
      ...prev,
      isProcessing: true
    }));

    try {
      const formData = new FormData();
      
      console.log('\n📤 === PRÉPARATION DES DONNÉES POUR LE BACKEND ===');
      
      files.forEach((file, index) => {
        if (file.isPDF) {
          // ✅ NOUVEAU : Envoyer seulement la page convertie (pas le fichier original)
          if (file.preview) {
            console.log(`📄 PDF ${index + 1}: Envoi de la page ${file.pageNumber} convertie en image`);
            
            // Convertir le base64 en Blob pour l'envoi
            const base64Data = file.preview;
            const byteCharacters = atob(base64Data.split(',')[1]);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });
            
            // Créer un fichier à partir du blob
            const pageFile = new File([blob], `${file.name}_page_${file.pageNumber}.jpg`, { type: 'image/jpeg' });
            
            formData.append('files', pageFile);
            console.log(`📤 Page ${file.pageNumber} envoyée: ${pageFile.name} (${pageFile.size} bytes)`);
          } else {
            console.error(`❌ Pas d'aperçu disponible pour la page ${file.pageNumber} de ${file.name}`);
          }
        } else {
          console.log(`🖼️ Image ${index + 1}: Envoi du fichier "${file.file.name}"`);
          formData.append('files', file.file);
        }
      });

      console.log(`\n📤 Envoi vers /api/ai-extract avec ${files.length} pages/images`);
      console.log('📋 Contenu du FormData:');
      for (let [key, value] of formData.entries()) {
        if (key === 'files') {
          console.log(`  ${key}: ${value.name} (${value.size} bytes)`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }

      const response = await fetch('http://localhost:8000/api/ai-extract', {
        method: 'POST',
        body: formData
      });

      console.log(`📥 Réponse du backend: ${response.status} ${response.statusText}`);

      const result = await response.json();
      console.log('📊 Résultat de l\'extraction:', result);

      if (result.success) {
        setExtractionResults(result.results);
        
        // Debug: Afficher les données reçues
        console.log('🔍 Données reçues du backend YOLO:', result.results);
        
        // Traiter les résultats et créer l'état d'extraction
        const processedFiles = [];
        const processedPreviews = [];
        const processedData = [];
        
        // S'assurer que nous avons le bon nombre de résultats
        const maxLength = Math.max(result.results.length, files.length);
        console.log(`📊 Traitement de ${maxLength} résultats (${result.results.length} du backend, ${files.length} fichiers)`);
        
        for (let index = 0; index < maxLength; index++) {
          const fileResult = result.results[index];
          const originalFile = files[index];
          
          console.log(`\n📄 Traitement du résultat ${index + 1}:`);
          console.log(`  - Fichier original: ${originalFile ? originalFile.name : 'N/A'}`);
          console.log(`  - Résultat backend:`, fileResult);
          
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
              numeroFacture: '',
              dateFacturation: '',
              tauxTVA: '',
              montantHT: '',
              montantTVA: '',
              montantTTC: ''
            };
            
            // Remplir avec les données extraites si disponibles
            if (fileResult.extracted_data) {
              console.log(`🔍 Données extraites pour le fichier ${index}:`, fileResult.extracted_data);
              console.log(`🔑 Clés disponibles:`, Object.keys(fileResult.extracted_data));
              
              // Mapping des clés YOLO vers les clés du frontend
              const fieldMapping = {
                'fournisseur': 'fournisseur',
                'numFacture': 'numeroFacture', 
                'date': 'dateFacturation',  // YOLO détecte 'date', pas 'dateFacturation'
                'taux': 'tauxTVA',
                'HT': 'montantHT',
                'TVA': 'montantTVA',
                'TTC': 'montantTTC'
              };
              
              Object.entries(fileResult.extracted_data).forEach(([yoloField, values]) => {
                console.log(`🔍 Traitement de la clé YOLO: ${yoloField} = ${values}`);
                if (values && values.length > 0) {
                  // Trouver la clé correspondante dans le mapping
                  const frontendKey = fieldMapping[yoloField];
                  if (frontendKey) {
                    let value = values[0];
                    
                    // Transformer la date avant de la stocker
                    if (frontendKey === 'dateFacturation' && value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                      const [day, month, year] = value.split('/');
                      value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                      console.log(`📅 Conversion date stockée: ${values[0]} -> ${value}`);
                    }
                    
                    extractedData[frontendKey] = value;
                    console.log(`✅ Mapping: ${yoloField} -> ${frontendKey} = ${value}`);
                  } else {
                    console.log(`❌ Clé YOLO non mappée: ${yoloField} = ${values[0]}`);
                  }
                }
              });
              
              console.log(`📊 Données finales pour le fichier ${index}:`, extractedData);
            }
            
            processedData.push(extractedData);
          }
        }

        console.log(`\n📊 === RÉSUMÉ TRAITEMENT ===`);
        console.log(`📁 Fichiers traités: ${processedFiles.length}`);
        console.log(`🖼️ Aperçus: ${processedPreviews.length}`);
        console.log(`📋 Données extraites: ${processedData.length}`);

        // Mettre à jour l'état d'extraction avec la structure attendue par ExtractionSidebar
        setExtractionState(prev => ({
          ...prev,
          selectedFiles: processedFiles,
          filePreviews: processedPreviews,
          extractedDataList: processedData,
          currentPdfIndex: 0,
          isExtractionComplete: true,
          isProcessing: false // L'extraction est terminée
        }));

      } else {
        console.error('❌ Erreur lors de l\'extraction:', result.error);
        setExtractionResults([{
          error: result.error || "Erreur lors de l'extraction"
        }]);
        
        // En cas d'erreur, remettre isProcessing à false
        setExtractionState(prev => ({
          ...prev,
          isProcessing: false
        }));
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'extraction:', error);
      setExtractionResults([{
        error: "Erreur de connexion au serveur"
      }]);
      
      // En cas d'erreur, remettre isProcessing à false
      setExtractionState(prev => ({
        ...prev,
        isProcessing: false
      }));
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

  // Fonction pour nettoyer et formater les valeurs affichées
  const filterValue = (value, fieldKey) => {
    if (!value) return '';
    
    let cleanedValue = value.toString().trim();
    
    // Nettoyage spécifique selon le type de champ
    if (fieldKey === 'tauxTVA') {
      // Enlever le symbole % et les espaces
      cleanedValue = cleanedValue.replace(/%/g, '').replace(/\s/g, '');
    } else if (fieldKey === 'montantHT' || fieldKey === 'montantTTC' || fieldKey === 'montantTVA') {
      // Enlever les espaces et symboles monétaires
      cleanedValue = cleanedValue.replace(/\s/g, '').replace(/[€$]/g, '');
      // Remplacer la virgule par un point pour la cohérence
      cleanedValue = cleanedValue.replace(/,/g, '.');
    } else if (fieldKey === 'dateFacturation') {
      // Convertir le format de date de "DD/MM/YYYY" vers "YYYY-MM-DD"
      if (cleanedValue.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = cleanedValue.split('/');
        cleanedValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        console.log(`📅 Conversion date: ${value} -> ${cleanedValue}`);
      }
    }
    
    return cleanedValue;
  };

  // Fonction pour ouvrir le modal de sauvegarde (utilise saveCorrectedData)
  const openSaveModal = async () => {
    try {
      await saveCorrectedData(extractionState.currentPdfIndex);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    }
  };

  // Fonction pour lancer FoxPro (utilise la vraie fonction du hook)
  const handleLaunchFoxPro = async () => {
    try {
      await launchFoxPro();
    } catch (error) {
      console.error('Erreur lors du lancement de FoxPro:', error);
    }
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

  const handleSetCurrentStep = (step) => {
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
              launchFoxPro={handleLaunchFoxPro}
              filterValue={filterValue}
              EXTRACTION_FIELDS={[
                { key: 'fournisseur', label: 'Fournisseur' },
                { key: 'numeroFacture', label: 'Numéro de Facture' },
                { key: 'dateFacturation', label: 'Date Facturation' },
                { key: 'tauxTVA', label: 'Taux TVA' },
                { key: 'montantHT', label: 'Montant HT' },
                { key: 'montantTVA', label: 'Montant TVA' },
                { key: 'montantTTC', label: 'Montant TTC' }
              ]}
              extractDrawState={extractDrawState}
              setExtractDrawState={setExtractDrawState}
              showNotification={showNotification}
            />

            {/* Main document preview area */}
            <ExtractionPreview
              extractionState={{
                ...extractionState,
                selectedFiles: extractionState.selectedFiles || [],
                filePreviews: (extractionState.filePreviews || []).map(preview => 
                  preview || { preview: null, name: 'Aperçu non disponible' }
                ),
                currentIndex: extractionState.currentPdfIndex
              }}
              scrollToIndex={handleThumbnailClick}
              goToPrevPdf={goToPrevPdf}
              goToNextPdf={goToNextPdf}
              hoveredIndex={null}
              setHoveredIndex={setHoveredIndex}
              isExtractionComplete={true}
              mappings={{}}
              setCurrentStep={handleSetCurrentStep}
              setIsLoading={handleSetIsLoading}
              setDataPrepState={setDataPrepState}
            />
          </div>
        </div>
      </div>
    );
  }

  // DEUXIÈME PARTIE : Affichage des fichiers et champs (après avoir cliqué sur "Valider")
  if (currentStep === 'extraction') {
    return (
      <div className="extraction-container">
        <div className="extraction-content">
          <div className="extraction-header">
            <h1 className="extraction-title">Extraction avec Modèle AI</h1>
            <p>Vos fichiers sont prêts pour l'extraction</p>
          </div>

          <div className="extraction-grid">
            {/* Sidebar with extracted data */}
            <ExtractionSidebar
              extractionState={extractionState}
              setExtractionState={setExtractionState}
              extractAllPdfs={handleExtractAll}
              openSaveModal={openSaveModal}
              launchFoxPro={handleLaunchFoxPro}
              filterValue={filterValue}
              EXTRACTION_FIELDS={[
                { key: 'fournisseur', label: 'Fournisseur' },
                { key: 'numeroFacture', label: 'Numéro de Facture' },
                { key: 'dateFacturation', label: 'Date Facturation' },
                { key: 'tauxTVA', label: 'Taux TVA' },
                { key: 'montantHT', label: 'Montant HT' },
                { key: 'montantTVA', label: 'Montant TVA' },
                { key: 'montantTTC', label: 'Montant TTC' }
              ]}
              extractDrawState={extractDrawState}
              setExtractDrawState={setExtractDrawState}
              showNotification={showNotification}
            />

            {/* Main document preview area */}
            <ExtractionPreview
              extractionState={extractionState}
              scrollToIndex={handleThumbnailClick}
              goToPrevPdf={goToPrevPdf}
              goToNextPdf={goToNextPdf}
              hoveredIndex={null}
              setHoveredIndex={setHoveredIndex}
              isExtractionComplete={false}
              mappings={{}}
              setCurrentStep={handleSetCurrentStep}
              setIsLoading={handleSetIsLoading}
              setDataPrepState={setDataPrepState}
            />
          </div>
        </div>
      </div>
    );
  }

  // PREMIÈRE PARTIE : Interface d'upload (par défaut)
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
          <button
            onClick={handleValidate}
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
                Valider
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIExtractionMode;
