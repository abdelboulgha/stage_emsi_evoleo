import React, { useState } from "react";
import {
  Upload,
  FileText,
  Receipt,
  ShoppingCart,
  Building2,
  Plus,
  ArrowRight,
  X,
  CheckCircle,
  Loader2,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { createPortal } from "react-dom";
import "./PreparationSetup.css";

const PageSelectionModal = ({ isOpen, onClose, pages, onSelectPage }) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="preparation-modal-overlay">
      <div className="preparation-modal">
        <div className="preparation-modal-header">
          <h3 className="preparation-modal-title">Sélectionnez une page</h3>
          <p className="preparation-modal-subtitle">Choisissez une page pour configurer la facture.</p>
        </div>
        <div className="preparation-modal-content">
          {pages.map((page, index) => (
            <div
              key={index}
              className="preparation-modal-page-item"
              onClick={() => {
              
                onSelectPage(index);
              }}
            >
              <div className="preparation-modal-page-preview">
                <img
                  src={page.preview}
                  alt={`Page ${index + 1}`}
                  className="preparation-modal-page-image"
                />
              </div>
              <div className="preparation-modal-page-label">
                Page {index + 1}
              </div>
            </div>
          ))}
        </div>
        <div className="preparation-modal-footer">
          <button
            onClick={onClose}
            className="preparation-modal-button"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const PreparationSetup = ({
  setupState,
  setSetupState,
  mappings,
  isLoading,
  handleSetupFileUpload,
  handleSingleDataPrepUpload,
  validateSetupAndProceed,
  removeFile,
  showNotification,
  getPagePreviews,
}) => {
  const [showPageModal, setShowPageModal] = useState(false);
  const [pdfPages, setPdfPages] = useState([]);
  const [pendingFile, setPendingFile] = useState(null);

  const handleFileSelection = async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== "application/pdf") {
      showNotification("Veuillez sélectionner un fichier PDF.", "error");
      return;
    }

    try {
      const pagePreviews = await getPagePreviews(file);
     
      if (pagePreviews.length > 1) {
        setPdfPages(pagePreviews);
        setPendingFile(file);
        setShowPageModal(true);
      } else {
        
        handleSingleDataPrepUpload({ target: { files: [file] } }, 0);
      }
    } catch (error) {
      showNotification(`Erreur lors de la récupération des pages: ${error.message}`, "error");
    }
  };

  const handlePageSelect = (pageIndex) => {
    if (pendingFile) {
     
      handleSingleDataPrepUpload({ target: { files: [pendingFile] } }, pageIndex);
      setShowPageModal(false);
      setPendingFile(null);
      setPdfPages([]);
    }
  };

  return (
    <div className="preparation-setup">
      <div className="preparation-setup-header">
        <h1 className="preparation-setup-title">Configuration de l'Extraction</h1>
        <p className="preparation-setup-subtitle">
          Configurez votre extraction de factures en quelques étapes simples
        </p>
      </div>

      <div className="preparation-steps">
        {/* Étape 1: Type de facture */}
        <div className="preparation-step">
          <div className="preparation-step-header">
            <div className="preparation-step-icon">1</div>
            <div>
              <h3 className="preparation-step-title">Type de facture</h3>
              <p className="preparation-step-description">
                Sélectionnez le type de facture à traiter
              </p>
            </div>
          </div>
          
          <div className="preparation-step-content">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() =>
                  setSetupState((prev) => ({
                    ...prev,
                    invoiceType: "achat",
                  }))
                }
                className={`preparation-type-card ${
                  setupState.invoiceType === "achat" ? "active" : ""
                }`}
              >
                <div className="preparation-type-icon">
                  <ShoppingCart className="w-8 h-8" />
                </div>
                <h4 className="preparation-type-title">Facture d'Achat</h4>
                <p className="preparation-type-description">
                  Factures reçues de vos fournisseurs
                </p>
              </button>

              <button
                onClick={() =>
                  setSetupState((prev) => ({
                    ...prev,
                    invoiceType: "vente",
                  }))
                }
                className={`preparation-type-card ${
                  setupState.invoiceType === "vente" ? "active" : ""
                }`}
              >
                <div className="preparation-type-icon">
                  <DollarSign className="w-8 h-8" />
                </div>
                <h4 className="preparation-type-title">Facture de Vente</h4>
                <p className="preparation-type-description">
                  Factures émises vers vos clients
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Étape 2: Configuration du fournisseur */}
        {setupState.invoiceType && (
          <div className="preparation-step">
            <div className="preparation-step-header">
              <div className="preparation-step-icon">2</div>
              <div>
                <h3 className="preparation-step-title">Configuration</h3>
                <p className="preparation-step-description">
                  Paramétrez votre modèle de facture
                </p>
              </div>
            </div>
            
            <div className="preparation-step-content">
              <div className="preparation-upload-area">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelection}
                  className="hidden"
                  id="single-dataprep-upload"
                />
                <label
                  htmlFor="single-dataprep-upload"
                  className="preparation-upload-label"
                >
                  <div className="preparation-upload-icon">
                    <Plus className="w-8 h-8" />
                  </div>
                  <div className="preparation-upload-text">
                    Paramétrer une nouvelle facture{" "}
                    {setupState.invoiceType === "achat" ? "d'achat" : "de vente"}
                  </div>
                  <div className="preparation-upload-subtext">
                    Cliquez pour sélectionner un fichier PDF de référence
                  </div>
                  <ArrowRight className="w-6 h-6 text-gray-400" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Étape 3: Sélection du fournisseur */}
        {setupState.invoiceType && (
          <div className="preparation-step">
            <div className="preparation-step-header">
              <div className="preparation-step-icon">3</div>
              <div>
                <h3 className="preparation-step-title">Fournisseur</h3>
                <p className="preparation-step-description">
                  Sélectionnez le fournisseur configuré
                </p>
              </div>
            </div>
            
            <div className="preparation-step-content">
              <div className="preparation-select-container">
                <select
                  value={setupState.selectedModel?.id || ""}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedName = mappings[selectedId]?.template_name;
                    setSetupState(prev => ({
                      ...prev,
                      selectedModel: selectedId ? {
                        id: selectedId,
                        name: selectedName
                      } : ''
                    }));
                  }}
                  className="preparation-select"
                  required
                >
                  <option value="">Sélectionnez un fournisseur</option>
                  {Object.entries(mappings).map(([id, templateData]) => (
                    <option key={id} value={id}>
                      {templateData.template_name}
                    </option>
                  ))}
                </select>
                
                {!setupState.selectedModel?.id && (
                  <div className="preparation-warning">
                    <AlertTriangle className="w-5 h-5" />
                    <span>Veuillez sélectionner un fournisseur pour continuer</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Étape 4: Upload des documents */}
        {setupState.invoiceType && setupState.selectedModel?.id && (
          <div className="preparation-step">
            <div className="preparation-step-header">
              <div className="preparation-step-icon">4</div>
              <div>
                <h3 className="preparation-step-title">Documents à traiter</h3>
                <p className="preparation-step-description">
                  Uploadez vos factures à extraire
                </p>
              </div>
            </div>
            
            <div className="preparation-step-content">
              <div className="preparation-upload-area">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  onChange={handleSetupFileUpload}
                  className="hidden"
                  id="setup-file-input"
                />
                <label
                  htmlFor="setup-file-input"
                  className="preparation-upload-label"
                >
                  <div className="preparation-upload-icon">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div className="preparation-upload-text">
                    Glissez vos fichiers ici ou cliquez pour sélectionner
                  </div>
                  <div className="preparation-upload-subtext">
                    PDF, PNG, JPG acceptés • Plusieurs fichiers possible
                  </div>
                </label>
              </div>

              {setupState.filePreviews.length > 0 && (
                <div className="preparation-file-list">
                  <h4 className="preparation-file-list-title">
                    Fichiers sélectionnés ({setupState.filePreviews.length} page(s))
                  </h4>
                  <div className="preparation-file-grid">
                    {setupState.filePreviews.map((preview) => (
                      <div key={preview.id} className="preparation-file-item">
                        <div className="preparation-file-preview">
                          <img
                            src={preview.preview}
                            alt={`${preview.fileName} - Page ${preview.pageNumber}`}
                            className="preparation-file-image"
                          />
                          <button
                            onClick={() => {
                              const index = setupState.filePreviews.findIndex(
                                (p) => p.id === preview.id
                              );
                              if (index !== -1) removeFile(index);
                            }}
                            className="preparation-file-remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="preparation-file-info">
                          <span className="preparation-file-name">
                            {preview.fileName}
                          </span>
                          {preview.totalPages > 1 && (
                            <span className="preparation-file-pages">
                              Page {preview.pageNumber}/{preview.totalPages}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bouton de validation */}
      {setupState.invoiceType && setupState.filePreviews.length > 0 && (
        <div className="preparation-actions">
          <button
            onClick={() =>
              validateSetupAndProceed({
                ...setupState,
                invoiceType: setupState.invoiceType,
                selectedFiles: setupState.selectedFiles,
                filePreviews: setupState.filePreviews,
              })
            }
            disabled={isLoading}
            className="preparation-action-button primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Préparation...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Valider et continuer
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
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

export default PreparationSetup;