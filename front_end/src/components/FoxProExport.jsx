import React, { useState } from 'react';
import { Download, FileText, Package, Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const FoxProExport = ({ extractedDataList, onClose }) => {
  const [exportFormat, setExportFormat] = useState('complete_solution');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);

  const handleExport = async () => {
    if (!extractedDataList || extractedDataList.length === 0) {
      setExportStatus({ type: 'error', message: 'Aucune donnée à exporter' });
      return;
    }

    setIsExporting(true);
    setExportStatus(null);

    try {
      const response = await fetch('http://localhost:8000/export-foxpro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoices: extractedDataList,
          export_format: exportFormat,
          include_forms: true
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      // Télécharger le fichier
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      if (exportFormat === 'csv') {
        a.download = 'factures_foxpro.csv';
      } else {
        a.download = 'foxpro_solution.zip';
      }
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportStatus({ 
        type: 'success', 
        message: `Export ${exportFormat === 'csv' ? 'CSV' : 'solution complète'} réussi !` 
      });

    } catch (error) {
      console.error('Erreur export FoxPro:', error);
      setExportStatus({ 
        type: 'error', 
        message: `Erreur lors de l'export: ${error.message}` 
      });
    } finally {
      setIsExporting(false);
    }
  };

  const downloadTableStructure = async () => {
    try {
      const response = await fetch('http://localhost:8000/foxpro-table-structure');
      const data = await response.json();
      
      if (data.success) {
        // Créer un blob avec le script
        const blob = new Blob([data.table_script], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'create_table.prg';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setExportStatus({ 
          type: 'success', 
          message: 'Script de création de table téléchargé !' 
        });
      }
    } catch (error) {
      setExportStatus({ 
        type: 'error', 
        message: 'Erreur lors du téléchargement du script' 
      });
    }
  };

  const downloadFormTemplate = async () => {
    try {
      const response = await fetch('http://localhost:8000/foxpro-form-template');
      const data = await response.json();
      
      if (data.success) {
        // Créer un blob avec le code du formulaire
        const blob = new Blob([data.form_code], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'facture_form.prg';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setExportStatus({ 
          type: 'success', 
          message: 'Formulaire FoxPro téléchargé !' 
        });
      }
    } catch (error) {
      setExportStatus({ 
        type: 'error', 
        message: 'Erreur lors du téléchargement du formulaire' 
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">Export vers FoxPro</h2>
                <p className="text-blue-100 text-sm">
                  Exportez vos données vers FoxPro avec formulaires
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status */}
          {exportStatus && (
            <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
              exportStatus.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {exportStatus.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span className="font-medium">{exportStatus.message}</span>
            </div>
          )}

          {/* Data Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl">
            <h3 className="font-semibold text-gray-800 mb-2">Données à exporter</h3>
            <div className="text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Nombre de factures:</span>
                <span className="font-medium">{extractedDataList?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* Export Options */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-4">Options d'export</h3>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="exportFormat"
                  value="csv"
                  checked={exportFormat === 'csv'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="mt-1 h-4 w-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">CSV pour FoxPro</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Fichier CSV avec délimiteurs et encodage compatibles FoxPro (CP1252)
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="exportFormat"
                  value="complete_solution"
                  checked={exportFormat === 'complete_solution'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="mt-1 h-4 w-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-5 h-5 text-purple-600" />
                    <span className="font-medium">Solution complète (Recommandé)</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Archive ZIP avec données CSV, formulaires de saisie, scripts de création de table et menu principal
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Individual Downloads */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-4">Téléchargements individuels</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={downloadTableStructure}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <Database className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="font-medium text-sm">Structure de table</div>
                  <div className="text-xs text-gray-600">create_table.prg</div>
                </div>
              </button>

              <button
                onClick={downloadFormTemplate}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <FileText className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-sm">Formulaire de saisie</div>
                  <div className="text-xs text-gray-600">facture_form.prg</div>
                </div>
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-blue-50 rounded-xl">
            <h4 className="font-semibold text-blue-800 mb-2">Instructions d'installation</h4>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Téléchargez la solution complète ou les fichiers individuels</li>
              <li>Copiez les fichiers .prg dans votre répertoire FoxPro</li>
              <li>Dans FoxPro, exécutez d'abord: <code className="bg-blue-100 px-1 rounded">DO create_table.prg</code></li>
              <li>Lancez l'application: <code className="bg-blue-100 px-1 rounded">DO menu_principal.prg</code></li>
              <li>Utilisez "Importer depuis CSV" pour charger vos données</li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting || !extractedDataList?.length}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Export en cours...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Exporter vers FoxPro
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Composant principal avec bouton d'export
const FoxProIntegration = ({ extractedDataList }) => {
  const [showExportModal, setShowExportModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowExportModal(true)}
        disabled={!extractedDataList?.length}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <Database className="w-4 h-4" />
        Export FoxPro
      </button>

      {showExportModal && (
        <FoxProExport
          extractedDataList={extractedDataList}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </>
  );
};

export default FoxProIntegration;