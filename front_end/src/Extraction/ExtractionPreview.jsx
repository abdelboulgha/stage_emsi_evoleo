import React, { useRef, useEffect, useCallback } from "react";
import {
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const ExtractionPreview = ({
  extractionState,
  scrollToIndex,
  goToPrevPdf,
  goToNextPdf,
  hoveredIndex,
  setHoveredIndex,
  isExtractionComplete,
  mappings,
  setCurrentStep,
  setIsLoading,
  setDataPrepState,
}) => {
  const previewImageRef = useRef(null);
  const extractCanvasRef = useRef(null);
  const extractionBoxesCanvasRef = useRef(null);

  const drawExtractionBoxes = useCallback(() => {
    const canvas = extractionBoxesCanvasRef.current;
    const img = previewImageRef.current;
    if (!canvas || !img) return;

    // Get the current extraction data for the page
    const data = extractionState.extractedDataList[extractionState.currentPdfIndex];
    if (!data) return;

    // Set canvas size to match the displayed image
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helper to draw a box
    const drawBox = (box, color, label, labelPosition = 'left') => {
      if (!box) return;
      // Scale coordinates
      const scaleX = img.clientWidth / img.naturalWidth;
      const scaleY = img.clientHeight / img.naturalHeight;
      const x = box.left * scaleX;
      const y = box.top * scaleY;
      const w = box.width * scaleX;
      const h = box.height * scaleY;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      // Draw label
      ctx.fillStyle = color;
      ctx.font = "bold 13px Arial";
      
      if (labelPosition === 'top') {
        ctx.textAlign = "left";
        ctx.fillText(label, x + 2, y - 5 < 10 ? y + 13 : y - 5);
      } else { // left position
        ctx.textAlign = "right";
        const textY = y + (h / 2) + 4; // Center vertically with the box
        ctx.fillText(label, x - 5, textY);
      }
      
      ctx.restore();
    };
    drawBox(data.boxDateFacturation, "#008000", "Date", 'left');
    drawBox(data.boxNumFacture, "#6366f1", "N° Facture", 'top');
    drawBox(data.boxHT, "#b91010ff", "HT", 'left');
    drawBox(data.boxTVA, "#0b0ff5ff", "TVA", 'left');
  }, [extractionState.extractedDataList, extractionState.currentPdfIndex]);


  useEffect(() => {
    if (extractionState.extractedDataList[extractionState.currentPdfIndex]) {
      drawExtractionBoxes();
    }
  }, [extractionState.extractedDataList, extractionState.currentPdfIndex, drawExtractionBoxes]);

  // Get the current file preview
  const getCurrentFilePreview = () => {
    if (extractionState.filePreviews && extractionState.filePreviews.length > 0) {
      const currentPreview = extractionState.filePreviews[extractionState.currentPdfIndex];
      // Handle both string and object formats
      if (typeof currentPreview === 'string') {
        return currentPreview;
      } else if (currentPreview && currentPreview.preview) {
        return currentPreview.preview;
      }
    }
    return null;
  };

  const currentFilePreview = getCurrentFilePreview();

  return (
    <div className="extraction-preview">
      <div className="extraction-preview-container">
        <div className="extraction-preview-header">
          <h3 className="extraction-preview-title">
            <Eye className="extraction-preview-icon" />
            Aperçu des Documents
          </h3>
          {extractionState.filePreviews && extractionState.filePreviews.length > 0 && (
            <div className="extraction-preview-counter">
              {extractionState.currentPdfIndex + 1} /{" "}
              {extractionState.filePreviews.length}
            </div>
          )}
        </div>

        {/* Navigation controls */}
        {extractionState.filePreviews && extractionState.filePreviews.length > 1 && (
          <div className="extraction-navigation">
            <button
              onClick={goToPrevPdf}
              disabled={extractionState.currentPdfIndex === 0}
              className="extraction-nav-button prev"
            >
              <ChevronLeft className="extraction-nav-icon" />
            </button>
            <button
              onClick={goToNextPdf}
              disabled={extractionState.currentPdfIndex === extractionState.filePreviews.length - 1}
              className="extraction-nav-button next"
            >
              <ChevronRight className="extraction-nav-icon" />
            </button>
          </div>
        )}

        {/* Document preview area */}
        <div className="extraction-preview-area">
          {currentFilePreview ? (
            <div className="extraction-preview-content">
              <img
                ref={previewImageRef}
                src={currentFilePreview}
                alt={`Document ${extractionState.currentPdfIndex + 1}`}
                className="extraction-preview-image"
                onLoad={drawExtractionBoxes}
              />
              <canvas
                ref={extractionBoxesCanvasRef}
                className="extraction-boxes-canvas"
              />
            </div>
          ) : (
            <div className="extraction-empty-state">
              <div className="extraction-empty-content">
                <Eye className="extraction-empty-icon" />
                <h3 className="extraction-empty-title">Aucun document à afficher</h3>
                <p className="extraction-empty-description">
                  Commencez par extraire des données pour voir l'aperçu
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail navigation */}
        {extractionState.filePreviews && extractionState.filePreviews.length > 1 && (
          <div className="extraction-thumbnails">
            <div className="extraction-thumbnails-container">
              {extractionState.filePreviews.map((preview, index) => {
                const previewSrc = typeof preview === 'string' ? preview : preview.preview;
                return (
                  <div
                    key={index}
                    className={`extraction-thumbnail ${index === extractionState.currentPdfIndex ? 'active' : ''} ${index === hoveredIndex ? 'hovered' : ''}`}
                    onClick={() => scrollToIndex(index)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <img
                      src={previewSrc}
                      alt={`Page ${index + 1}`}
                      className="extraction-thumbnail-image"
                    />
                    <div className="extraction-thumbnail-label">
                      Page {index + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtractionPreview; 