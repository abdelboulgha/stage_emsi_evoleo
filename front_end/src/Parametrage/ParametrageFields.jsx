import React from "react";
import { CheckCircle, AlertCircle, Loader2, Save } from "lucide-react";

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
      key: "serial", 
      label: "Numéro de Série", 
      type: "manual",
      description: "Entrez un numéro de série à 9 chiffres"
    },
    { 
      key: "numeroFacture", 
      label: "Numéro de Facture", 
      type: "ocr",
      description: "Sélectionnez le numéro de facture sur l'image"
    },{ 
      key: "dateFacturation", 
      label: "Date de Facturation", 
      type: "date",
      description: "",
      format: "dd/MM/yyyy"  
    },
    { 
      key: "montantht", 
      label: "Montant HT", 
      type: "ocr",
      description: "Sélectionnez le montant HT sur l'image"
    },
    { 
      key: "tva", 
      label: "Montant TVA", 
      type: "ocr",
      description: "Sélectionnez le montant TVA sur l'image"
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

  const handleSerialChange = (value) => {
    // Only allow numbers and limit to 9 digits
    const numericValue = value.replace(/\D/g, '').slice(0, 9);
    setDataPrepState((prev) => ({
      ...prev,
      fieldMappings: {
        ...prev.fieldMappings,
        serial: {
          ...prev.fieldMappings.serial,
          manualValue: numericValue,
          isValid: numericValue.length === 9 // Mark as valid only if exactly 9 digits
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
              <div className="input-field-container">
                <input
                  type="text"
                  value={dataPrepState.fieldMappings.fournisseur?.manualValue || ""}
                  onChange={(e) => handleFournisseurChange(e.target.value)}
                  placeholder="Saisissez le nom du fournisseur"
                  className={`parametrage-input-field ${
                    dataPrepState.fieldMappings.fournisseur?.manualValue?.trim() ? 'valid' : 'invalid'
                  }`}
                />
                {!dataPrepState.fieldMappings.fournisseur?.manualValue?.trim() && (
                  <div className="input-error-message">Ce champ est requis</div>
                )}
              </div>
            )}

            {/* Serial number input field */}
            {field.key === "serial" && (
              <div className="input-field-container">
                <input
                  type="text"
                  value={dataPrepState.fieldMappings.serial?.manualValue || ""}
                  onChange={(e) => handleSerialChange(e.target.value)}
                  placeholder="Entrez un numéro de série à 9 chiffres"
                  className={`parametrage-input-field ${
                    dataPrepState.fieldMappings.serial?.manualValue?.length === 9 ? 'valid' : 'invalid'
                  }`}
                  maxLength={9}
                />
                {dataPrepState.fieldMappings.serial?.manualValue && dataPrepState.fieldMappings.serial.manualValue.length !== 9 && (
                  <div className="input-error-message">Le numéro de série doit comporter exactement 9 chiffres</div>
                )}
              </div>
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
          disabled={
            isLoading || 
            !dataPrepState.uploadedImage ||
            !dataPrepState.fieldMappings.fournisseur?.manualValue?.trim() ||
            dataPrepState.fieldMappings.serial?.manualValue?.length !== 9
          }
          className="parametrage-save-button"
          title={
            !dataPrepState.uploadedImage ? "Veuillez d'abord télécharger une image" :
            !dataPrepState.fieldMappings.fournisseur?.manualValue?.trim() ? "Le champ Fournisseur est requis" :
            dataPrepState.fieldMappings.serial?.manualValue?.length !== 9 ? "Le numéro de série doit comporter 9 chiffres" :
            "Enregistrer les mappings"
          }
        >
          {isLoading ? (
            <>
              <Loader2 className="parametrage-save-icon-loader" />
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
            {Object.keys(dataPrepState.fieldMappings).filter(key => {
              if (!dataPrepState.fieldMappings[key]) return false;
              if (key === "fournisseur") return !!dataPrepState.fieldMappings[key].manualValue;
              if (key === "serial") return dataPrepState.fieldMappings[key]?.manualValue?.length === 9;
              return true;
            }).length} / {FIELDS.length}
          </span>
        </div>
        <div className="parametrage-progress-bar">
          <div
            className="parametrage-progress-fill"
            style={{
              width: `${(Object.keys(dataPrepState.fieldMappings).filter(key => {
                if (!dataPrepState.fieldMappings[key]) return false;
                if (key === "fournisseur") return !!dataPrepState.fieldMappings[key].manualValue;
                if (key === "serial") return dataPrepState.fieldMappings[key]?.manualValue?.length === 9;
                return true;
              }).length / FIELDS.length) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ParametrageFields;