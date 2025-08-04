import React, { useRef, useEffect, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import ParametrageCanvas from "./ParametrageCanvas";
import ParametrageFields from "./ParametrageFields";

const ParametrageMain = ({
  dataPrepState,
  setDataPrepState,
  manualDrawState,
  setManualDrawState,
  isLoading,
  handleDataPrepFileUpload,
  handleZoomChange,
  startFieldSelection,
  startManualDraw,
  saveMappings,
  showNotification,
  getPagePreviews,
  canvasRef,
  imageRef,
  redrawCanvas,
  handleCanvasMouseDown,
  handleCanvasMouseMove,
  handleCanvasMouseUp,
  drawOcrBox,
  ocrPreviewFields,
  setOcrPreviewFields,
}) => {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-6">
        <div className="grid grid-cols-[25%,70%] gap-6">
          {/* Left sidebar - Field mappings */}
          <div>
            <ParametrageFields
              dataPrepState={dataPrepState}
              setDataPrepState={setDataPrepState}
              startFieldSelection={startFieldSelection}
              startManualDraw={startManualDraw}
              saveMappings={saveMappings}
              isLoading={isLoading}
              showNotification={showNotification}
              ocrPreviewFields={ocrPreviewFields}
              setOcrPreviewFields={setOcrPreviewFields}
            />
          </div>

          {/* Right - Canvas area */}
          <div>
          <ParametrageCanvas
  dataPrepState={dataPrepState}
  manualDrawState={manualDrawState}
  canvasRef={canvasRef}
  imageRef={imageRef}
  redrawCanvas={redrawCanvas}
  handleCanvasMouseDown={handleCanvasMouseDown}
  handleCanvasMouseMove={handleCanvasMouseMove}
  handleCanvasMouseUp={handleCanvasMouseUp}
  drawOcrBox={drawOcrBox}
  handleDataPrepFileUpload={handleDataPrepFileUpload}
  handleZoomChange={handleZoomChange}
  showNotification={showNotification} 
  getPagePreviews={getPagePreviews} 
/>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParametrageMain;