import { useCallback } from 'react';

const API_BASE_URL = "http://localhost:8000";

export const useInvoiceSelection = (extractionState, setExtractionState, invoiceSelection, setInvoiceSelection, showNotification, filterValue) => {
  const handleSaveInvoices = useCallback(async () => {
    const savedIndices = [];
    try {
      setInvoiceSelection((prev) => ({ ...prev, isSaving: true }));
      
      const invoicesToSave = extractionState.extractedDataList
        .filter((_, index) => invoiceSelection.selectedInvoices.includes(index))
        .map((data, index) => {
          console.log(`Processing invoice ${index + 1}:`, data); // Debug log
          
          // Apply filtering to each field using the filterValue function
          const fournisseur = filterValue(data.fournisseur, "fournisseur");
          const numeroFacture = filterValue(data.numeroFacture, "numeroFacture");
          const dateFacturation = filterValue(data.dateFacturation, "dateFacturation");
          const tauxTVA = filterValue(data.tauxTVA, "tauxTVA");
          const montantHT = filterValue(data.montantHT, "montantHT");
          const montantTVA = filterValue(data.montantTVA, "montantTVA");
          const montantTTC = filterValue(data.montantTTC, "montantTTC");

          console.log(`Filtered values for invoice ${index + 1}:`, {
            fournisseur,
            numeroFacture,
            dateFacturation,
            tauxTVA,
            montantHT,
            montantTVA,
            montantTTC
          }); // Debug log

          // Ensure all required fields are present and properly formatted
          const invoice = {
            fournisseur: fournisseur || "Fournisseur inconnu",
            numFacture: numeroFacture || "N/A", // Map numeroFacture to numFacture for backend
            dateFacturation: dateFacturation || new Date().toISOString().split('T')[0],
            tauxTVA: parseFloat(tauxTVA) || 0,
            montantHT: parseFloat(montantHT) || 0,
            montantTVA: parseFloat(montantTVA) || 0,
            montantTTC: parseFloat(montantTTC) || 0,
          };

          console.log(`Formatted invoice ${index + 1}:`, invoice); // Debug log

          // Validate required fields
          if (!invoice.fournisseur || invoice.fournisseur.trim() === "" || invoice.fournisseur === "Fournisseur inconnu") {
            throw new Error(`Invoice ${index + 1}: Le fournisseur est requis`);
          }
          if (!invoice.numFacture || invoice.numFacture.trim() === "" || invoice.numFacture === "N/A") {
            throw new Error(`Invoice ${index + 1}: Le numéro de facture est requis`);
          }
          if (!invoice.dateFacturation) {
            throw new Error(`Invoice ${index + 1}: La date de facturation est requise`);
          }

          // Ensure numeric values are valid
          if (isNaN(invoice.tauxTVA) || invoice.tauxTVA < 0) {
            invoice.tauxTVA = 0;
          }
          if (isNaN(invoice.montantHT) || invoice.montantHT < 0) {
            invoice.montantHT = 0;
          }
          if (isNaN(invoice.montantTVA) || invoice.montantTVA < 0) {
            invoice.montantTVA = 0;
          }
          if (isNaN(invoice.montantTTC) || invoice.montantTTC < 0) {
            invoice.montantTTC = 0;
          }

          return invoice;
        });

      console.log("All invoices to save:", invoicesToSave); // Debug log

      // Save each invoice one by one
      const results = [];
      for (let i = 0; i < invoicesToSave.length; i++) {
        const invoice = invoicesToSave[i];
        try {
          console.log("Sending invoice data:", invoice); // Debug log

          const response = await fetch(`${API_BASE_URL}/ajouter-facture`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: 'include', // Ajout des cookies
            body: JSON.stringify(invoice),
          });
          
          console.log("Response status:", response.status); // Debug log
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error("Backend error:", errorData); // Debug log
            throw new Error(errorData.detail || `Erreur ${response.status}: ${response.statusText}`);
          }
          
          const result = await response.json();
          console.log("Success response:", result); // Debug log
          results.push({ success: result.success, message: result.message });
          
          if (result.success) {
            savedIndices.push(i); // Track successfully saved invoice index
          } else {
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
          `Erreur lors de l'enregistrement des factures: ${results[0]?.message || "Erreur inconnue"}`,
          "error"
        );
      } else {
        showNotification(
          `${successCount} facture(s) enregistrée(s), ${errorCount} échec(s)`,
          "warning"
        );
      }
      
      // Remove saved invoices from the extraction state
      if (savedIndices.length > 0) {
        setExtractionState(prev => {
          const newExtractedDataList = [...prev.extractedDataList];
          const newFilePreviews = [...prev.filePreviews];
          
          // Remove in reverse order to avoid index shifting issues
          savedIndices.sort((a, b) => b - a).forEach(index => {
            newExtractedDataList.splice(index, 1);
            newFilePreviews.splice(index, 1);
          });
          
          // Update currentPdfIndex if needed
          let newCurrentPdfIndex = prev.currentPdfIndex;
          if (savedIndices.includes(prev.currentPdfIndex) || 
              prev.currentPdfIndex >= newExtractedDataList.length) {
            newCurrentPdfIndex = Math.max(0, newExtractedDataList.length - 1);
          } else {
            // Adjust currentPdfIndex if needed
            const numRemovedBefore = savedIndices.filter(i => i < prev.currentPdfIndex).length;
            if (numRemovedBefore > 0) {
              newCurrentPdfIndex = prev.currentPdfIndex - numRemovedBefore;
            }
          }
          
          return {
            ...prev,
            extractedDataList: newExtractedDataList,
            filePreviews: newFilePreviews,
            currentPdfIndex: newCurrentPdfIndex
          };
        });
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
    setExtractionState,
    invoiceSelection.selectedInvoices,
    showNotification,
    filterValue,
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