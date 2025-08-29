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
  const [zoneTtcOptions, setZoneTtcOptions] = useState([]);
  const [selectedZoneHt, setSelectedZoneHt] = useState("");
  const [selectedZoneTva, setSelectedZoneTva] = useState("");
  const [selectedZoneTtc, setSelectedZoneTtc] = useState("");

  // Clean zone data by removing unnecessary fields
  const cleanZoneData = (boxes) => {
    if (!boxes) return [];
    if (!Array.isArray(boxes)) return [];
    return boxes.map(box => ({
      text: box.text || '',
      left: box.left || 0,
      top: box.top || 0,
      width: box.width || 0,
      height: box.height || 0,
      right: box.right || 0,
      bottom: box.bottom || 0
    })).filter(Boolean);
  };

  // Get current image's zone data
  const currentImageData = extractionState.extractedDataList[extractionState.currentPdfIndex] || {};
  const currentZoneHtOptions = currentImageData.zoneHtBoxes || [];
  const currentZoneTvaOptions = currentImageData.zoneTvaBoxes || [];
  const currentSelectedZoneHt = currentImageData.selectedZoneHt || '';
  const currentSelectedZoneTva = currentImageData.selectedZoneTva || '';

  // Calculate TTC values when HT or TVA options change
  useEffect(() => {
    if (zoneHtOptions.length > 0 && zoneTvaOptions.length > 0) {
      const ttcOptions = [];
      const maxLength = Math.min(zoneHtOptions.length, zoneTvaOptions.length);
      
      for (let i = 0; i < maxLength; i++) {
        const htValue = parseFloat(zoneHtOptions[i].text.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
        const tvaValue = parseFloat(zoneTvaOptions[i].text.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
        const ttcValue = htValue + tvaValue;
        
        ttcOptions.push({
          ...zoneHtOptions[i],
          text: ttcValue.toFixed(2).toString().replace('.', ',')
        });
      }
      
      setZoneTtcOptions(ttcOptions);
    } else {
      setZoneTtcOptions([]);
      setSelectedZoneTtc('');
    }
  }, [zoneHtOptions, zoneTvaOptions]);
  
  // Update zone options when current PDF changes
  useEffect(() => {
    if (extractionState.extractedDataList[extractionState.currentPdfIndex]) {
      const currentData = extractionState.extractedDataList[extractionState.currentPdfIndex];
      setZoneHtOptions(currentData.zoneHtBoxes || []);
      setZoneTvaOptions(currentData.zoneTvaBoxes || []);
      setSelectedZoneHt(currentData.selectedZoneHt || '');
      setSelectedZoneTva(currentData.selectedZoneTva || '');
      setSelectedZoneTtc(currentData.selectedZoneTtc || '');
    } else {
      setZoneHtOptions([]);
      setZoneTvaOptions([]);
      setZoneTtcOptions([]);
      setSelectedZoneHt('');
      setSelectedZoneTva('');
      setSelectedZoneTtc('');
    }
  }, [extractionState.currentPdfIndex, extractionState.extractedDataList]);

  // Update zone data when extraction result changes
  useEffect(() => {
  // console.log('Extraction result changed:', extractionState.extractionResult);
    if (extractionState.extractionResult) {
      const zoneData = extractionState.extractionResult.zone_results || {};
      const zone_ht_boxes = extractionState.extractionResult.zone_ht_boxes || zoneData.zone_ht_boxes || [];
      const zone_tva_boxes = extractionState.extractionResult.zone_tva_boxes || zoneData.zone_tva_boxes || [];

  // console.log('Processing zone data - HT:', zone_ht_boxes, 'TVA:', zone_tva_boxes);

      setExtractionState(prev => {
        const newExtractedDataList = [...prev.extractedDataList];
        const currentIndex = prev.currentPdfIndex;
        
        if (!newExtractedDataList[currentIndex]) {
          // console.log('No data for current index:', currentIndex);
          return prev;
        }
        
        const cleanedHtBoxes = cleanZoneData(zone_ht_boxes);
        const cleanedTvaBoxes = cleanZoneData(zone_tva_boxes);
        
  // console.log('Cleaned zone data - HT:', cleanedHtBoxes, 'TVA:', cleanedTvaBoxes);
        
        newExtractedDataList[currentIndex] = {
          ...newExtractedDataList[currentIndex],
          zoneHtBoxes: cleanedHtBoxes,
          zoneTvaBoxes: cleanedTvaBoxes,
          // Keep existing selections if they exist
          selectedZoneHt: newExtractedDataList[currentIndex]?.selectedZoneHt || '',
          selectedZoneTva: newExtractedDataList[currentIndex]?.selectedZoneTva || '',
          selectedZoneTtc: newExtractedDataList[currentIndex]?.selectedZoneTtc || ''
        };

  // console.log('Updated data for index', currentIndex, ':', newExtractedDataList[currentIndex]);

        return {
          ...prev,
          extractedDataList: newExtractedDataList
        };
      });
    }
  }, [extractionState.extractionResult]);
  
  // Log current state for debugging
  useEffect(() => {
  // console.log('Current zone state:', {
  //   currentPdfIndex: extractionState.currentPdfIndex,
  //   extractedDataList: extractionState.extractedDataList.map((item, idx) => ({
  //     index: idx,
  //     hasHtBoxes: item.zoneHtBoxes?.length > 0,
  //     hasTvaBoxes: item.zoneTvaBoxes?.length > 0,
  //     hasTtcBoxes: zoneTtcOptions?.length > 0,
  //     selectedHt: item.selectedZoneHt,
  //     selectedTva: item.selectedZoneTva,
  //     selectedTtc: item.selectedZoneTtc
  //   })),
  //   extractionResult: extractionState.extractionResult ? 'Has extraction result' : 'No extraction result',
  //   ttcOptions: zoneTtcOptions
  // });
  }, [extractionState.currentPdfIndex, extractionState.extractedDataList, extractionState.extractionResult, zoneTtcOptions]);

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
          
          {/* Zone HT Dropdown - For viewing detected values only */}
          {/* console.log('Rendering HT dropdown with options:', zoneHtOptions) */}
          {zoneHtOptions && zoneHtOptions.length > 0 && (
            <div className="extraction-field-item">
              <label className="extraction-field-label">Zone HT (Valeurs détectées)</label>
              <div className="relative">
                <select
                  value={selectedZoneHt}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSelectedZoneHt(newValue);
                    
                    // Update the selection in the extracted data list
                    setExtractionState(prev => {
                      const newExtractedDataList = [...prev.extractedDataList];
                      const currentIndex = prev.currentPdfIndex;
                      
                      if (newExtractedDataList[currentIndex]) {
                        newExtractedDataList[currentIndex] = {
                          ...newExtractedDataList[currentIndex],
                          selectedZoneHt: newValue
                        };
                      }
                      
                      return {
                        ...prev,
                        extractedDataList: newExtractedDataList
                      };
                    });
                  }}
                  className="extraction-select-field w-full p-2 border rounded-md bg-gray-100 text-gray-600"
                >
                  <option value="">Cliquez pour voir les valeur HT</option>
                  {zoneHtOptions.map((option, idx) => (
                    <option key={`ht-${idx}`} value={option.text}>
                      {option.text} 
                    </option>
                  ))}
                </select>
               
              </div>
            </div>
          )}
          
          {/* Zone TVA Dropdown - For viewing detected values only */}
          {/* console.log('Rendering TVA dropdown with options:', zoneTvaOptions) */}
          {zoneTvaOptions && zoneTvaOptions.length > 0 && (
            <div className="extraction-field-item">
              <label className="extraction-field-label">Zone TVA (Valeurs détectées)</label>
              <div className="relative">
                <select
                  value={selectedZoneTva}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSelectedZoneTva(newValue);
                    
                    // Update the selection in the extracted data list
                    setExtractionState(prev => {
                      const newExtractedDataList = [...prev.extractedDataList];
                      const currentIndex = prev.currentPdfIndex;
                      
                      if (newExtractedDataList[currentIndex]) {
                        newExtractedDataList[currentIndex] = {
                          ...newExtractedDataList[currentIndex],
                          selectedZoneTva: newValue
                        };
                      }
                      
                      return {
                        ...prev,
                        extractedDataList: newExtractedDataList
                      };
                    });
                  }}
                  className="extraction-select-field w-full p-2 border rounded-md bg-gray-100 text-gray-600"
                >
                  <option value="">Cliquez pour voir les valeurs TVA</option>
                  {zoneTvaOptions.map((option, idx) => (
                    <option key={`tva-${idx}`} value={option.text}>
                      {option.text} 
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          
          {/* Zone TTC Dropdown - Calculated values (HT + TVA) */}
          {zoneTtcOptions && zoneTtcOptions.length > 0 && (
            <div className="extraction-field-item">
              <label className="extraction-field-label">Zone TTC (Valeurs calculées)</label>
              <div className="relative">
                <select
                  value={selectedZoneTtc}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSelectedZoneTtc(newValue);
                    
                    // Update the selection in the extracted data list
                    setExtractionState(prev => {
                      const newExtractedDataList = [...prev.extractedDataList];
                      const currentIndex = prev.currentPdfIndex;
                      
                      if (newExtractedDataList[currentIndex]) {
                        newExtractedDataList[currentIndex] = {
                          ...newExtractedDataList[currentIndex],
                          selectedZoneTtc: newValue
                        };
                      }
                      
                      return {
                        ...prev,
                        extractedDataList: newExtractedDataList
                      };
                    });
                  }}
                  className="extraction-select-field w-full p-2 border rounded-md bg-gray-100 text-gray-600"
                >
                  <option value="">Valeurs TTC (HT + TVA)</option>
                  {zoneTtcOptions.map((option, idx) => (
                    <option key={`ttc-${idx}`} value={option.text}>
                      {option.text} 
                    </option>
                  ))}
                </select>
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