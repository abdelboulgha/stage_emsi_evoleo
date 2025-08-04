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

  return (
    <div className="lg:col-span-2">
      <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Aperçu des Documents
          </h3>
          {extractionState.filePreviews.length > 0 && (
            <div className="text-sm text-blue-200">
              {extractionState.currentPdfIndex + 1} /{" "}
              {extractionState.filePreviews.length}
            </div>
          )}
        </div>

        {extractionState.filePreviews.length > 0 ? (
          <div className="relative">
            {/* Document preview container */}
            <div className="bg-white/10 rounded-xl p-4 border border-white/10 relative">
              <div className="w-full" style={{ height: "70vh" }}>
                <div className="w-full h-full overflow-auto bg-white rounded-lg shadow-lg p-4">
                  <div style={{ position: 'relative', width: '100%', height: 'auto' }}>
                    <img
                      ref={previewImageRef}
                      src={
                        extractionState.filePreviews[
                          extractionState.currentPdfIndex
                        ]
                      }
                      alt="Aperçu du document"
                      className="w-full h-auto object-contain"
                      style={{ minWidth: "100%", height: "auto" }}
                      onLoad={() => {
                       
                        setTimeout(() => {
                          if (extractionState.extractedDataList[extractionState.currentPdfIndex]) {
                            drawExtractionBoxes();
                          }
                        }, 100);
                      }}
                    />
                    {/* Canvas for extraction bounding boxes */}
                    <canvas
                      ref={extractionBoxesCanvasRef}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 10,
                      }}
                    />
                    {/* Canvas de dessin extraction superposé */}
                    <canvas
                      ref={extractCanvasRef}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 10,
                        cursor: 'default',
                      }}
                    />
                  </div>
                </div>
                
                {/* Miniatures superposées sur l'image */}
                {extractionState.filePreviews.length > 1 && (
                  <div className="absolute bottom-0 left-0 right-0 z-10 bg-transparent p-3">
                    <div className="flex items-center justify-between w-full">
                      <button
                        onClick={goToPrevPdf}
                        disabled={extractionState.currentPdfIndex === 0}
                        className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-full shadow-lg"
                      >
                        <ChevronLeft className="w-5 h-5 text-white" />
                      </button>
                      
                      <div className="flex gap-1">
                        {extractionState.filePreviews.map((preview, index) => {
                          const fileName = extractionState.previewDimensions?.[index]?.fileName || "";
                          const extractionData = extractionState.extractedDataList[index];
                          const extractionOk = isExtractionComplete(extractionData);
                          const extractionAttempted = extractionData && Object.keys(extractionData).length > 1;
                          const showBadge = extractionAttempted && !extractionOk;
                          
                          return (
                            <div
                              key={index}
                              onClick={() => scrollToIndex(index)}
                              className={`relative cursor-pointer transition-all duration-300 group`}
                              onMouseEnter={() => setHoveredIndex(index)}
                              onMouseLeave={() => setHoveredIndex(null)}
                              style={{
                                zIndex: hoveredIndex === index ? 2 : 1,
                                width: hoveredIndex === index ? 300 : 60,
                                height: hoveredIndex === index ? 500 : 85,
                                boxShadow: hoveredIndex === index ? "0 12px 48px rgba(0, 0, 0, 0.4), 0 6px 20px rgba(0, 0, 0, 0.2)" : undefined,
                                transition: "box-shadow 0.3s ease-in-out",
                                transform: hoveredIndex === index ? "scale(1.1)" : "scale(1)",
                                borderWidth: hoveredIndex === index ? 4 : 2,
                                borderColor: hoveredIndex === index ? "#3b82f6" : "#ffffff40",
                              }}
                            >
                              <img
                                src={preview}
                                alt={`Page ${index + 1}`}
                                className="w-full h-full object-contain bg-white rounded"
                              />
                              
                              {/* Badge d'avertissement si extraction incomplète */}
                              {showBadge && (
                                <div className="absolute top-1 left-1 bg-red-600 text-white text-xs font-bold px-1 py-0.5 rounded shadow z-30">
                                  ⚠️ Non paramétré
                                </div>
                              )}
                              
                              {/* Indicateur de page active */}
                              {index === extractionState.currentPdfIndex && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border border-white"></div>
                              )}
                              
                              {/* Badge du nombre de champs extraits */}
                              {extractionState.extractedDataList[index] && (
                                <>
                                  <div 
                                    className="absolute top-1 left-1 text-xs font-bold px-1 rounded"
                                    style={{
                                      backgroundColor: `rgba(${
                                        255 * (1 - Object.keys(extractionState.extractedDataList[index] || {}).length / 6)
                                      }, ${
                                        255 * (Object.keys(extractionState.extractedDataList[index] || {}).length / 6)
                                      }, 0, 0.9)`,
                                      color: "white",
                                      textShadow: "0 0 2px rgba(0,0,0,0.5)",
                                    }}
                                  >
                                    {Object.keys(extractionState.extractedDataList[index] || {}).length}
                                  </div>
                                  
                                </>
                              )}
                              
                              {/* Bouton pour paramétrer si extraction incomplète */}
                              {showBadge && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setCurrentStep("dataprep");
                                    setIsLoading(true);
                                    const res = await fetch(preview);
                                    const blob = await res.blob();
                                    const formData = new FormData();
                                    formData.append("file", blob, fileName || "page.png");
                                    try {
                                      const response = await fetch(`http://localhost:8000/upload-for-dataprep`, {
                                        method: "POST",
                                        body: formData,
                                      });
                                      const result = await response.json();
                                      if (result.success) {
                                        const imageToUse = result.unwarped_image || result.image;
                                        const widthToUse = result.unwarped_width || result.width;
                                        const heightToUse = result.unwarped_height || result.height;
                                        setDataPrepState((prev) => ({
                                          ...prev,
                                          uploadedImage: imageToUse,
                                          fileName: fileName,
                                          filePreview: imageToUse,
                                          imageDimensions: { width: widthToUse, height: heightToUse },
                                          ocrBoxes: result.boxes || [],
                                          fieldMappings: {},
                                          selectedBoxes: {},
                                        }));
                                      }
                                    } catch (error) {
                                      // Gestion d'erreur
                                    } finally {
                                      setIsLoading(false);
                                    }
                                  }}
                                  className="absolute bottom-1 left-1 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow z-30 hover:bg-blue-700 transition-colors"
                                >
                                  Paramétrer
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={goToNextPdf}
                        disabled={extractionState.currentPdfIndex === extractionState.filePreviews.length - 1}
                        className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-full shadow-lg"
                      >
                        <ChevronRight className="w-5 h-5 text-white" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Eye className="w-16 h-16 text-white/50 mx-auto mb-4" />
            <p className="text-white/70">Aucun document à afficher</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtractionPreview; 