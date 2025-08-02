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
    { key: "fournisseur", label: "Fournisseur", type: "manual" },
    { key: "numeroFacture", label: "Numéro de Facture", type: "ocr" },
    { key: "tauxTVA", label: "Taux TVA", type: "ocr" },
    { key: "montantHT", label: "Montant HT", type: "ocr" },
    { key: "montantTVA", label: "Montant TVA", type: "ocr" },
    { key: "montantTTC", label: "Montant TTC", type: "ocr" },
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
    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
      <h3 className="text-lg font-semibold text-white mb-4">Champs à mapper</h3>

      <div className="space-y-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="bg-white/10 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-blue-100">
                {field.label}
              </label>
              <div className="flex gap-1">
                {field.type === "ocr" && (
                  <>
                    <button
                      onClick={() => startFieldSelection(field.key)}
                      className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                    >
                      Sélectionner
                    </button>
                    <button
                      onClick={() => startManualDraw(field.key)}
                      className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 transition-colors"
                    >
                      Dessiner
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Fournisseur input field */}
            {field.key === "fournisseur" && (
              <input
                type="text"
                value={dataPrepState.fieldMappings.fournisseur?.manualValue || ""}
                onChange={(e) => handleFournisseurChange(e.target.value)}
                placeholder="Saisissez le nom du fournisseur"
                className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            )}

            {/* Status indicator */}
            <div className="mt-2 flex items-center gap-2">
              {dataPrepState.fieldMappings[field.key] ? (
                <div className="flex items-center gap-1 text-green-400 text-xs">
                  <CheckCircle className="w-3 h-3" />
                  <span>Mappé</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-yellow-400 text-xs">
                  <AlertCircle className="w-3 h-3" />
                  <span>Non mappé</span>
                </div>
              )}
            </div>

            {/* OCR Preview */}
            {ocrPreviewFields[field.key] && (
              <div className="mt-2 p-2 bg-blue-500/20 rounded text-xs text-blue-200">
                <strong>OCR:</strong> {ocrPreviewFields[field.key]}
              </div>
            )}

            {/* Coordinates display */}
            {dataPrepState.fieldMappings[field.key] && field.key !== "fournisseur" && (
              <div className="mt-2 p-2 bg-gray-500/20 rounded text-xs text-gray-300">
                <div>L: {Math.round(dataPrepState.fieldMappings[field.key].left)}</div>
                <div>T: {Math.round(dataPrepState.fieldMappings[field.key].top)}</div>
                <div>W: {Math.round(dataPrepState.fieldMappings[field.key].width)}</div>
                <div>H: {Math.round(dataPrepState.fieldMappings[field.key].height)}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={saveMappings}
          disabled={isLoading || !dataPrepState.uploadedImage}
          className="w-full px-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sauvegarde...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Sauvegarder les mappings
            </>
          )}
        </button>
      </div>

      {/* Progress indicator */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-blue-200 mb-1">
          <span>Progression</span>
          <span>
            {Object.keys(dataPrepState.fieldMappings).filter(key => 
              dataPrepState.fieldMappings[key] && 
              (key === "fournisseur" ? dataPrepState.fieldMappings[key].manualValue : true)
            ).length} / {FIELDS.length}
          </span>
        </div>
        <div className="w-full bg-white/20 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
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