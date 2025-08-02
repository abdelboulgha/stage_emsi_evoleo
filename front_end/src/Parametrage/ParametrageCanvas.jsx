import React from "react";
import { ZoomIn, ZoomOut, Upload } from "lucide-react";

const ParametrageCanvas = ({
  dataPrepState,
  manualDrawState,
  canvasRef,
  imageRef,
  redrawCanvas,
  handleCanvasMouseDown,
  handleCanvasMouseMove,
  handleCanvasMouseUp,
  drawOcrBox,
  handleDataPrepFileUpload,
  handleZoomChange,
}) => {
  return (
    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Zone de Mapping</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDataPrepFileUpload}
            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
          >
            <Upload className="w-4 h-4 mr-1" /> Nouveau fichier
          </button>
          {dataPrepState.uploadedImage && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-200">
                Zoom: {Math.round(dataPrepState.currentZoom * 100)}%
              </span>
              <button
                onClick={() => handleZoomChange(0.8)}
                className="px-2 py-1 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center justify-center gap-1"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleZoomChange(1.25)}
                className="px-2 py-1 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center justify-center gap-1"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {dataPrepState.uploadedImage ? (
        <div className="relative bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
            <canvas
              ref={canvasRef}
              className="block"
              style={{
                cursor: dataPrepState.isSelecting
                  ? "crosshair"
                  : manualDrawState.isDrawing
                  ? "crosshair"
                  : "default",
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            />
            <img
              ref={imageRef}
              src={dataPrepState.uploadedImage}
              alt="Document à paramétrer"
              className="hidden"
            />
          </div>

          {/* OCR Preview */}
          {dataPrepState.ocrPreview && (
            <div className="absolute bottom-4 left-4 right-4 bg-black/70 text-white p-3 rounded-lg text-sm">
              {dataPrepState.ocrPreview}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-white/50 text-lg mb-2">
            Aucune image chargée
          </div>
          <div className="text-white/30 text-sm">
            Chargez une image pour commencer le paramétrage
          </div>
        </div>
      )}
    </div>
  );
};

export default ParametrageCanvas;