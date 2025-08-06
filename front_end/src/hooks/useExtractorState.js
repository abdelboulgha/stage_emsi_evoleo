import { useState } from 'react';

export const useExtractorState = () => {
  const [manualDrawState, setManualDrawState] = useState({
    isDrawing: false,
    fieldKey: null,
    start: null,
    rect: null,
  });

  const [mappings, setMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const [setupState, setSetupState] = useState({
    invoiceType: "achat",
    selectedFiles: [],
    filePreviews: [],
    processingMode: "same", 
    selectedModel: { id: "", name: "" }
  });

  const [extractionState, setExtractionState] = useState({
    uploadedFiles: [],
    filePreviews: [],
    previewDimensions: [],
    currentPdfIndex: 0,
    extractedDataList: [],
    confidenceScores: [],
    isProcessing: false,
    extractionBoxes: [], 
  });

  const [dataPrepState, setDataPrepState] = useState({
    uploadedImage: null,
    imageDimensions: { width: 0, height: 0 },
    currentZoom: 1,
    isSelecting: false,
    selectedField: null,
    fieldMappings: {},
    selectionHistory: [],
    ocrPreview: "",
    ocrBoxes: [],
    selectedBoxes: {},
    fileName: "",
    fileType: "",
  });

  const [invoiceSelection, setInvoiceSelection] = useState({
    isOpen: false,
    selectedInvoices: [],
    isSaving: false,
  });

  const [showModelSelectModal, setShowModelSelectModal] = useState(false);
  const [pendingExtractIndex, setPendingExtractIndex] = useState(null);
  const [modalSelectedTemplateId, setModalSelectedTemplateId] = useState("");

  const [ocrPreviewFields, setOcrPreviewFields] = useState({});

  const [extractDrawState, setExtractDrawState] = useState({
    isDrawing: false,
    fieldKey: null,
    start: null,
    rect: null,
  });

  const [hoveredIndex, setHoveredIndex] = useState(null);

  return {
    // États principaux
    manualDrawState, setManualDrawState,
    mappings, setMappings,
    isLoading, setIsLoading,
    notifications, setNotifications,
    
    // États de configuration
    setupState, setSetupState,
    extractionState, setExtractionState,
    dataPrepState, setDataPrepState,
    
    // États de sélection
    invoiceSelection, setInvoiceSelection,
    showModelSelectModal, setShowModelSelectModal,
    pendingExtractIndex, setPendingExtractIndex,
    modalSelectedTemplateId, setModalSelectedTemplateId,
    
    // États d'aperçu
    ocrPreviewFields, setOcrPreviewFields,
    extractDrawState, setExtractDrawState,
    hoveredIndex, setHoveredIndex,
  };
}; 