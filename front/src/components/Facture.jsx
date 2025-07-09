import { useState, useCallback, useRef } from 'react';
import FactureFields from './FactureFields';
import FactureDocument from './FactureDocument';
import MappingControls from './MappingControls';
import { Upload, FileText, Image, X, Loader2, CheckCircle, AlertCircle, Receipt } from 'lucide-react';
import styles from './FactureStyles';

function OcrBoxModal({ ocrBoxes, onSelect, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredBoxes = ocrBoxes.filter(box => 
    box.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)',
      zIndex: 3000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 8,
        padding: 24,
        minWidth: 320,
        maxHeight: 400,
        overflowY: 'auto',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)'
      }}>
        <h3 style={{marginTop: 0}}>Sélectionnez la valeur correcte</h3>
        <input
          type="text"
          placeholder="Rechercher dans les valeurs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            marginBottom: 16,
            fontSize: 14
          }}
        />
        <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
          {filteredBoxes.map((box, idx) => (
            <li key={idx} style={{marginBottom: 8}}>
              <button
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                  background: '#f9fafb',
                  cursor: 'pointer',
                  fontSize: 15
                }}
                onClick={() => onSelect(box)}
              >
                {box.text}
              </button>
            </li>
          ))}
        </ul>
        {filteredBoxes.length === 0 && searchTerm && (
          <p style={{textAlign: 'center', color: '#666', marginTop: 16}}>
            Aucun résultat trouvé pour "{searchTerm}"
          </p>
        )}
        <button onClick={onClose} style={{marginTop: 16, background: '#eee', border: 'none', borderRadius: 4, padding: '6px 16px', cursor: 'pointer'}}>Annuler</button>
      </div>
    </div>
  );
}

export default function Facture() {
  const [invoiceData, setInvoiceData] = useState({
    numeroFacture: '',
    emetteur: '',
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
  const [extractionStatus, setExtractionStatus] = useState(null);
  const [extractionMessage, setExtractionMessage] = useState('');
  const [ocrBoxes, setOcrBoxes] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [fieldMappings, setFieldMappings] = useState({});
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [usedMapping, setUsedMapping] = useState(false);
  const [correctionField, setCorrectionField] = useState(null);
  const canvasRef = useRef(null);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrModalField, setOcrModalField] = useState(null);

  const API_BASE_URL = 'http://localhost:8000';

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const getOcrBoxes = async (file) => {
    try {
      console.log('Getting OCR boxes for file:', file.name, file.type);
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/ocr-with-boxes`, {
        method: 'POST',
        body: formData,
      });

      console.log('OCR boxes response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.warn('OCR boxes not available for this file type:', errorText);
        setOcrBoxes([]);
        return;
      }

      const result = await response.json();
      console.log('OCR boxes result:', result);
      setOcrBoxes(result.boxes || []);
    } catch (error) {
      console.warn('OCR boxes extraction failed:', error);
      setOcrBoxes([]);
    }
  };

  const extractDataFromFile = async (file) => {
    setIsExtracting(true);
    setExtractionStatus(null);
    setExtractionMessage('Extraction des données en cours...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/extract-invoice`, {
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
        setInvoiceData(prev => ({
          ...prev,
          numeroFacture: result.data.numeroFacture || prev.numeroFacture,
          emetteur: result.data.emetteur || prev.emetteur,
          client: result.data.client || prev.client,
          tauxTVA: result.data.tauxTVA ? result.data.tauxTVA.toString() : prev.tauxTVA,
          montantHT: result.data.montantHT ? result.data.montantHT.toString() : prev.montantHT,
          montantTVA: result.data.montantTVA ? result.data.montantTVA.toString() : prev.montantTVA,
          montantTTC: result.data.montantTTC ? result.data.montantTTC.toString() : prev.montantTTC
        }));

        setUsedMapping(result.used_mapping || false);
        setExtractionStatus('success');
        
        const extractedFields = Object.values(result.data).filter(value => value !== null && value !== '').length;
        setExtractionMessage(`Extraction réussie ! ${extractedFields} champs extraits.${result.used_mapping ? ' (Mapping utilisé)' : ''}`);
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
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(URL.createObjectURL(file));
      }

      await getOcrBoxes(file);
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
    setOcrBoxes([]);
    setFieldMappings({});
    setIsMappingMode(false);
    setUsedMapping(false);
    setCorrectionField(null);
  };

  const startFieldCorrection = (fieldName) => {
    setOcrModalField(fieldName);
    setOcrModalOpen(true);
  };

  const handleOcrModalSelect = (box) => {
    if (ocrModalField) {
      setInvoiceData(prev => ({
        ...prev,
        [ocrModalField]: box.text
      }));
      setFieldMappings(prev => ({
        ...prev,
        [ocrModalField]: box
      }));
    }
    setOcrModalOpen(false);
    setOcrModalField(null);
  };

  const handleOcrModalClose = () => {
    setOcrModalOpen(false);
    setOcrModalField(null);
  };

  const saveMapping = async () => {
    if (!invoiceData.emetteur) {
      alert('Veuillez renseigner l\'émetteur avant de sauvegarder le mapping');
      return;
    }

    // List of all possible fields to map
    const allFields = [
      'numeroFacture',
      'emetteur',
      'client',
      'tauxTVA',
      'montantHT',
      'montantTVA',
      'montantTTC'
    ];

    // For each field, use the mapping if present, otherwise try to find the OCR box with matching text, otherwise empty
    const mappingData = {};
    allFields.forEach(field => {
      if (fieldMappings[field]) {
        mappingData[field] = fieldMappings[field];
      } else {
        // Try to find an OCR box with the current value
        const ocrBox = ocrBoxes.find(box => box.text === invoiceData[field]);
        if (ocrBox) {
          mappingData[field] = ocrBox;
        } else {
          mappingData[field] = { text: invoiceData[field] || '', left: 0, top: 0, width: 0, height: 0 };
        }
      }
    });

    console.log('Saving mapping data:', mappingData);

    try {
      const response = await fetch(`${API_BASE_URL}/save-mapping?fournisseur=${encodeURIComponent(invoiceData.emetteur)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mappingData),
      });

      console.log('Save mapping response status:', response.status);

      if (response.ok) {
        alert('Mapping sauvegardé avec succès !');
        setIsMappingMode(false);
      } else {
        const errorText = await response.text();
        console.error('Save mapping error status:', response.status);
        console.error('Save mapping error text:', errorText);
        alert('Erreur lors de la sauvegarde du mapping');
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde du mapping');
    }
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
      emetteur: '',
      client: '',
      tauxTVA: '',
      montantHT: '',
      montantTVA: '',
      montantTTC: ''
    });
  };

  const saveInvoice = async () => {
    if (!invoiceData.numeroFacture || !invoiceData.montantTTC) {
      alert('Veuillez renseigner au minimum le numéro de facture et le montant TTC');
      return;
    }
    
    if (Object.keys(fieldMappings).length > 0) {
      await saveMapping();
    }
    
    console.log('Sauvegarde de la facture:', invoiceData);
    alert('Facture sauvegardée avec succès !');
  };

  const getFieldDisplayName = (field) => {
    const names = {
      numeroFacture: 'Numéro Facture',
      emetteur: 'Émetteur',
      client: 'Client',
      tauxTVA: 'Taux TVA',
      montantHT: 'Montant HT',
      montantTVA: 'Montant TVA',
      montantTTC: 'Montant TTC'
    };
    return names[field] || field;
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
          {/* Left: Fields */}
          <FactureFields
            invoiceData={invoiceData}
            extractionStatus={extractionStatus}
            handleInputChange={handleInputChange}
            startFieldCorrection={startFieldCorrection}
            uploadedFile={uploadedFile}
            saveInvoice={saveInvoice}
            styles={styles}
          />
          {/* Right: Document Preview and Mapping */}
          <FactureDocument
            uploadedFile={uploadedFile}
            filePreview={filePreview}
            ocrBoxes={ocrBoxes}
            correctionField={null}
            onOcrBoxClick={() => {}}
            fieldMappings={fieldMappings}
            removeFile={removeFile}
            isExtracting={isExtracting}
            extractionStatus={extractionStatus}
            extractionMessage={extractionMessage}
            styles={styles}
            handleFileInputChange={handleFileInputChange}
            isDragOver={isDragOver}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
          />
        </div>
        {/* Mapping Controls */}
        <MappingControls
          fieldMappings={fieldMappings}
          getFieldDisplayName={getFieldDisplayName}
          saveMapping={saveMapping}
          styles={styles}
        />
        {/* OCR Modal for correction */}
        {ocrModalOpen && (
          <OcrBoxModal
            ocrBoxes={ocrBoxes}
            onSelect={handleOcrModalSelect}
            onClose={handleOcrModalClose}
          />
        )}
      </div>
    </div>
  );
}