import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = "http://localhost:8000";

export const useInvoiceSelection = (extractionState, invoiceSelection, setInvoiceSelection, showNotification, filterValue) => {
  const { token } = useAuth();
  const handleSaveInvoices = useCallback(async () => {
    try {
      setInvoiceSelection((prev) => ({ ...prev, isSaving: true }));
      
      const invoicesToSave = extractionState.extractedDataList
        .filter((_, index) => invoiceSelection.selectedInvoices.includes(index))
        .map((data) => {
          // Apply filtering to each field using the filterValue function
          const fournisseur = filterValue(data.fournisseur, "fournisseur");
          const numeroFacture = filterValue(data.numeroFacture, "numeroFacture");
          const dateFacturation = filterValue(data.dateFacturation, "dateFacturation") || new Date().toISOString().split('T')[0];
          const tauxTVA = filterValue(data.tauxTVA, "tauxTVA");
          const montantHT = filterValue(data.montantHT, "montantHT");
          const montantTVA = filterValue(data.montantTVA, "montantTVA");
          const montantTTC = filterValue(data.montantTTC, "montantTTC");

          // Return the invoice data with proper types
          return {
            fournisseur,
            numFacture: numeroFacture, // Map numeroFacture to numFacture for backend
            dateFacturation,
            tauxTVA: parseFloat(tauxTVA) || 0,
            montantHT: parseFloat(montantHT) || 0,
            montantTVA: parseFloat(montantTVA) || 0,
            montantTTC: parseFloat(montantTTC) || 0,
          };
        });

      // Save each invoice one by one
      const results = [];
      for (const invoice of invoicesToSave) {
        try {
          const headers = {
            "Content-Type": "application/json",
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(`${API_BASE_URL}/ajouter-facture`, {
            method: "POST",
            headers,
            body: JSON.stringify(invoice),
          });
          
          const result = await response.json();
          results.push({ success: result.success, message: result.message });
          
          if (!result.success) {
            console.error("Error saving invoice:", result.message);
          }
        } catch (error) {
          console.error("Error saving invoice:", error);
          results.push({ success: false, message: error.message });
        }
      }
      
      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.length - successCount;
      
      if (errorCount === 0) {
        showNotification(
          `${successCount} facture(s) enregistrée(s) avec succès`,
          "success"
        );
      } else if (successCount === 0) {
        showNotification(
          `Erreur lors de l'enregistrement des factures`,
          "error"
        );
      } else {
        showNotification(
          `${successCount} facture(s) enregistrée(s), ${errorCount} échec(s)`,
          "warning"
        );
      }
      
      // Close the modal and reset state
      setInvoiceSelection((prev) => ({
        ...prev,
        isOpen: false,
        selectedInvoices: [],
        isSaving: false,
      }));
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des factures:", error);
      showNotification(
        error.message || "Erreur lors de la sauvegarde des factures",
        "error"
      );
      setInvoiceSelection((prev) => ({ ...prev, isSaving: false }));
    }
  }, [
    extractionState,
    invoiceSelection.selectedInvoices,
    showNotification,
    filterValue,
    token,
  ]);

  const toggleSelectAllInvoices = useCallback(
    (checked) => {
      if (checked) {
        setInvoiceSelection((prev) => ({
          ...prev,
          selectedInvoices: extractionState.extractedDataList.map(
            (_, index) => index
          ),
        }));
      } else {
        setInvoiceSelection((prev) => ({ ...prev, selectedInvoices: [] }));
      }
    },
    [extractionState.extractedDataList]
  );

  const toggleInvoiceSelection = useCallback((index) => {
    setInvoiceSelection((prev) => {
      const selected = [...prev.selectedInvoices];
      const idx = selected.indexOf(index);
      if (idx === -1) {
        selected.push(index);
      } else {
        selected.splice(idx, 1);
      }
      return { ...prev, selectedInvoices: selected };
    });
  }, []);

  const openSaveModal = useCallback(() => {
    setInvoiceSelection((prev) => ({
      ...prev,
      isOpen: true,
      selectedInvoices: extractionState.extractedDataList.map(
        (_, index) => index
      ),
    }));
  }, [extractionState.extractedDataList]);

  return {
    handleSaveInvoices,
    toggleSelectAllInvoices,
    toggleInvoiceSelection,
    openSaveModal,
  };
}; 