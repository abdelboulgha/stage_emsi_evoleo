import React, { useRef, useCallback, useState } from "react";
import { Eye, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

const ExtractionPreview = ({
  extractionState,
  scrollToIndex,
  hoveredIndex,
  setHoveredIndex,
}) => {
  const previewImageRef = useRef(null);
  const extractionBoxesCanvasRef = useRef(null);
  const thumbnailsContainerRef = useRef(null);
  const [hoveredThumbnail, setHoveredThumbnail] = useState(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });

  const drawExtractionBoxes = useCallback(() => {
    const canvas = extractionBoxesCanvasRef.current;
    const img = previewImageRef.current;
    if (!canvas || !img) return;

    const data = extractionState.extractedDataList[extractionState.currentPdfIndex];
    if (!data) return;

    // Set canvas size to match the image's display size
    canvas.style.width = `${img.offsetWidth}px`;
    canvas.style.height = `${img.offsetHeight}px`;

    const scale = window.devicePixelRatio || 1;
    canvas.width = img.offsetWidth * scale;
    canvas.height = img.offsetHeight * scale;

    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const displayWidth = img.offsetWidth;
    const displayHeight = img.offsetHeight;

    const standardWidth = 1191;
    const standardHeight = 1684;

    let scaleX, scaleY;

    if (
      Math.abs(naturalWidth - standardWidth) < 50 &&
      Math.abs(naturalHeight - standardHeight) < 50
    ) {
      scaleX = displayWidth / standardWidth;
      scaleY = displayHeight / standardHeight;
  // console.log("Using standard dimensions scaling (1:1)");
    } else {
      const imgAspectRatio = naturalWidth / naturalHeight;
      const standardAspectRatio = standardWidth / standardHeight;

      if (imgAspectRatio > standardAspectRatio) {
        const scaledHeight = standardWidth / imgAspectRatio;
        const yOffset = (standardHeight - scaledHeight) / 2;
        scaleX = displayWidth / standardWidth;
        scaleY = displayHeight / scaledHeight;
  // console.log("Wider than standard - scaled to fit width", { yOffset });
      } else {
        const scaledWidth = standardHeight * imgAspectRatio;
        const xOffset = (standardWidth - scaledWidth) / 2;
        scaleX = displayWidth / scaledWidth;
        scaleY = displayHeight / standardHeight;
  // console.log("Taller than standard - scaled to fit height", { xOffset });
      }
    }

    // ✅ define drawBox BEFORE using it
    const drawBox = (box, color, label, labelPosition = "left") => {
      if (!box) return;
      const x = box.left * scaleX;
      const y = box.top * scaleY;
      const w = box.width * scaleX;
      const h = box.height * scaleY;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = color;
      ctx.font = "bold 12px Arial";

      if (labelPosition === "top") {
        ctx.textAlign = "center";
        ctx.fillText(label, x + w / 2, y - 5);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(label, x - 5, y + h / 2 + 4);
      }

      ctx.restore();
    };

    // ✅ now safe to call drawBox
  // if (data.boxNumFactureSearchArea?.width > 0) {
  //   drawBox(data.boxNumFactureSearchArea, "#ff9800", "NumFacture Search Area", "left");
  // }
  // if (data.boxDateFacturationSearchArea?.width > 0) {
  //   drawBox(data.boxDateFacturationSearchArea, "#ff9800", "Date Search Area", "left");
  // }

    if (data.boxDateFacturation) drawBox(data.boxDateFacturation, "#008000", "Date", "left");
    if (data.boxNumFacture) drawBox(data.boxNumFacture, "#6366f1", "N° Facture", "top");

  if (data.zone_HT_mapping?.width > 0) drawBox(data.zone_HT_mapping, "#00ffff", "HT Zone", "left");
  // if (data.boxHTSearchArea?.width > 0) drawBox(data.boxHTSearchArea, "#ff9800", "HT Search Area", "left");
  if (data.zone_tva_mapping?.width > 0) drawBox(data.zone_tva_mapping, "#00ffff", "TVA Zone", "left");
  // if (data.boxTVASearchArea?.width > 0) drawBox(data.boxTVASearchArea, "#ff9800", "TVA Search Area", "left");

    if (data.boxHT?.width > 0) {
      drawBox(data.boxHT, "#b91010ff", "HT", "left");
    } else if (data.ht_match?.search_area) {
      drawBox(data.ht_match.search_area, "#b9101066", "HT Area", "left");
    }

    if (data.boxTVA?.width > 0) {
      drawBox(data.boxTVA, "#0b0ff5ff", "TVA", "left");
    } else if (data.tva_match?.search_area) {
      drawBox(data.tva_match.search_area, "#0b0ff566", "TVA Area", "left");
    }

    if (data.montantHT && !data.ht_match?.search_area && !(data.boxHT?.width > 0)) {
      drawBox({ left: 10, top: 10, width: 20, height: 20 }, "#b91010ff", "HT", "left");
    }
    if (data.montantTVA && !data.tva_match?.search_area && !(data.boxTVA?.width > 0)) {
      drawBox({ left: 10, top: 40, width: 20, height: 20 }, "#0b0ff5ff", "TVA", "left");
    }
  }, [extractionState.extractedDataList, extractionState.currentPdfIndex, extractionState.filePreviews]);

  // Ensure boxes are drawn instantly when data or image changes
  React.useEffect(() => {
    const img = previewImageRef.current;
    if (img && img.complete) {
      drawExtractionBoxes();
    }
  }, [extractionState.extractedDataList, extractionState.currentPdfIndex, extractionState.filePreviews]);

  const getCurrentFilePreview = useCallback(() => {
    if (!extractionState.filePreviews || extractionState.filePreviews.length === 0) {
      return null;
    }
    const preview = extractionState.filePreviews[extractionState.currentPdfIndex];
    return typeof preview === "string" ? preview : preview?.preview;
  }, [extractionState.filePreviews, extractionState.currentPdfIndex]);

  const currentFilePreview = getCurrentFilePreview();

  const hasMissingFields = (index) => {
    const data = extractionState.extractedDataList[index];
    if (!data) return false;
    const requiredFields = ["fournisseur", "numeroFacture", "dateFacturation", "montantHT"];
    return requiredFields.some((field) => !data[field]);
  };

  const handleThumbnailScroll = useCallback((index) => {
    scrollToIndex(index);
    setTimeout(() => {
      const container = thumbnailsContainerRef.current;
      if (container) {
        const activeThumbnail = container.querySelector(".thumbnail.active");
        if (activeThumbnail) {
          activeThumbnail.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }
    }, 100);
  }, [scrollToIndex]);

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
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              <canvas
                ref={extractionBoxesCanvasRef}
                className="extraction-boxes-canvas"
                style={{ position: "absolute", top: 0, left: 0 }}
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

      {hoveredThumbnail !== null && (
        <div
          className="thumbnail-preview"
          style={{ left: `${previewPosition.x}px`, top: `${previewPosition.y}px` }}
        >
          <img
            src={
              typeof extractionState.filePreviews[hoveredThumbnail] === "string"
                ? extractionState.filePreviews[hoveredThumbnail]
                : extractionState.filePreviews[hoveredThumbnail]?.preview
            }
            alt={`Preview ${hoveredThumbnail + 1}`}
            className="preview-image"
          />
        </div>
      )}

      {extractionState.filePreviews && extractionState.filePreviews.length > 1 && (
        <div className="extraction-navigation">
          <button
            onClick={() => {
              if (extractionState.currentPdfIndex > 0) {
                handleThumbnailScroll(extractionState.currentPdfIndex - 1);
              }
            }}
            disabled={extractionState.currentPdfIndex === 0}
            className="extraction-nav-button"
            title="Document précédent"
          >
            <ChevronLeft className="extraction-nav-icon" />
          </button>

          <div className="extraction-thumbnails-container" ref={thumbnailsContainerRef}>
            {extractionState.filePreviews.map((preview, index) => {
              const previewSrc = typeof preview === "string" ? preview : preview.preview;
              return (
                <div
                  key={index}
                  className={`thumbnail ${
                    index === extractionState.currentPdfIndex ? "active" : ""
                  } ${hoveredIndex === index ? "hovered" : ""}`}
                  onClick={() => handleThumbnailScroll(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ position: "relative" }}
                >
                  <div
                    className="thumbnail-container"
                    onMouseEnter={() => setHoveredThumbnail(index)}
                    onMouseMove={(e) => {
                      setPreviewPosition({ x: e.clientX - 150, y: e.clientY - 600 });
                    }}
                    onMouseLeave={() => setHoveredThumbnail(null)}
                  >
                    <img src={previewSrc} alt={`Thumbnail ${index + 1}`} className="thumbnail-image" />
                    {hasMissingFields(index) && (
                      <div
                        style={{
                          position: "absolute",
                          top: "2px",
                          right: "2px",
                          backgroundColor: "rgba(220, 38, 38, 0.9)",
                          borderRadius: "50%",
                          width: "16px",
                          height: "16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: 10,
                        }}
                      >
                        <AlertTriangle className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => {
              if (extractionState.currentPdfIndex < extractionState.filePreviews.length - 1) {
                handleThumbnailScroll(extractionState.currentPdfIndex + 1);
              }
            }}
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
