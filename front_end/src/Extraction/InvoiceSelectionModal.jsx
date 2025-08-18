import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Save,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const InvoiceSelectionModal = ({
  invoiceSelection,
  setInvoiceSelection,
  extractionState,
  toggleSelectAllInvoices,
  toggleInvoiceSelection,
  handleSaveInvoices,
}) => {
  // Check for invoices with missing required fields
  const hasMissingFields = (invoiceData) => {
    const requiredFields = ['fournisseur', 'numeroFacture', 'dateFacturation', 'montantHT'];
    return requiredFields.some(field => {
      const value = invoiceData[field];
      return value === undefined || value === null || value === '';
    });
  };

  // Deselect any invoices with missing fields when modal opens
  useEffect(() => {
    const invoicesWithMissingFields = extractionState.extractedDataList
      .map((data, index) => hasMissingFields(data) ? index : null)
      .filter(index => index !== null);
    
    if (invoicesWithMissingFields.length > 0) {
      setInvoiceSelection(prev => ({
        ...prev,
        selectedInvoices: prev.selectedInvoices.filter(
          idx => !invoicesWithMissingFields.includes(idx)
        )
      }));
    }
  }, [extractionState.extractedDataList]);

  if (!invoiceSelection.isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-800">
            Sélectionner les factures à enregistrer
          </h3>
          <p className="text-gray-600 text-sm mt-1">
            Cochez les factures que vous souhaitez
            enregistrer dans la base de données.
          </p>
        </div>
        
        <div className="overflow-y-auto flex-1 p-4">
          <div className="flex items-center gap-3 p-3 border-b sticky top-0 bg-white z-10">
            <input
              type="checkbox"
              id="select-all"
              checked={
                invoiceSelection.selectedInvoices
                  .length ===
                extractionState.extractedDataList.length
              }
              onChange={(e) =>
                toggleSelectAllInvoices(e.target.checked)
              }
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="select-all"
              className="text-sm font-medium text-gray-700"
            >
              Sélectionner tout
            </label>
          </div>
          
          <div className="divide-y">
            {extractionState.extractedDataList.map(
              (data, index) => (
                <div
                  key={index}
                  className="p-3 hover:bg-gray-50 flex items-center gap-3"
                >
                  <input
                    type="checkbox"
                    id={`invoice-${index}`}
                    checked={invoiceSelection.selectedInvoices.includes(index)}
                    onChange={() => toggleInvoiceSelection(index)}
                    disabled={hasMissingFields(data)}
                    className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                      hasMissingFields(data) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {hasMissingFields(data) && (
                        <span className="text-yellow-600" title="Champs manquants">
                          <AlertTriangle className="w-4 h-4" />
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {data.fournisseur || `Facture ${index + 1}`}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {data.numeroFacture && `N°${data.numeroFacture} • `}
                      {hasMissingFields(data) && 'Champs manquants'}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
        
        <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-end gap-3">
          <button
            onClick={() =>
              setInvoiceSelection((prev) => ({
                ...prev,
                isOpen: false,
              }))
            }
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSaveInvoices}
            disabled={
              invoiceSelection.selectedInvoices.length ===
                0 || invoiceSelection.isSaving
            }
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {invoiceSelection.isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Enregistrer (
                {invoiceSelection.selectedInvoices.length}
                )
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default InvoiceSelectionModal; 