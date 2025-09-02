import React, { useState, useEffect } from "react";
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
  const [zoneHtOptions, setZoneHtOptions] = useState([]);
  const [zoneTvaOptions, setZoneTvaOptions] = useState([]);
  const [zoneTableRows, setZoneTableRows] = useState([]);
  const [showZoneTable, setShowZoneTable] = useState(false);

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

  // Current image data is accessed directly in the effects

  // Calculate Taux and TTC values when HT or TVA options change
  useEffect(() => {
    // Build table rows for zone values
    if (zoneHtOptions.length > 0 && zoneTvaOptions.length > 0) {
      const rows = [];
      const maxLength = Math.min(zoneHtOptions.length, zoneTvaOptions.length);
      for (let i = 0; i < maxLength; i++) {
        const htValue = parseFloat(zoneHtOptions[i].text.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
        const tvaValue = parseFloat(zoneTvaOptions[i].text.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
        let tauxValue = 0;
        if (htValue > 0) {
          tauxValue = Math.round((tvaValue * 100) / htValue);
        }
        const ttcValue = htValue + tvaValue;
        rows.push({
          ht: zoneHtOptions[i].text,
          taux: `${tauxValue} %`,
          tva: zoneTvaOptions[i].text,
          ttc: ttcValue.toFixed(2).toString().replace('.', ',')
        });
      }
      setZoneTableRows(rows);
    } else {
      setZoneTableRows([]);
    }
  }, [zoneHtOptions, zoneTvaOptions]);
  
  // Update zone options when current PDF changes
  useEffect(() => {
    if (extractionState.extractedDataList[extractionState.currentPdfIndex]) {
      const currentData = extractionState.extractedDataList[extractionState.currentPdfIndex];
      setZoneHtOptions(currentData.zoneHtBoxes || []);
      setZoneTvaOptions(currentData.zoneTvaBoxes || []);
    } else {
      setZoneHtOptions([]);
      setZoneTvaOptions([]);
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
          selectedZoneTaux: newExtractedDataList[currentIndex]?.selectedZoneTaux || '',
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
    //   extractedDataList: extractionState.extractedDataList,
    //   extractionResult: extractionState.extractionResult ? 'Has extraction result' : 'No extraction result',
    // });
  }, [extractionState.currentPdfIndex, extractionState.extractedDataList, extractionState.extractionResult, setExtractionState]);

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
          
          {/* Toggleable Zone Table for HT, Taux, TVA, TTC */}
          {zoneTableRows.length > 0 && (
            <div className="extraction-field-item">
              <button
                className="extraction-zone-table-toggle"
                onClick={() => setShowZoneTable((prev) => !prev)}
              >
                {showZoneTable ? "Masquer les valeurs détectées" : "Afficher les valeurs détectées (HT, Taux, TVA, TTC)"}
              </button>
              {showZoneTable && (
                <div className="extraction-zone-table-wrapper" style={{ marginTop: '12px', overflowX: 'auto' }}>
                  <table
                    className="extraction-zone-table"
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      background: '#fff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                      borderRadius: '8px',
                      fontSize: '1rem',
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: 600 }}>HT</th>
                        <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: 600 }}>Taux</th>
                        <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: 600 }}>TVA</th>
                        <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: 600 }}>TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zoneTableRows.map((row, idx) => (
                        <tr
                          key={idx}
                          style={{ background: idx % 2 === 0 ? '#fafafa' : '#fff', transition: 'background 0.2s' }}
                        >
                          <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'center' }}>{row.ht}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'center' }}>{row.taux}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'center' }}>{row.tva}</td>
                          <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'center' }}>{row.ttc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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