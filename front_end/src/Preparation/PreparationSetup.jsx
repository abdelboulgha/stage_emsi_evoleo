import React from "react";
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
} from "lucide-react";

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
}) => {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Receipt className="w-6 h-6" />
              1. Type de facture
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() =>
                  setSetupState((prev) => ({
                    ...prev,
                    invoiceType: "achat",
                  }))
                }
                className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                  setupState.invoiceType === "achat"
                    ? "border-blue-400 bg-blue-500/20 text-white shadow-lg scale-105"
                    : "border-white/30 bg-white/10 text-blue-100 hover:border-white/50"
                }`}
              >
                <ShoppingCart className="w-12 h-12 mx-auto mb-3" />
                <h3 className="text-xl font-semibold mb-2">
                  Facture d'Achat
                </h3>
                <p className="text-sm opacity-80">
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
                className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                  setupState.invoiceType === "vente"
                    ? "border-green-400 bg-green-500/20 text-white shadow-lg scale-105"
                    : "border-white/30 bg-white/10 text-blue-100 hover:border-white/50"
                }`}
              >
                <Receipt className="w-12 h-12 mx-auto mb-3" />
                <h3 className="text-xl font-semibold mb-2">
                  Facture de Vente
                </h3>
                <p className="text-sm opacity-80">
                  Factures émises vers vos clients
                </p>
              </button>
            </div>
          </div>

          {setupState.invoiceType && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                2. Ajout d'un fournisseur
              </h2>

              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                <div className="space-y-4">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleSingleDataPrepUpload}
                    className="hidden"
                    id="single-dataprep-upload"
                  />
                  <label
                    htmlFor="single-dataprep-upload"
                    className="w-full p-6 border-2 border-dashed border-blue-400/50 rounded-xl text-blue-200 hover:border-blue-400 hover:text-white hover:bg-blue-500/10 transition-all flex items-center justify-center gap-3 bg-blue-500/5 cursor-pointer"
                  >
                    <Plus className="w-6 h-6" />
                    <div className="text-center">
                      <div className="font-semibold text-lg">
                        Paramétrer une nouvelle facture{" "}
                        {setupState.invoiceType === "achat" ? "d'achat" : "de vente"}
                      </div>
                    </div>
                    <ArrowRight className="w-6 h-6" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {setupState.invoiceType && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <FileText className="w-6 h-6" />
                3. Documents à traiter
              </h2>

              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                {/* Hidden input to maintain processingMode state */}
                <input
                  type="hidden"
                  name="processingMode"
                  value="same"
                />

                {/* Sélection du modèle */}
                <div className="mb-6">
                  <select
                    value={setupState.selectedModel}
                    onChange={(e) =>
                      setSetupState((prev) => ({
                        ...prev,
                        selectedModel: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    }}
                    required
                  >
                                         <option value="" style={{ color: 'black', backgroundColor: 'white' }}>
                       Sélectionnez un fournisseur
                     </option>
                     {Object.keys(mappings).map((tpl) => (
                       <option 
                         key={tpl} 
                         value={tpl}
                         style={{ color: 'black', backgroundColor: 'white' }}
                       >
                         {tpl}
                       </option>
                     ))}
                  </select>
                  {!setupState.selectedModel && (
                    <p className="text-yellow-300 text-sm mt-1">
                      ⚠️ Veuillez sélectionner un modèle pour continuer
                    </p>
                  )}
                </div>

                <div className="mb-6">
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
                    className="flex flex-col items-center justify-center w-full p-8 border-2 border-dashed border-white/30 rounded-xl cursor-pointer hover:border-white/50 transition-colors bg-white/10"
                  >
                    <Upload className="w-12 h-12 text-blue-200 mb-4" />
                    <span className="text-white font-medium text-lg mb-2">
                      Glissez vos fichiers ici ou cliquez pour
                      sélectionner
                    </span>
                    <span className="text-blue-200 text-sm">
                      PDF, PNG, JPG acceptés • Plusieurs fichiers
                      possible
                    </span>
                  </label>
                </div>

                {setupState.filePreviews.length > 0 && (
                  <div>
                    <h4 className="text-white font-medium mb-3">
                      Fichiers sélectionnés (
                      {setupState.filePreviews.length} page(s))
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {setupState.filePreviews.map((preview) => (
                        <div
                          key={preview.id}
                          className="relative group"
                        >
                          <div className="aspect-[3/4] rounded-lg overflow-hidden border border-white/30 bg-white/10">
                            <img
                              src={preview.preview}
                              alt={`${preview.fileName} - Page ${preview.pageNumber}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const index =
                                setupState.filePreviews.findIndex(
                                  (p) => p.id === preview.id
                                );
                              if (index !== -1) removeFile(index);
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <div
                            className="mt-2 text-xs text-blue-200 text-center truncate px-1"
                            title={preview.fileName}
                          >
                            {preview.fileName}
                            {preview.totalPages > 1 &&
                              ` (${preview.pageNumber}/${preview.totalPages})`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {setupState.invoiceType &&
            setupState.filePreviews.length > 0 && (
              <div className="text-center">
                <button
                  onClick={() =>
                    validateSetupAndProceed({
                      ...setupState,
                      // Ensure we're using the latest state values
                      invoiceType: setupState.invoiceType,
                      selectedFiles: setupState.selectedFiles,
                      filePreviews: setupState.filePreviews,
                    })
                  }
                  disabled={isLoading}
                  className="px-8 py-4 bg-gradient-to-r from-green-500 to-blue-600 text-white font-semibold text-lg rounded-2xl hover:from-green-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-3 mx-auto shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Préparation...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-6 h-6" />
                      Valider
                      <ArrowRight className="w-6 h-6" />
                    </>
                  )}
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default PreparationSetup; 