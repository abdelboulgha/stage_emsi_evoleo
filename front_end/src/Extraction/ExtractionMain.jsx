import React from "react";
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
  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-6 relative">
       <div className="flex justify-center mb-6">
          {/*<button
            onClick={backToSetup}
            className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-colors flex items-center gap-2 z-10"
          >
            <ChevronLeft className="w-4 h-4" />
            Retour
          </button>*/}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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