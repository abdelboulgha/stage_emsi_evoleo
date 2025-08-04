import React, { useRef, useState } from "react";
import { ZoomIn, ZoomOut, Upload } from "lucide-react";
import { createPortal } from "react-dom";


const PageSelectionModal = ({ isOpen, onClose, pages, onSelectPage }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl flex flex-col">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Sélectionnez une page</h3>
          <p className="text-gray-600 text-sm mb-1">Choisissez une page pour configurer la facture.</p>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto">
          {pages.map((page, index) => (
            <div
              key={index}
              className="relative group cursor-pointer"
              onClick={() => {
                console.log(`Selected page index: ${index}`); 
                onSelectPage(index);
              }}
            >
              <div className="aspect-[3/4] rounded-lg overflow-hidden border border-gray-300 bg-white/10">
                <img
                  src={page.preview}
                  alt={`Page ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-2 text-sm text-gray-800 text-center">
                Page {index + 1}
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
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
  getPagePreviews, // Add getPagePreviews prop
  showNotification, // Add showNotification prop
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
    } else if (file.type.startsWith("image/")) {
      handleDataPrepFileUpload({ target: { files: [file] } }, 0);
    } else {
      showNotification("Type de fichier non supporté. Veuillez sélectionner un PDF ou une image.", "error");
    }
  };

  // Handler for page selection
  const handlePageSelect = (pageIndex) => {
    if (pendingFile) {
      console.log(`Processing file with pageIndex: ${pageIndex}`); // Debug
      handleDataPrepFileUpload({ target: { files: [pendingFile] } }, pageIndex);
      setShowPageModal(false);
      setPendingFile(null);
      setPdfPages([]);
    }
  };

  return (
    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Zone de Mapping</h3>
        <div className="flex items-center gap-6 justify-center w-full">
          <button
            type="button"
            onClick={triggerFileInput}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Nouveau fichier
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: "none" }}
            onChange={handleFileSelection} // Updated to handleFileSelection
          />
          {dataPrepState.uploadedImage && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-200">
                Zoom: {Math.round(dataPrepState.currentZoom * 100)}%
              </span>
              <button
                onClick={() => handleZoomChange(0.8)}
                className="px-2 py-1 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center justify-center gap-1"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleZoomChange(1.25)}
                className="px-2 py-1 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center justify-center gap-1"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
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