import React, { useRef, useState } from "react";
import { ZoomIn, ZoomOut, Upload } from "lucide-react";
import { createPortal } from "react-dom";

const PageSelectionModal = ({ isOpen, onClose, pages, onSelectPage }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="parametrage-modal-overlay">
      <div className="parametrage-modal">
        <div className="parametrage-modal-header">
          <h3 className="parametrage-modal-title">Sélectionnez une page</h3>
          <p className="parametrage-modal-subtitle">Choisissez une page pour configurer la facture.</p>
        </div>
        <div className="parametrage-modal-content">
          {pages.map((page, index) => (
            <div
              key={index}
              className="parametrage-modal-page-item"
              onClick={() => {
                console.log(`Selected page index: ${index}`); 
                onSelectPage(index);
              }}
            >
              <div className="parametrage-modal-page-preview">
                <img
                  src={page.preview}
                  alt={`Page ${index + 1}`}
                  className="parametrage-modal-page-image"
                />
              </div>
              <div className="parametrage-modal-page-label">
                Page {index + 1}
              </div>
            </div>
          ))}
        </div>
        <div className="parametrage-modal-footer">
          <button
            onClick={onClose}
            className="parametrage-modal-button"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

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
  getPagePreviews,
  showNotification,
}) => {
  const fileInputRef = useRef(null);
  const [showPageModal, setShowPageModal] = useState(false);
  const [pdfPages, setPdfPages] = useState([]);
  const [pendingFile, setPendingFile] = useState(null);

  // Handler to trigger file input
  const triggerFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ""; // Allow re-upload same file
    fileInputRef.current?.click();
  };

  // Handler for file selection
  const handleFileSelection = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      showNotification("Aucun fichier sélectionné", "error");
      return;
    }

    if (file.type === "application/pdf") {
      try {
        const pagePreviews = await getPagePreviews(file);
        console.log("Page previews received:", pagePreviews); // Debug
        if (pagePreviews.length > 1) {
          setPdfPages(pagePreviews);
          setPendingFile(file);
          setShowPageModal(true);
        } else {
          console.log("Single page PDF, processing directly with page_index 0"); // Debug
          handleDataPrepFileUpload({ target: { files: [file] } }, 0);
        }
      } catch (error) {
        showNotification(`Erreur lors de la récupération des pages: ${error.message}`, "error");
      }
    } else {
      handleDataPrepFileUpload(event);
    }
  };

  const handlePageSelect = (pageIndex) => {
    if (pendingFile) {
      console.log(`Processing file with pageIndex: ${pageIndex}`); 
      handleDataPrepFileUpload({ target: { files: [pendingFile] } }, pageIndex);
      setShowPageModal(false);
      setPendingFile(null);
      setPdfPages([]);
    }
  };

  return (
    <div className="parametrage-canvas-container">
      {/* Canvas controls */}
      <div className="parametrage-canvas-controls">
        <div className="parametrage-canvas-actions">
          <button
            onClick={triggerFileInput}
            className="parametrage-upload-button"
          >
            <Upload className="parametrage-upload-icon" />
            ↑ Nouveau fichier
          </button>
        </div>
        
        <div className="parametrage-zoom-controls">
          <span className="parametrage-zoom-text">Zoom: {Math.round(dataPrepState.zoom * 100)}%</span>
          <button
            onClick={() => handleZoomChange(dataPrepState.zoom - 0.1)}
            disabled={dataPrepState.zoom <= 0.3}
            className="parametrage-zoom-button"
          >
            <ZoomOut className="parametrage-zoom-icon" />
          </button>
          <button
            onClick={() => handleZoomChange(dataPrepState.zoom + 0.1)}
            disabled={dataPrepState.zoom >= 2}
            className="parametrage-zoom-button"
          >
            <ZoomIn className="parametrage-zoom-icon" />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="parametrage-canvas-area">
        {!dataPrepState.uploadedImage ? (
          <div className="parametrage-upload-zone">
            <div className="parametrage-upload-content">
              <Upload className="parametrage-upload-large-icon" />
              <h3 className="parametrage-upload-title">Aucun document sélectionné</h3>
              <p className="parametrage-upload-description">
                Cliquez sur "Nouveau fichier" pour commencer la configuration
              </p>
            </div>
          </div>
        ) : (
          <div className="parametrage-canvas-wrapper">
            <canvas
              ref={canvasRef}
              className="parametrage-canvas"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            />
            <img
              ref={imageRef}
              src={dataPrepState.uploadedImage}
              alt="Document"
              className="parametrage-canvas-image"
              style={{ display: "none" }}
            />
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleFileSelection}
        className="parametrage-hidden-input"
      />

      {/* Page selection modal */}
      <PageSelectionModal
        isOpen={showPageModal}
        onClose={() => setShowPageModal(false)}
        pages={pdfPages}
        onSelectPage={handlePageSelect}
      />
    </div>
  );
};

export default ParametrageCanvas;