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
    canvas.style.width = `${img.offsetWidth}px`;
    canvas.style.height = `${img.offsetHeight}px`;
    
    // Set the canvas resolution to match the display
    const scale = window.devicePixelRatio || 1;
    canvas.width = img.offsetWidth * scale;
    canvas.height = img.offsetHeight * scale;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get the current image dimensions for scaling
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const displayWidth = img.offsetWidth;
    const displayHeight = img.offsetHeight;
    
    // Calculate scale factors based on natural dimensions
    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;
    
    // Debug logging for coordinates
    console.log('=== DEBUG COORDINATES ===');
    console.log('Image dimensions - Natural:', { naturalWidth, naturalHeight }, 'Display:', { displayWidth, displayHeight });
    
    if (data.boxNumFacture) {
      console.log('Box Num Facture (original):', data.boxNumFacture);
      console.log('Box Num Facture (scaled):', {
        left: data.boxNumFacture.left * scaleX,
        top: data.boxNumFacture.top * scaleY,
        width: data.boxNumFacture.width * scaleX,
        height: data.boxNumFacture.height * scaleY
      });
    }
    
    // Draw search area first (behind other boxes)
    if (data.boxNumFactureSearchArea) {
      const { left, top, width, height } = data.boxNumFactureSearchArea;
      const x = left * scaleX;
      const y = top * scaleY;
      const w = width * scaleX;
      const h = height * scaleY;
      
      console.log('Search Area (original):', data.boxNumFactureSearchArea);
      console.log('Search Area (scaled):', { x, y, w, h });
      
      ctx.save();
      ctx.strokeStyle = '#6366f166';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#6366f122';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      
      // Add label with scaled position
      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Search Area', x + 5, y + 15);
      
      ctx.restore();
    }
    
    // Helper function to draw a box with consistent scaling
    const drawBox = (box, color, label, labelPosition = 'left') => {
      if (!box) return;
      
      const x = box.left * scaleX;
      const y = box.top * scaleY;
      const w = box.width * scaleX;
      const h = box.height * scaleY;
      
      // Draw box
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);
      
      // Draw label
      ctx.fillStyle = color;
      ctx.font = 'bold 12px Arial';
      
      if (labelPosition === 'top') {
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w/2, y - 5);
      } else { // left position
        ctx.textAlign = 'right';
        ctx.fillText(label, x - 5, y + h/2 + 4);
      }
      
      ctx.restore();
    };
    
    // Draw search areas first (behind other boxes)
    if (data.htSearchArea) {
      const { left, top, width, height } = data.htSearchArea;
      const x = left * scaleX;
      const y = top * scaleY;
      const w = width * scaleX;
      const h = height * scaleY;
      
      ctx.save();
      ctx.strokeStyle = '#b9101066';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#b9101122';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      
      // Add label
      ctx.fillStyle = '#b91010';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('HT Search Area', x + 5, y + 15);
      ctx.restore();
    }
    
    if (data.tvaSearchArea) {
      const { left, top, width, height } = data.tvaSearchArea;
      const x = left * scaleX;
      const y = top * scaleY;
      const w = width * scaleX;
      const h = height * scaleY;
      
      ctx.save();
      ctx.strokeStyle = '#0b0ff566';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#0b0ff522';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      
      // Add label
      ctx.fillStyle = '#0b0ff5';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('TVA Search Area', x + 5, y + 15);
      ctx.restore();
    }
    
    // Draw search areas first (behind other boxes)
    if (data.ht_match?.search_area) {
      const { left, top, width, height } = data.ht_match.search_area;
      
      // Log in the same format as other logs
      console.log('HT Search Area (original):', { 
        left, 
        top, 
        width, 
        height,
        type: 'search_area_ht'
      });
      
      // Log scaled coordinates in the same format
      console.log('HT Search Area (scaled):', {
        x: left * scaleX,
        y: top * scaleY,
        w: width * scaleX,
        h: height * scaleY
      });
      const x = left * scaleX;
      const y = top * scaleY;
      const w = width * scaleX;
      const h = height * scaleY;
      
      ctx.save();
      ctx.strokeStyle = '#b9101066';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#b9101122';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      
      // Add label
      ctx.fillStyle = '#b91010';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('HT Search Area', x + 5, y + 15);
      ctx.restore();
    }
    
    if (data.tva_match?.search_area) {
      const { left, top, width, height } = data.tva_match.search_area;
      
      // Log in the same format as other logs
      console.log('TVA Search Area (original):', { 
        left, 
        top, 
        width, 
        height,
        type: 'search_area_tva'
      });
      
      // Log scaled coordinates in the same format
      console.log('TVA Search Area (scaled):', {
        x: left * scaleX,
        y: top * scaleY,
        w: width * scaleX,
        h: height * scaleY
      });
      const x = left * scaleX;
      const y = top * scaleY;
      const w = width * scaleX;
      const h = height * scaleY;
      
      ctx.save();
      ctx.strokeStyle = '#0b0ff566';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#0b0ff522';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      
      // Add label
      ctx.fillStyle = '#0b0ff5';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('TVA Search Area', x + 5, y + 15);
      ctx.restore();
    }

    // Draw all boxes with consistent scaling (on top of search areas)
    if (data.boxDateFacturation) drawBox(data.boxDateFacturation, '#008000', 'Date', 'left');
    if (data.boxNumFacture) drawBox(data.boxNumFacture, '#6366f1', 'N° Facture', 'top');
    if (data.boxHT) drawBox(data.boxHT, '#b91010ff', 'HT', 'left');
    if (data.boxTVA) drawBox(data.boxTVA, '#0b0ff5ff', 'TVA', 'left');
  }, [extractionState.extractedDataList, extractionState.currentPdfIndex, extractionState.filePreviews]);
  
  // Redraw when data changes
  useEffect(() => {
    drawExtractionBoxes();
  }, [drawExtractionBoxes]);

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