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
    <div className="lg:col-span-1">
      <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30 h-full">
        <h3 className="text-lg font-semibold text-white mb-4">
          Données Extraites
        </h3>

        <button
          onClick={extractAllPdfs}
          disabled={
            extractionState.isProcessing || 
            (extractionState.processingMode === "same" && !extractionState.selectedModelId)
          }
          className="w-full mb-4 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2"
        >
          {extractionState.isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Extraction en cours...
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              Extraire toutes les pages
              {extractionState.processingMode === "same" && extractionState.selectedModelName && (
                <span className="text-xs opacity-75"> (Modèle: {extractionState.selectedModelName})</span>
              )}
            </>
          )}
        </button>

        <div className="space-y-3">
          {EXTRACTION_FIELDS.map((field) => {
            const rawValue = extractionState.extractedDataList[extractionState.currentPdfIndex]?.[field.key];
            const displayValue =filterValue(rawValue, field.key);
              
            return (
              <div key={field.key}>
                <label className="block text-sm font-medium text-blue-100 mb-1">
                  {field.label}
                </label>
                <div className="flex gap-2 items-center">
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
                    className="flex-1 px-3 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    placeholder={`${field.label} sera extrait automatiquement`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (extractDrawState.isDrawing && extractDrawState.fieldKey === field.key) {
                        setExtractDrawState({ isDrawing: false, fieldKey: null, start: null, rect: null });
                      } else {
                        setExtractDrawState({ isDrawing: true, fieldKey: field.key, start: null, rect: null });
                        showNotification(`Mode dessin extraction activé pour "${field.label}". Dessinez un rectangle sur l'image.`, "info");
                      }
                    }}
                    className={`p-2 rounded-full border-2 transition-colors duration-200 ${extractDrawState.isDrawing && extractDrawState.fieldKey === field.key ? 'border-yellow-400 bg-yellow-500/20 text-yellow-100' : 'border-white/30 bg-white/10 text-blue-100 hover:border-blue-400'}`}
                    title={extractDrawState.isDrawing && extractDrawState.fieldKey === field.key ? 'Annuler le dessin' : 'Dessiner pour extraire'}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
          
          <div className="flex flex-col gap-3 mb-4">
            <button
              onClick={openSaveModal}
              disabled={
                extractionState.extractedDataList.length === 0
              }
              className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              Enregistrer les factures
            </button>
            
            <button
              onClick={launchFoxPro}
              disabled={
                extractionState.extractedDataList.length === 0
              }
              className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Database className="w-4 h-4" />
              Enregistrer dans FoxPro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtractionSidebar;