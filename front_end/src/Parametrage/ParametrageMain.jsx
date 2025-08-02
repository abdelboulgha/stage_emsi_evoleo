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
import ParametrageControls from "./ParametrageControls";
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left sidebar - Controls */}
          <div className="lg:col-span-1">
            <ParametrageControls
              dataPrepState={dataPrepState}
              handleDataPrepFileUpload={handleDataPrepFileUpload}
              handleZoomChange={handleZoomChange}
              isLoading={isLoading}
            />
          </div>

          {/* Center - Canvas area */}
          <div className="lg:col-span-2">
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
            />
          </div>

          {/* Right sidebar - Field mappings */}
          <div className="lg:col-span-1">
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
        </div>
      </div>
    </div>
  );
};

export default ParametrageMain; 