import { useState, useCallback } from 'react';
import { Upload, FileText, Image, X, Loader2, CheckCircle, AlertCircle, Building, User, Receipt, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function Facture() {
  const [invoiceData, setInvoiceData] = useState({
    numeroFacture: '',
    fournisseur: '',
    client: '',
    tauxTVA: '',
    montantHT: '',
    montantTVA: '',
    montantTTC: ''
  });

  const [uploadedFile, setUploadedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState(null); // 'success', 'error', null
  const [extractionMessage, setExtractionMessage] = useState('');
  const [previewZoom, setPreviewZoom] = useState(1);

  const API_BASE_URL = 'http://localhost:8000'; // URL de votre API backend

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const extractDataFromFile = async (file) => {
    setIsExtracting(true);
    setExtractionStatus(null);
    setExtractionMessage('Extraction des données en cours avec PaddleOCR...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      // No need to append 'emetteur', backend will detect fournisseur automatically

      const response = await fetch(`${API_BASE_URL}/extract-data`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Extraction result:', result);

      if (result.success && result.data) {
        // Mapper les données extraites vers le formulaire
        setInvoiceData(prev => ({
          ...prev,
          numeroFacture: result.data.numeroFacture || prev.numeroFacture,
          fournisseur: result.data.fournisseur || prev.fournisseur,
          client: result.data.client || prev.client,
          tauxTVA: result.data.tauxTVA ? result.data.tauxTVA.toString() : prev.tauxTVA,
          montantHT: result.data.montantHT ? result.data.montantHT.toString() : prev.montantHT,
          montantTVA: result.data.montantTVA ? result.data.montantTVA.toString() : prev.montantTVA,
          montantTTC: result.data.montantTTC ? result.data.montantTTC.toString() : prev.montantTTC
        }));

        setExtractionStatus('success');
        
        // Compter les champs extraits
        const extractedFields = Object.values(result.data).filter(value => value !== null && value !== '').length;
        setExtractionMessage(`Extraction PaddleOCR réussie ! ${extractedFields} champs extraits.`);
      } else {
        throw new Error('Données non extraites correctement');
      }
    } catch (error) {
      console.error('Erreur lors de l\'extraction:', error);
      setExtractionStatus('error');
      setExtractionMessage(`Erreur: ${error.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = useCallback(async (file) => {
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      setUploadedFile(file);
      
      // Créer la prévisualisation
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(URL.createObjectURL(file));
      }

      // Lancer l'extraction automatique
      await extractDataFromFile(file);
    } else {
      alert('Veuillez sélectionner un fichier PDF ou une image');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setFilePreview(null);
    setExtractionStatus(null);
    setExtractionMessage('');
    setPreviewZoom(1);
  };

  const calculateFromHT = () => {
    const montantHT = parseFloat(invoiceData.montantHT);
    const taux = parseFloat(invoiceData.tauxTVA) || 20;
    
    if (!isNaN(montantHT)) {
      const montantTVA = (montantHT * taux) / 100;
      const montantTTC = montantHT + montantTVA;
      
      setInvoiceData(prev => ({
        ...prev,
        montantTVA: montantTVA.toFixed(2),
        montantTTC: montantTTC.toFixed(2)
      }));
    }
  };

  const calculateFromTTC = () => {
    const montantTTC = parseFloat(invoiceData.montantTTC);
    const taux = parseFloat(invoiceData.tauxTVA) || 20;
    
    if (!isNaN(montantTTC)) {
      const montantHT = montantTTC / (1 + taux / 100);
      const montantTVA = montantTTC - montantHT;
      
      setInvoiceData(prev => ({
        ...prev,
        montantHT: montantHT.toFixed(2),
        montantTVA: montantTVA.toFixed(2)
      }));
    }
  };

  const resetForm = () => {
    setInvoiceData({
      numeroFacture: '',
      fournisseur: '',
      client: '',
      tauxTVA: '',
      montantHT: '',
      montantTVA: '',
      montantTTC: ''
    });
  };

  const saveInvoice = () => {
    // Vérifier que les champs obligatoires sont remplis
    if (!invoiceData.numeroFacture || !invoiceData.montantTTC) {
      alert('Veuillez renseigner au minimum le numéro de facture et le montant TTC');
      return;
    }
    
    // Ici vous pouvez ajouter la logique pour sauvegarder en base de données
    console.log('Sauvegarde de la facture:', invoiceData);
    alert('Facture sauvegardée avec succès !');
  };

  // Helper to filter extracted values
  const filterValue = (val, fieldKey) => {
    if (!val) return '';
    if (fieldKey === 'fournisseur') {
      return val;
    }
    // Only keep numbers and symbols (no letters) for other fields
    const matches = val.match(/[0-9.,;:/\\-]+/g);
    return matches ? matches.join('') : '';
  };

  // Handle zoom for preview
  const handlePreviewZoomChange = (factor) => {
    setPreviewZoom(z => {
      const newZoom = Math.max(0.2, Math.min(5, z * factor));
      return newZoom;
    });
  };

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    maxWidth: {
      maxWidth: '1400px',
      margin: '0 auto'
    },
    title: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#1f2937',
      marginBottom: '8px',
      textAlign: 'center'
    },
    subtitle: {
      fontSize: '16px',
      color: '#6b7280',
      textAlign: 'center',
      marginBottom: '32px'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
      gap: '32px'
    },
    card: {
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      padding: '24px'
    },
    cardTitle: {
      fontSize: '20px',
      fontWeight: '600',
      color: '#374151',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center'
    },
    iconMargin: {
      marginRight: '8px'
    },
    formGroup: {
      marginBottom: '16px'
    },
    formRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginBottom: '16px'
    },
    label: {
      display: 'block',
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
      marginBottom: '8px'
    },
    input: {
      width: '100%',
      padding: '12px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '16px',
      transition: 'all 0.2s',
      outline: 'none',
      boxSizing: 'border-box'
    },
    inputExtracted: {
      backgroundColor: '#f0f9ff',
      borderColor: '#0ea5e9'
    },
    inputRequired: {
      borderColor: '#ef4444'
    },
    flexRow: {
      display: 'flex',
      gap: '8px'
    },
    flexOne: {
      flex: 1
    },
    button: {
      padding: '12px 16px',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background-color 0.2s'
    },
    buttonSecondary: {
      backgroundColor: '#6b7280',
      marginRight: '8px'
    },
    buttonSmall: {
      padding: '8px 12px',
      fontSize: '12px'
    },
    buttonGreen: {
      backgroundColor: '#059669',
      width: '100%',
      marginTop: '24px',
      padding: '16px'
    },
    dropZone: {
      border: '2px dashed #d1d5db',
      borderRadius: '12px',
      padding: '32px',
      textAlign: 'center',
      transition: 'all 0.2s',
      cursor: 'pointer'
    },
    dropZoneActive: {
      borderColor: '#3b82f6',
      backgroundColor: '#eff6ff'
    },
    dropZoneContent: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px'
    },
    iconContainer: {
      padding: '16px',
      backgroundColor: '#f3f4f6',
      borderRadius: '50%',
      display: 'inline-flex'
    },
    uploadText: {
      fontSize: '18px',
      fontWeight: '500',
      color: '#374151'
    },
    uploadSubtext: {
      fontSize: '14px',
      color: '#6b7280',
      marginTop: '4px'
    },
    fileInput: {
      display: 'none'
    },
    uploadButton: {
      padding: '12px 16px',
      backgroundColor: '#3b82f6',
      color: 'white',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      border: 'none'
    },
    fileInfo: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      marginBottom: '16px'
    },
    fileInfoLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    fileName: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151'
    },
    removeButton: {
      padding: '4px',
      color: '#dc2626',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'background-color 0.2s'
    },
    previewContainer: {
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'hidden'
    },
    previewImage: {
      width: '100%',
      height: 'auto',
      maxHeight: '400px',
      objectFit: 'contain'
    },
    previewIframe: {
      width: '100%',
      height: '400px',
    },
    zoomButton: {
      padding: '4px',
      color: '#6b7280',
      backgroundColor: 'transparent',
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    zoomPercentage: {
      fontSize: '12px',
      fontWeight: '500',
      color: '#6b7280',
      minWidth: '40px',
      textAlign: 'center'
    },
    zoomControls: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      marginBottom: '12px',
      padding: '8px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      border: '1px solid #e5e7eb'
    },
    statusBanner: {
      padding: '12px',
      borderRadius: '8px',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    statusLoading: {
      backgroundColor: '#fef3c7',
      color: '#92400e',
      border: '1px solid #fbbf24'
    },
    statusSuccess: {
      backgroundColor: '#d1fae5',
      color: '#065f46',
      border: '1px solid #10b981'
    },
    statusError: {
      backgroundColor: '#fee2e2',
      color: '#991b1b',
      border: '1px solid #ef4444'
    },
    sectionTitle: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#374151',
      marginBottom: '16px',
      paddingBottom: '8px',
      borderBottom: '2px solid #e5e7eb'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.maxWidth}>
        <h1 style={styles.title}>
          Extracteur de Données de Factures
        </h1>
        <p style={styles.subtitle}>
          Déposez votre facture pour une extraction automatique des données
        </p>
        
        <div style={styles.grid}>
          {/* Formulaire de facture */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              <Receipt style={{...styles.iconMargin, color: '#3b82f6'}} />
              Informations de la Facture
            </h2>
            
            <div>
              {/* Informations générales */}
              <div style={styles.sectionTitle}>
                📄 Informations générales
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Numéro de Facture *
                </label>
                <input
                  type="text"
                  name="numeroFacture"
                  value={filterValue(invoiceData.numeroFacture, 'numeroFacture')}
                  onChange={handleInputChange}
                  style={{
                    ...styles.input,
                    ...(invoiceData.numeroFacture && extractionStatus === 'success' ? styles.inputExtracted : {}),
                    ...(!invoiceData.numeroFacture ? styles.inputRequired : {})
                  }}
                  placeholder="Ex: IN2411-0001, FAC-2024-001"
                />
              </div>

              
                <div>
                  <label style={styles.label}>
                    <Building size={14} style={{display: 'inline', marginRight: '4px'}} />
                    Fournisseur
                  </label>
                  <input
                    type="text"
                    name="fournisseur"
                    value={filterValue(invoiceData.fournisseur, 'fournisseur')}
                    onChange={handleInputChange}
                    style={{
                      ...styles.input,
                      ...(invoiceData.fournisseur && extractionStatus === 'success' ? styles.inputExtracted : {})
                    }}
                    placeholder="Nom du fournisseur"
                  />
                
                
                
              </div>

              {/* Montants */}
              <div style={styles.sectionTitle}>
                💰 Montants et TVA
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Taux TVA (%)
                </label>
                <input
                  type="number"
                  name="tauxTVA"
                  value={filterValue(invoiceData.tauxTVA, 'tauxTVA')}
                  onChange={handleInputChange}
                  step="0.01"
                  style={{
                    ...styles.input,
                    ...(invoiceData.tauxTVA && extractionStatus === 'success' ? styles.inputExtracted : {})
                  }}
                  placeholder="20.00"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Montant HT (DH)
                </label>
                <div style={styles.flexRow}>
                  <input
                    type="number"
                    name="montantHT"
                    value={filterValue(invoiceData.montantHT, 'montantHT')}
                    onChange={handleInputChange}
                    step="0.01"
                    style={{
                      ...styles.input,
                      ...styles.flexOne,
                      ...(invoiceData.montantHT && extractionStatus === 'success' ? styles.inputExtracted : {})
                    }}
                    placeholder="275.00"
                  />
                  
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Montant TVA (DH)
                </label>
                <input
                  type="number"
                  name="montantTVA"
                  value={filterValue(invoiceData.montantTVA, 'montantTVA')}
                  onChange={handleInputChange}
                  step="0.01"
                  style={{
                    ...styles.input,
                    ...(invoiceData.montantTVA && extractionStatus === 'success' ? styles.inputExtracted : {})
                  }}
                  placeholder="55.00"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Montant TTC (DH) *
                </label>
                <div style={styles.flexRow}>
                  <input
                    type="number"
                    name="montantTTC"
                    value={filterValue(invoiceData.montantTTC, 'montantTTC')}
                    onChange={handleInputChange}
                    step="0.01"
                    style={{
                      ...styles.input,
                      ...styles.flexOne,
                      ...(invoiceData.montantTTC && extractionStatus === 'success' ? styles.inputExtracted : {}),
                      ...(!invoiceData.montantTTC ? styles.inputRequired : {})
                    }}
                    placeholder="330.00"
                  />
                  
                </div>
              </div>

              <div style={styles.flexRow}>
                
                <button
                  type="button"
                  onClick={saveInvoice}
                  style={{...styles.button, ...styles.buttonGreen, flex: 1}}
                >
                  Enregistrer la Facture
                </button>
              </div>
            </div>
          </div>

          {/* Zone d'upload et visualisation */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              <Upload style={{...styles.iconMargin, color: '#059669'}} />
              Document de la Facture
            </h2>

            {/* Statut de l'extraction */}
            {isExtracting && (
              <div style={{...styles.statusBanner, ...styles.statusLoading}}>
                <Loader2 size={16} style={{animation: 'spin 1s linear infinite'}} />
                {extractionMessage}
              </div>
            )}

            {extractionStatus === 'success' && (
              <div style={{...styles.statusBanner, ...styles.statusSuccess}}>
                <CheckCircle size={16} />
                {extractionMessage}
              </div>
            )}

            {extractionStatus === 'error' && (
              <div style={{...styles.statusBanner, ...styles.statusError}}>
                <AlertCircle size={16} />
                {extractionMessage}
              </div>
            )}

            {!uploadedFile ? (
              <div
                style={{
                  ...styles.dropZone,
                  ...(isDragOver ? styles.dropZoneActive : {})
                }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <div style={styles.dropZoneContent}>
                  <div style={styles.iconContainer}>
                    <Upload style={{color: '#6b7280'}} />
                  </div>
                  <div>
                    <p style={styles.uploadText}>
                      Glissez-déposez votre facture ici
                    </p>
                    <p style={styles.uploadSubtext}>
                      PDF ou Image (JPG, PNG, etc.) - Extraction automatique
                    </p>
                    <p style={styles.uploadSubtext}>
                      Formats supportés: Fournisseur, TVA, Montants HT/TTC
                    </p>
                  </div>
                  <label style={styles.uploadButton}>
                    Choisir un fichier
                    <input
                      type="file"
                      style={styles.fileInput}
                      accept=".pdf,image/*"
                      onChange={handleFileInputChange}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div>
                <div style={styles.fileInfo}>
                  <div style={styles.fileInfoLeft}>
                    {uploadedFile.type.startsWith('image/') ? (
                      <Image style={{color: '#059669'}} />
                    ) : (
                      <FileText style={{color: '#dc2626'}} />
                    )}
                    <span style={styles.fileName}>
                      {uploadedFile.name}
                    </span>
                  </div>
                  <button
                    onClick={removeFile}
                    style={styles.removeButton}
                    disabled={isExtracting}
                  >
                    <X size={16} />
                  </button>
                </div>
                
                {/* Zoom controls - outside file info */}
                <div style={styles.zoomControls}>
                  <button
                    onClick={() => handlePreviewZoomChange(0.8)}
                    style={styles.zoomButton}
                    title="Zoom out"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span style={styles.zoomPercentage}>
                    {Math.round(previewZoom * 100)}%
                  </span>
                  <button
                    onClick={() => handlePreviewZoomChange(1.2)}
                    style={styles.zoomButton}
                    title="Zoom in"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button
                    onClick={() => setPreviewZoom(1)}
                    style={styles.zoomButton}
                    title="Reset zoom"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                
                <div style={styles.previewContainer}>
                  {uploadedFile.type.startsWith('image/') ? (
                    <img
                      src={filePreview}
                      alt="Preview"
                      style={{
                        ...styles.previewImage,
                        width: `${previewZoom * 100}%`,
                        height: 'auto',
                        transition: 'width 0.2s'
                      }}
                    />
                  ) : (
                    <iframe
                      src={filePreview}
                      style={{
                        ...styles.previewIframe,
                        width: `${previewZoom * 100}%`,
                        height: 'auto',
                        transition: 'width 0.2s'
                      }}
                      title="PDF Preview"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Aide */}
        <div style={{...styles.card, marginTop: '32px'}}>
          <h3 style={{...styles.cardTitle, marginBottom: '16px'}}>
            💡 Aide
          </h3>
                      <div style={{fontSize: '14px', color: '#6b7280', lineHeight: '1.6'}}>
            <p><strong>Champs extraits automatiquement avec PaddleOCR:</strong></p>
            <ul style={{marginLeft: '20px', marginTop: '8px'}}>
              <li>Numéro de facture (ex: IN2411-0001)</li>
              <li>Fournisseur (nom de l'entreprise)</li>
              <li>Client/Destinataire</li>
              <li>Taux de TVA (%)</li>
              <li>Montant HT, TVA et TTC</li>
            </ul>
            <p style={{marginTop: '12px'}}>
              <strong>Astuce:</strong> Les champs extraits automatiquement apparaissent avec un fond bleu clair. 
              Vous pouvez les modifier si nécessaire. L'extraction utilise PaddleOCR pour une reconnaissance de texte optimisée.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}