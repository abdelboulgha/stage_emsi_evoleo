import React from "react";
import {
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const ParametrageFields = ({
  dataPrepState,
  setDataPrepState,
  startFieldSelection,
  startManualDraw,
  saveMappings,
  isLoading,
  showNotification,
  ocrPreviewFields,
  setOcrPreviewFields,
}) => {
  const FIELDS = [
    { 
      key: "fournisseur", 
      label: "Fournisseur", 
      type: "manual",
      description: "Saisissez le nom du fournisseur"
    },
    { 
      key: "numeroFacture", 
      label: "Numéro de Facture", 
      type: "ocr",
      description: ""
    },{ 
      key: "dateFacturation", 
      label: "Date de Facturation", 
      type: "date",
      description: "",
      format: "dd/MM/yyyy"  
    },
  ];

  const handleFournisseurChange = (value) => {
    setDataPrepState((prev) => ({
      ...prev,
      fieldMappings: {
        ...prev.fieldMappings,
        fournisseur: {
          ...prev.fieldMappings.fournisseur,
          manualValue: value,
        },
      },
    }));
  };

  return (
    <div className="parametrage-fields-container">
      <h3 className="parametrage-fields-title">Champs à mapper</h3>

      <div className="parametrage-fields-list">
        {FIELDS.map((field) => (
          <div key={field.key} className="parametrage-field-item">
            <div className="parametrage-field-header">
              <label className="parametrage-field-label">
                {field.label}
              </label>
              <div className="parametrage-field-actions">
                {(field.type === "ocr" || field.type === "date") && (
                  <>
                    <button
                      onClick={() => startFieldSelection(field.key)}
                      className="parametrage-action-button select"
                    >
                      Sélectionner
                    </button>
                 
                  </>
                )}
              </div>
            </div>

            {/* Field description */}
            <div className="parametrage-field-description">
              {field.description}
            </div>

            {/* Fournisseur input field */}
            {field.key === "fournisseur" && (
              <input
                type="text"
                value={dataPrepState.fieldMappings.fournisseur?.manualValue || ""}
                onChange={(e) => handleFournisseurChange(e.target.value)}
                placeholder="Saisissez le nom du fournisseur"
                className="parametrage-input-field"
              />
            )}

            {/* Display extracted value for OCR and date fields */}
            {(field.type === "ocr" || field.type === "date") && dataPrepState.fieldMappings[field.key] && (
              <div className="parametrage-extracted-value">
                <div className="parametrage-extracted-content">
                  <span>Valeur extraite:</span>
                  <span className="parametrage-extracted-text">
                    {ocrPreviewFields[field.key] || "Aucune valeur extraite"}
                  </span>
                </div>
              </div>
            )}

            {/* Status indicator */}
            <div className="parametrage-field-status">
              {dataPrepState.fieldMappings[field.key] ? (
                <div className="parametrage-status mapped">
                  <CheckCircle className="parametrage-status-icon" />
                  <span>Mappé</span>
                </div>
              ) : (
                <div className="parametrage-status unmapped">
                  <AlertCircle className="parametrage-status-icon" />
                  <span>Non mappé</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="parametrage-save-section">
        <button
          onClick={saveMappings}
          disabled={isLoading || !dataPrepState.uploadedImage}
          className="parametrage-save-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="parametrage-save-icon" />
              Sauvegarde...
            </>
          ) : (
            <>
              <Save className="parametrage-save-icon" />
              Sauvegarder les mappings
            </>
          )}
        </button>
      </div>

      {/* Progress indicator */}
      <div className="parametrage-progress-section">
        <div className="parametrage-progress-header">
          <span>Progression</span>
          <span>
            {Object.keys(dataPrepState.fieldMappings).filter(key => 
              dataPrepState.fieldMappings[key] && 
              (key === "fournisseur" ? dataPrepState.fieldMappings[key].manualValue : true)
            ).length} / {FIELDS.length}
          </span>
        </div>
        <div className="parametrage-progress-bar">
          <div
            className="parametrage-progress-fill"
            style={{
              width: `${(Object.keys(dataPrepState.fieldMappings).filter(key => 
                dataPrepState.fieldMappings[key] && 
                (key === "fournisseur" ? dataPrepState.fieldMappings[key].manualValue : true)
              ).length / FIELDS.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ParametrageFields;