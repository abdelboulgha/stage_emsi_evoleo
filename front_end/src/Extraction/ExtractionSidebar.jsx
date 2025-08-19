import React from "react";
import { Search, Loader2, Save, Database } from "lucide-react";
import { useExtraction } from "../hooks/useExtraction";

const ExtractionSidebar = ({
  extractionState,
  setExtractionState,
  extractAllPdfs,
  openSaveModal,
  launchFoxPro,   
  filterValue,
  EXTRACTION_FIELDS,
  extractDrawState,
  setExtractDrawState,
  showNotification,
}) => {
  // Get the function from the hook
  const { saveAllCorrectedDataAndLaunchFoxPro } = useExtraction(extractionState, setExtractionState, showNotification);
 
  return (
    <div className="extraction-sidebar">
      <div className="extraction-sidebar-container">
        <h3 className="extraction-sidebar-title">
          Données Extraites
        </h3>

        <button
          onClick={extractAllPdfs}
          disabled={
            extractionState.isProcessing || 
            (extractionState.processingMode === "same" && !extractionState.selectedModelId)
          }
          className="extraction-extract-button"
        >
          {extractionState.isProcessing ? (
            <>
              <Loader2 className="extraction-button-icon" />
              Extraction en cours...
            </>
          ) : (
            <>
              <Search className="extraction-button-icon-no-animation" />
              Extraire toutes les pages
            
            </>
          )}
        </button>

        <div className="extraction-fields-list">
          {EXTRACTION_FIELDS.map((field) => {
            const rawValue = extractionState.extractedDataList[extractionState.currentPdfIndex]?.[field.key];
            const displayValue = filterValue(rawValue, field.key);
            const shouldShowPlaceholder = displayValue === undefined || 
                                      displayValue === null || 
                                      displayValue === '';
              
            return (
              <div key={field.key} className="extraction-field-item">
                <label className="extraction-field-label">
                  {field.label}
                </label>
                <div className="extraction-field-input-group">
                  <input
                    type={field.key === 'dateFacturation' ? 'date' : 'text'}
                    name={field.key}
                    value={shouldShowPlaceholder ? '' : displayValue}
                    onChange={(e) =>
                      setExtractionState((prev) => ({
                        ...prev,
                        extractedDataList: prev.extractedDataList.map(
                          (data, index) =>
                            index === prev.currentPdfIndex
                              ? {
                                  ...data,
                                  [field.key]: e.target.value,
                                }
                              : data
                        ),
                      }))
                    }
                    className="extraction-input-field"
                    placeholder={`${field.label} sera extrait automatiquement`}
                  />
             
                </div>
              </div>
            );
          })}
          
          <div className="extraction-actions">
            <button
              onClick={openSaveModal}
              disabled={
                extractionState.extractedDataList.length === 0
              }
              className="extraction-action-button save"
            >
              <Save className="extraction-action-icon" />
              Enregistrer les factures
            </button>
            
            <button
              onClick={saveAllCorrectedDataAndLaunchFoxPro}
              disabled={
                extractionState.extractedDataList.length === 0
              }
              className="extraction-action-button foxpro"
            >
              <Database className="extraction-action-icon" />
              Enregistrer dans FoxPro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtractionSidebar;