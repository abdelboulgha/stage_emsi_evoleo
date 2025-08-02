import React from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Upload,
} from "lucide-react";

const ParametrageControls = ({
  dataPrepState,
  handleDataPrepFileUpload,
  handleZoomChange,
  isLoading,
}) => {
  return (
    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
      <h3 className="text-lg font-semibold text-white mb-4">Contrôles</h3>

      {/* File Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-blue-100 mb-2">
          Charger une image
        </label>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleDataPrepFileUpload}
          className="hidden"
          id="dataprep-file-input"
          disabled={isLoading}
        />
        <label
          htmlFor="dataprep-file-input"
          className="flex flex-col items-center justify-center w-full p-4 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:border-white/50 transition-colors bg-white/10 disabled:opacity-50"
        >
          <Upload className="w-8 h-8 text-blue-200 mb-2" />
          <span className="text-white font-medium text-sm">
            {isLoading ? "Chargement..." : "Cliquez pour sélectionner"}
          </span>
          <span className="text-blue-200 text-xs">
            PDF, PNG, JPG acceptés
          </span>
        </label>
      </div>

      {/* Zoom Controls */}
      {dataPrepState.uploadedImage && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-blue-100 mb-2">
            Zoom
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => handleZoomChange(0.8)}
              className="flex-1 px-3 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center justify-center gap-2"
            >
              <ZoomOut className="w-4 h-4" />
              <span className="text-sm">-</span>
            </button>
            <button
              onClick={() => handleZoomChange(1.25)}
              className="flex-1 px-3 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center justify-center gap-2"
            >
              <ZoomIn className="w-4 h-4" />
              <span className="text-sm">+</span>
            </button>
          </div>
          <div className="mt-2 text-center">
            <span className="text-xs text-blue-200">
              {Math.round(dataPrepState.currentZoom * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Image Info */}
      {dataPrepState.uploadedImage && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-blue-100 mb-2">
            Informations
          </label>
          <div className="bg-white/10 rounded-lg p-3 text-sm text-white/80">
            <div className="flex justify-between mb-1">
              <span>Largeur:</span>
              <span>{dataPrepState.imageDimensions.width}px</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>Hauteur:</span>
              <span>{dataPrepState.imageDimensions.height}px</span>
            </div>
            <div className="flex justify-between">
              <span>Boîtes OCR:</span>
              <span>{dataPrepState.ocrBoxes.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-500/20 rounded-lg p-3 border border-blue-400/30">
        <h4 className="text-sm font-medium text-blue-100 mb-2">
          Instructions
        </h4>
        <ul className="text-xs text-blue-200 space-y-1">
          <li>• Cliquez sur "Sélectionner" pour choisir une boîte OCR</li>
          <li>• Cliquez sur "Dessiner" pour créer une zone manuelle</li>
          <li>• Utilisez les contrôles de zoom pour naviguer</li>
          <li>• Sauvegardez vos mappings une fois terminé</li>
        </ul>
      </div>
    </div>
  );
};

export default ParametrageControls; 