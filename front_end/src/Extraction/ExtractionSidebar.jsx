import React, { useState, useEffect } from "react";
import { Search, Loader2, Save, Database, ChevronDown } from "lucide-react";
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
  const [zoneHtOptions, setZoneHtOptions] = useState([]);
  const [zoneTvaOptions, setZoneTvaOptions] = useState([]);
  const [selectedZoneHt, setSelectedZoneHt] = useState("");
  const [selectedZoneTva, setSelectedZoneTva] = useState("");

  // Update zone options when extraction state changes
  useEffect(() => {
    console.log('Extraction State Updated:', extractionState);
    if (extractionState.extractionResult) {
      console.log('Extraction Result:', extractionState.extractionResult);
      if (extractionState.extractionResult.zone_ht_boxes) {
        console.log('Zone HT Boxes:', extractionState.extractionResult.zone_ht_boxes);
        setZoneHtOptions(extractionState.extractionResult.zone_ht_boxes);
        if (extractionState.extractionResult.zone_ht_boxes.length > 0) {
          const firstOption = extractionState.extractionResult.zone_ht_boxes[0].text;
          console.log('Setting selectedZoneHt to:', firstOption);
          setSelectedZoneHt(firstOption);
        }
      }
      if (extractionState.extractionResult.zone_tva_boxes) {
        setZoneTvaOptions(extractionState.extractionResult.zone_tva_boxes);
        if (extractionState.extractionResult.zone_tva_boxes.length > 0) {
          setSelectedZoneTva(extractionState.extractionResult.zone_tva_boxes[0].text);
        }
      }
    }
  }, [extractionState.extractionResult]);

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
          {/* Regular fields */}
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
          
          {/* Zone HT Dropdown */}
          {zoneHtOptions.length > 0 && (
            <div className="extraction-field-item">
              <label className="extraction-field-label">Zone HT</label>
              <div className="relative">
                <select
                  value={selectedZoneHt}
                  onChange={(e) => {
                    setSelectedZoneHt(e.target.value);
                    setExtractionState(prev => ({
                      ...prev,
                      extractedDataList: prev.extractedDataList.map((data, index) =>
                        index === prev.currentPdfIndex
                          ? { ...data, zone_ht: e.target.value }
                          : data
                      ),
                    }));
                  }}
                  className="extraction-select-field w-full p-2 border rounded-md bg-white"
                >
                  {zoneHtOptions.map((option, idx) => (
                    <option key={`ht-${idx}`} value={option.text}>
                      {option.text} ({(option.score * 100).toFixed(1)}%)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" />
              </div>
            </div>
          )}
          
          {/* Zone TVA Dropdown */}
          {zoneTvaOptions.length > 0 && (
            <div className="extraction-field-item">
              <label className="extraction-field-label">Zone TVA</label>
              <div className="relative">
                <select
                  value={selectedZoneTva}
                  onChange={(e) => {
                    setSelectedZoneTva(e.target.value);
                    setExtractionState(prev => ({
                      ...prev,
                      extractedDataList: prev.extractedDataList.map((data, index) =>
                        index === prev.currentPdfIndex
                          ? { ...data, zone_tva: e.target.value }
                          : data
                      ),
                    }));
                  }}
                  className="extraction-select-field w-full p-2 border rounded-md bg-white"
                >
                  {zoneTvaOptions.map((option, idx) => (
                    <option key={`tva-${idx}`} value={option.text}>
                      {option.text} ({(option.score * 100).toFixed(1)}%)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" />
              </div>
            </div>
          )}
          
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