import React, { useEffect, useRef } from "react";
import {
  ChevronLeft,
  Eye,
  Search,
  Loader2,
  Save,
  Database,
  ZoomIn,
} from "lucide-react";
import ExtractionSidebar from "./ExtractionSidebar";
import ExtractionPreview from "./ExtractionPreview";
import InvoiceSelectionModal from "./InvoiceSelectionModal";
import "./ExtractionMain.css";

const ExtractionMain = ({
  extractionState,
  setExtractionState,
  backToSetup,
  extractAllPdfs,
  openSaveModal,
  launchFoxPro,
  filterValue,
  EXTRACTION_FIELDS,
  extractDrawState,
  setExtractDrawState,
  showNotification,
  scrollToIndex,
  goToPrevPdf,
  goToNextPdf,
  hoveredIndex,
  setHoveredIndex,
  isExtractionComplete,
  mappings,
  setCurrentStep,
  setIsLoading,
  setDataPrepState,
}) => {
  const hasTriggeredExtraction = useRef(false);
  
  useEffect(() => {
    if (hasTriggeredExtraction.current) return;
    
    if (extractionState?.filePreviews?.length > 0) {
      hasTriggeredExtraction.current = true;
      
      try {
        extractAllPdfs();
      } catch (error) {
        console.error('Error in auto-extraction:', error);
        hasTriggeredExtraction.current = false;
      }
    }
    
    return () => {
      hasTriggeredExtraction.current = false;
    };
  }, []);

  return (
    <div className="extraction-container">
      <div className="extraction-content">
        <div className="extraction-header">
          <h1 className="extraction-title">Extraction de Données</h1>
          
        </div>

        <div className="extraction-grid">
          {/* Sidebar with extracted data */}
          <ExtractionSidebar
            extractionState={extractionState}
            setExtractionState={setExtractionState}
            extractAllPdfs={extractAllPdfs}
            openSaveModal={openSaveModal}
            launchFoxPro={launchFoxPro}
            filterValue={filterValue}
            EXTRACTION_FIELDS={EXTRACTION_FIELDS}
            extractDrawState={extractDrawState}
            setExtractDrawState={setExtractDrawState}
            showNotification={showNotification}
          />

          {/* Main document preview area */}
          <ExtractionPreview
            extractionState={extractionState}
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
        </div>
      </div>
    </div>
  );
};

export default ExtractionMain; 