import { useState, useCallback } from 'react';
import { Upload, FileText, Image, X } from 'lucide-react';

export default function Facture() {
  const [invoiceData, setInvoiceData] = useState({
    numeroFacture: '',
    nomPersonne: '',
    prixSansTaxe: '',
    prixAvecTaxe: ''
  });

  const [uploadedFile, setUploadedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileUpload = useCallback((file) => {
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      setUploadedFile(file);
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(URL.createObjectURL(file));
      }
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
  };

  const calculateTaxe = () => {
    const prixSans = parseFloat(invoiceData.prixSansTaxe);
    if (!isNaN(prixSans)) {
      const prixAvec = prixSans * 1.20; // TVA 20%
      setInvoiceData(prev => ({
        ...prev,
        prixAvecTaxe: prixAvec.toFixed(2)
      }));
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      padding: '24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    maxWidth: {
      maxWidth: '1280px',
      margin: '0 auto'
    },
    title: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#1f2937',
      marginBottom: '32px',
      textAlign: 'center'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
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
      outline: 'none'
    },
    inputFocus: {
      borderColor: '#3b82f6',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)'
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
    buttonHover: {
      backgroundColor: '#2563eb'
    },
    buttonGreen: {
      backgroundColor: '#059669',
      width: '100%',
      marginTop: '24px',
      padding: '16px'
    },
    buttonGreenHover: {
      backgroundColor: '#047857'
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
      transition: 'background-color 0.2s'
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
    removeButtonHover: {
      backgroundColor: '#fee2e2'
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
      border: 'none'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.maxWidth}>
        <h1 style={styles.title}>
          Gestionnaire de Factures
        </h1>
        
        <div style={styles.grid}>
          {/* Formulaire de facture - Gauche */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              <FileText style={{...styles.iconMargin, color: '#3b82f6'}} />
              Informations de la Facture
            </h2>
            
            <div>
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Numéro de Facture
                </label>
                <input
                  type="text"
                  name="numeroFacture"
                  value={invoiceData.numeroFacture}
                  onChange={handleInputChange}
                  style={styles.input}
                  placeholder="Ex: FAC-2024-001"
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Nom du Client
                </label>
                <input
                  type="text"
                  name="nomPersonne"
                  value={invoiceData.nomPersonne}
                  onChange={handleInputChange}
                  style={styles.input}
                  placeholder="Nom du client"
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Prix sans Taxe (DH)
                </label>
                <div style={styles.flexRow}>
                  <input
                    type="number"
                    name="prixSansTaxe"
                    value={invoiceData.prixSansTaxe}
                    onChange={handleInputChange}
                    step="0.01"
                    style={{...styles.input, ...styles.flexOne}}
                    placeholder="0.00"
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Prix avec Taxe (DH)
                </label>
                <input
                  type="number"
                  name="prixAvecTaxe"
                  value={invoiceData.prixAvecTaxe}
                  onChange={handleInputChange}
                  step="0.01"
                  style={styles.input}
                  placeholder="0.00"
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              <button
                type="button"
                style={{...styles.button, ...styles.buttonGreen}}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#047857'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#059669'}
              >
                Enregistrer la Facture
              </button>
            </div>
          </div>

          {/* Zone d'upload et visualisation - Droite */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              <Upload style={{...styles.iconMargin, color: '#059669'}} />
              Document de la Facture
            </h2>

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
                      Glissez-déposez votre fichier ici
                    </p>
                    <p style={styles.uploadSubtext}>
                      PDF ou Image (JPG, PNG, etc.)
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
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#fee2e2'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div style={styles.previewContainer}>
                  {uploadedFile.type.startsWith('image/') ? (
                    <img
                      src={filePreview}
                      alt="Preview"
                      style={styles.previewImage}
                    />
                  ) : (
                    <iframe
                      src={filePreview}
                      style={styles.previewIframe}
                      title="PDF Preview"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}