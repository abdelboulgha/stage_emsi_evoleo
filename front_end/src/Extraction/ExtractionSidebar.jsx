import React from "react";
import {
  Search,
  Loader2,
  Save,
  Database,
  ZoomIn,
} from "lucide-react";

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
              <Search className="extraction-button-icon no-animation" />
              Extraire toutes les pages
             
            </>
          )}
        </button>

        <div className="extraction-fields-list">
          {EXTRACTION_FIELDS.map((field) => {
            const rawValue = extractionState.extractedDataList[extractionState.currentPdfIndex]?.[field.key];
            const displayValue = filterValue(rawValue, field.key);
              
            return (
              <div key={field.key} className="extraction-field-item">
                <label className="extraction-field-label">
                  {field.label}
                </label>
                <div className="extraction-field-input-group">
                  <input
                    type={field.key === 'dateFacturation' ? 'date' : 'text'}
                    name={field.key}
                    value={displayValue || ''}
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
                 {/*  <button
                    type="button"
                    onClick={() => {
                      if (extractDrawState.isDrawing && extractDrawState.fieldKey === field.key) {
                        setExtractDrawState({ isDrawing: false, fieldKey: null, start: null, rect: null });
                      } else {
                        setExtractDrawState({ isDrawing: true, fieldKey: field.key, start: null, rect: null });
                        showNotification(`Mode dessin extraction activé pour "${field.label}". Dessinez un rectangle sur l'image.`, "info");
                      }
                    }}
                    className={`extraction-draw-button ${extractDrawState.isDrawing && extractDrawState.fieldKey === field.key ? 'active' : ''}`}
                    title={extractDrawState.isDrawing && extractDrawState.fieldKey === field.key ? 'Annuler le dessin' : 'Dessiner pour extraire'}
                  >
                    <ZoomIn className="extraction-draw-icon" />
                  </button>*/}
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
              onClick={launchFoxPro}
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