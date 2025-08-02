import React from "react";

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
}) => {
  return (
    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Zone de Mapping</h3>
        {dataPrepState.uploadedImage && (
          <div className="text-sm text-blue-200">
            Zoom: {Math.round(dataPrepState.currentZoom * 100)}%
          </div>
        )}
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

          {/* Status indicator */}
          <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded-lg text-sm">
            {dataPrepState.isSelecting
              ? `Sélection: ${dataPrepState.selectedField}`
              : manualDrawState.isDrawing
              ? `Dessin: ${manualDrawState.fieldKey}`
              : "Prêt"}
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