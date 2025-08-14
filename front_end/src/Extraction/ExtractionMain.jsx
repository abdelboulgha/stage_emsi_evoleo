import React from "react";
import { useSearchParams } from "react-router-dom";
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
import AIExtractionMode from "./AIExtractionMode";
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
  const [searchParams] = useSearchParams();
  const extractionMode = searchParams.get('mode') || 'parametrage';
  
  // Si c'est le mode AI, afficher le composant AI
  if (extractionMode === 'ai') {
    return (
      <AIExtractionMode
        extractionState={extractionState}
        setExtractionState={setExtractionState}
        showNotification={showNotification}
        setCurrentStep={setCurrentStep}
        setIsLoading={setIsLoading}
      />
    );
  }

  // Mode paramétrage normal
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