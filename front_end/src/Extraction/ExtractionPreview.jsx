import React, { useRef, useEffect, useCallback, useState } from "react";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";

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
  const [hoveredThumbnail, setHoveredThumbnail] = useState(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });

  const drawExtractionBoxes = useCallback(() => {
    const canvas = extractionBoxesCanvasRef.current;
    const img = previewImageRef.current;
    if (!canvas || !img) return;

    // Get the current extraction data for the page
    const data = extractionState.extractedDataList[extractionState.currentPdfIndex];
    if (!data) return;

    // Set canvas size to match the image's display size
    const container = img.parentElement;
    canvas.style.width = `${img.offsetWidth}px`;
    canvas.style.height = `${img.offsetHeight}px`;
    
    // Set the canvas resolution to match the display
    const scale = window.devicePixelRatio || 1;
    canvas.width = img.offsetWidth * scale;
    canvas.height = img.offsetHeight * scale;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Helper to draw a box
    const drawBox = (box, color, label, labelPosition = 'left') => {
      if (!box) return;
      
      // Get the actual dimensions of the displayed image
      const displayWidth = img.offsetWidth;
      const displayHeight = img.offsetHeight;
      
      // Use the image's natural dimensions for scaling
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      
      // Calculate scale factors based on natural dimensions
      const scaleX = displayWidth / naturalWidth;
      const scaleY = displayHeight / naturalHeight;
      
      // Scale the box coordinates from unwrapped image to displayed size
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

    // Draw each box
    const drawBoxes = () => {
      if (data.boxDateFacturation) drawBox(data.boxDateFacturation, '#008000', 'Date', 'left');
      if (data.boxNumFacture) drawBox(data.boxNumFacture, '#6366f1', 'N° Facture', 'top');
      if (data.boxHT) drawBox(data.boxHT, '#b91010ff', 'HT', 'left');
      if (data.boxTVA) drawBox(data.boxTVA, '#0b0ff5ff', 'TVA', 'left');
    };

    drawBoxes();
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
      <div className="extraction-preview-header">
        <h3 className="extraction-preview-title">Aperçu des Documents</h3>
        {extractionState.filePreviews && extractionState.filePreviews.length > 0 && (
          <div className="extraction-preview-counter">
            {extractionState.currentPdfIndex + 1} / {extractionState.filePreviews.length}
          </div>
        )}
      </div>

      {/* Document preview area */}
      <div className="extraction-preview-area">
        {currentFilePreview ? (
          <div className="extraction-preview-content">
            <div className="extraction-preview-image-container">
              <img
                ref={previewImageRef}
                src={currentFilePreview}
                alt={`Document ${extractionState.currentPdfIndex + 1}`}
                className="extraction-preview-image"
                onLoad={drawExtractionBoxes}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto'
                }}
              />
              <canvas
                ref={extractionBoxesCanvasRef}
                className="extraction-boxes-canvas"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0
                }}
              />
            </div>
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

      {/* Preview overlay */}
      {hoveredThumbnail !== null && (
        <div 
          className="thumbnail-preview"
          style={{
            left: `${previewPosition.x}px`,
            top: `${previewPosition.y}px`,
          }}
        >
          <img 
            src={typeof extractionState.filePreviews[hoveredThumbnail] === 'string' 
              ? extractionState.filePreviews[hoveredThumbnail] 
              : extractionState.filePreviews[hoveredThumbnail]?.preview} 
            alt={`Preview ${hoveredThumbnail + 1}`} 
            className="preview-image"
          />
        </div>
      )}

      {/* Navigation controls */}
      {extractionState.filePreviews && extractionState.filePreviews.length > 1 && (
        <div className="extraction-navigation">
          <button
            onClick={goToPrevPdf}
            disabled={extractionState.currentPdfIndex === 0}
            className="extraction-nav-button"
            title="Document précédent"
          >
            <ChevronLeft className="extraction-nav-icon" />
          </button>
          <div className="extraction-thumbnails-container">
            {extractionState.filePreviews.map((preview, index) => {
              const previewSrc = typeof preview === 'string' ? preview : preview.preview;
              return (
                <div
                  key={index}
                  className={`extraction-thumbnail ${extractionState.currentPdfIndex === index ? 'active' : ''}`}
                  onClick={() => scrollToIndex(index)}
                  title={`Document ${index + 1}`}
                >
                  <div 
                    className="thumbnail-container"
                    onMouseEnter={() => setHoveredThumbnail(index)}
                    onMouseMove={(e) => {
                      setPreviewPosition({
                        x: e.clientX - 150, // Center horizontally
                        y: e.clientY - 600  // Position preview so bottom is at cursor
                      });
                    }}
                    onMouseLeave={() => setHoveredThumbnail(null)}
                  >
                    <img 
                      src={previewSrc} 
                      alt={`Thumbnail ${index + 1}`} 
                      className="thumbnail-image"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={goToNextPdf}
            disabled={extractionState.currentPdfIndex === extractionState.filePreviews.length - 1}
            className="extraction-nav-button"
            title="Document suivant"
          >
            <ChevronRight className="extraction-nav-icon" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ExtractionPreview; 