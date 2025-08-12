import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Import des composants modulaires
import Notifications from "../NavBar/Notifications";
import PreparationSetup from "../Preparation/PreparationSetup";
import ExtractionMain from "../Extraction/ExtractionMain";
import InvoiceSelectionModal from "../Extraction/InvoiceSelectionModal";
import ParametrageMain from "../Parametrage/ParametrageMain";

// Import des hooks personnalisés
import { useExtractorState } from "../hooks/useExtractorState";
import { useNotifications } from "../hooks/useNotifications";
import { useSetup } from "../hooks/useSetup";
import { useDataPreparation } from "../hooks/useDataPreparation";
import { useCanvasHandlers } from "../hooks/useCanvasHandlers";
import { useExtraction } from "../hooks/useExtraction";
import { useInvoiceSelection } from "../hooks/useInvoiceSelection";

// Import du CSS
import './ExtractorNew.css';

const ExtractorNew = ({ currentStep, setCurrentStep }) => {
  // États et refs
  const state = useExtractorState();
  const {
    manualDrawState, setManualDrawState,
    mappings, setMappings,
    isLoading, setIsLoading,
    notifications, setNotifications,
    setupState, setSetupState,
    extractionState, setExtractionState,
    dataPrepState, setDataPrepState,
    invoiceSelection, setInvoiceSelection,
    showModelSelectModal, setShowModelSelectModal,
    pendingExtractIndex, setPendingExtractIndex,
    modalSelectedTemplateId, setModalSelectedTemplateId,
    ocrPreviewFields, setOcrPreviewFields,
    extractDrawState, setExtractDrawState,
    hoveredIndex, setHoveredIndex,
  } = state;

  // Function to clear all files
  const clearAllFiles = () => {
    setSetupState(prev => ({
      ...prev,
      selectedFiles: [],
      filePreviews: []
    }));
  };

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const previewImageRef = useRef(null);
  const horizontalScrollRef = useRef(null);
  const extractCanvasRef = useRef(null);
  const extractionBoxesCanvasRef = useRef(null);

  const EXTRACTION_FIELDS = [
    { key: "fournisseur", label: "Fournisseur" },
    { key: "numeroFacture", label: "Numéro de Facture" },
    { key: "dateFacturation", label: "Date Facturation" },
    { key: "tauxTVA", label: "Taux TVA" },
    { key: "montantHT", label: "Montant HT" },
    { key: "montantTVA", label: "Montant TVA" },
    { key: "montantTTC", label: "Montant TTC" },
  ];

  // Hooks personnalisés
  const { showNotification } = useNotifications(setNotifications);
  const { 
    loadExistingMappings, 
    handleSetupFileUpload, 
    validateSetupAndProceed, 
    removeFile, 
    backToSetup,
  } = useSetup(setupState, setSetupState, setExtractionState, setCurrentStep, setIsLoading, showNotification);
  
  const {
    handleDataPrepFileUpload,
    handleZoomChange,
    startFieldSelection,
    startManualDraw,
    saveMappings,
    ocrPreviewManual,
    getPagePreviews,
  } = useDataPreparation(setDataPrepState, setCurrentStep, setIsLoading, showNotification);

  const {
    filterValue,
    hasMapping,
    isExtractionComplete,
    extractAllPdfs,
    extractCurrentPdf,
    launchFoxPro,
  } = useExtraction(extractionState, setExtractionState, showNotification);

  const {
    handleSaveInvoices,
    toggleSelectAllInvoices,
    toggleInvoiceSelection,
    openSaveModal,
  } = useInvoiceSelection(extractionState, invoiceSelection, setInvoiceSelection, showNotification, filterValue);

  const {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    drawOcrBox,
    redrawCanvas,
  } = useCanvasHandlers(dataPrepState, setDataPrepState, manualDrawState, setManualDrawState, showNotification, ocrPreviewManual, setOcrPreviewFields);

  // Fonctions utilitaires
  const scrollToIndex = (index) => {
    setExtractionState((prev) => ({ ...prev, currentPdfIndex: index }));
    
    if (extractionState.processingMode === "same" && extractionState.selectedModel) {
      if (!extractionState.extractedDataList[index] || 
          Object.keys(extractionState.extractedDataList[index] || {}).length === 0) {
        extractCurrentPdf(extractionState.selectedModel, index);
      }
    } else {
      setPendingExtractIndex(index);
      setShowModelSelectModal(true);
      setModalSelectedTemplateId("");
    }
  };

  const goToPrevPdf = () => {
    const newIndex = Math.max(0, extractionState.currentPdfIndex - 1);
    scrollToIndex(newIndex);
  };

  const goToNextPdf = () => {
    const newIndex = Math.min(
      extractionState.filePreviews.length - 1,
      extractionState.currentPdfIndex + 1
    );
    scrollToIndex(newIndex);
  };

  // Effects
  useEffect(() => {
    loadExistingMappings(setMappings);
  }, [loadExistingMappings, setMappings]);

  useEffect(() => {
    if (dataPrepState.uploadedImage && imageRef.current) {
      imageRef.current.onload = () => redrawCanvas(canvasRef, imageRef);
      imageRef.current.src = dataPrepState.uploadedImage;
    }
  }, [dataPrepState.uploadedImage, redrawCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (event) => handleCanvasMouseDown(event, canvasRef);
    const handleMouseMove = (event) => handleCanvasMouseMove(event, canvasRef);
    const handleMouseUp = (event) => handleCanvasMouseUp(event);
    
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp]);

  return (
    <div className="extractor-container">
      <Notifications notifications={notifications} />

      
        {currentStep === "setup" && (
          <PreparationSetup
            setupState={setupState}
            setSetupState={setSetupState}
            mappings={mappings}
            isLoading={isLoading}
            handleSetupFileUpload={handleSetupFileUpload}
            handleSingleDataPrepUpload={handleDataPrepFileUpload}
            validateSetupAndProceed={validateSetupAndProceed}
            removeFile={removeFile}
            clearAllFiles={clearAllFiles}
            showNotification={showNotification}
            getPagePreviews={getPagePreviews}
          />
        )}

        {currentStep === "extract" && (
          <>
            <ExtractionMain
              extractionState={extractionState}
              setExtractionState={setExtractionState}
              backToSetup={backToSetup}
              extractAllPdfs={extractAllPdfs}
              openSaveModal={openSaveModal}
              launchFoxPro={launchFoxPro}
              filterValue={filterValue}
              EXTRACTION_FIELDS={EXTRACTION_FIELDS}
              extractDrawState={extractDrawState}
              setExtractDrawState={setExtractDrawState}
              showNotification={showNotification}
              scrollToIndex={scrollToIndex}
              goToPrevPdf={goToPrevPdf}
              goToNextPdf={goToNextPdf}
              hoveredIndex={hoveredIndex}
              setHoveredIndex={setHoveredIndex}
              isExtractionComplete={isExtractionComplete}
              mappings={mappings}
              setCurrentStep={setCurrentStep}
              setIsLoading={setIsLoading}
              setDataPrepState={setDataPrepState}
            />
            
            {invoiceSelection.isOpen && (
              <InvoiceSelectionModal
                invoiceSelection={invoiceSelection}
                setInvoiceSelection={setInvoiceSelection}
                extractionState={extractionState}
                toggleSelectAllInvoices={toggleSelectAllInvoices}
                toggleInvoiceSelection={toggleInvoiceSelection}
                handleSaveInvoices={handleSaveInvoices}
              />
            )}

            
           
          </>
        )}

        {currentStep === "dataprep" && (
          <ParametrageMain
            dataPrepState={dataPrepState}
            setDataPrepState={setDataPrepState}
            manualDrawState={manualDrawState}
            setManualDrawState={setManualDrawState}
            isLoading={isLoading}
            handleDataPrepFileUpload={handleDataPrepFileUpload}
            handleZoomChange={handleZoomChange}
            startFieldSelection={(fieldKey) => startFieldSelection(fieldKey, setManualDrawState)}
            startManualDraw={startManualDraw}
            saveMappings={() => saveMappings(dataPrepState, () => loadExistingMappings(setMappings))}
            showNotification={showNotification}
            getPagePreviews={getPagePreviews}
            canvasRef={canvasRef}
            imageRef={imageRef}
            redrawCanvas={() => redrawCanvas(canvasRef, imageRef)}
            handleCanvasMouseDown={(event) => handleCanvasMouseDown(event, canvasRef)}
            handleCanvasMouseMove={(event) => handleCanvasMouseMove(event, canvasRef)}
            handleCanvasMouseUp={handleCanvasMouseUp}
            drawOcrBox={drawOcrBox}
            ocrPreviewFields={ocrPreviewFields}
            setOcrPreviewFields={setOcrPreviewFields}
          />
        )}
      </div>
   
  );
};

export default ExtractorNew;