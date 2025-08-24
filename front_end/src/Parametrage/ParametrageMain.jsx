import React from "react";
import ParametrageCanvas from "./ParametrageCanvas";
import ParametrageFields from "./ParametrageFields";
import "./ParametrageMain.css";

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
    <div className="parametrage-container">
      <div className="parametrage-content">

        <div className="parametrage-grid">
          {/* Left sidebar - Field mappings */}
          <div className="parametrage-section">
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
          <div className="parametrage-section">
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