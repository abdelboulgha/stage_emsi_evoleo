import { MousePointer, Building } from 'lucide-react';

export default function FactureFields({
  invoiceData,
  extractionStatus,
  handleInputChange,
  startFieldCorrection,
  uploadedFile,
  saveInvoice,
  styles
}) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>
        Informations de la Facture
      </h2>
      <div>
        {/* Informations générales */}
        <div style={styles.sectionTitle}>
          📄 Informations générales
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Numéro de Facture *
          </label>
          <div style={styles.flexRow}>
            <input
              type="text"
              name="numeroFacture"
              value={invoiceData.numeroFacture}
              onChange={handleInputChange}
              style={{
                ...styles.input,
                ...(invoiceData.numeroFacture && extractionStatus === 'success' ? styles.inputExtracted : {}),
                ...(!invoiceData.numeroFacture ? styles.inputRequired : {})
              }}
              placeholder="Ex: IN2411-0001, FAC-2024-001"
            />
            <button
              onClick={() => startFieldCorrection('numeroFacture')}
              style={{...styles.button, ...styles.buttonBlue}}
              disabled={!uploadedFile}
              title="Corriger ce champ"
            >
              <MousePointer size={12} />
            </button>
          </div>
        </div>
        <div>
          <label style={styles.label}>
            <Building size={14} style={{display: 'inline', marginRight: '4px'}} />
            Émetteur
          </label>
          <div style={styles.flexRow}>
            <input
              type="text"
              name="emetteur"
              value={invoiceData.emetteur}
              onChange={handleInputChange}
              style={{
                ...styles.input,
                ...(invoiceData.emetteur && extractionStatus === 'success' ? styles.inputExtracted : {})
              }}
              placeholder="Nom de l'entreprise"
            />
            <button
              onClick={() => startFieldCorrection('emetteur')}
              style={{...styles.button, ...styles.buttonBlue}}
              disabled={!uploadedFile}
              title="Corriger ce champ"
            >
              <MousePointer size={12} />
            </button>
          </div>
        </div>
        {/* Montants */}
        <div style={styles.sectionTitle}>
          💰 Montants et TVA
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Taux TVA (%)
          </label>
          <div style={styles.flexRow}>
            <input
              type="number"
              name="tauxTVA"
              value={invoiceData.tauxTVA}
              onChange={handleInputChange}
              step="0.01"
              style={{
                ...styles.input,
                ...(invoiceData.tauxTVA && extractionStatus === 'success' ? styles.inputExtracted : {})
              }}
              placeholder="20.00"
            />
            <button
              onClick={() => startFieldCorrection('tauxTVA')}
              style={{...styles.button, ...styles.buttonBlue}}
              disabled={!uploadedFile}
              title="Corriger ce champ"
            >
              <MousePointer size={12} />
            </button>
          </div>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Montant HT (DH)
          </label>
          <div style={styles.flexRow}>
            <input
              type="number"
              name="montantHT"
              value={invoiceData.montantHT}
              onChange={handleInputChange}
              step="0.01"
              style={{
                ...styles.input,
                ...styles.flexOne,
                ...(invoiceData.montantHT && extractionStatus === 'success' ? styles.inputExtracted : {})
              }}
              placeholder="275.00"
            />
            <button
              onClick={() => startFieldCorrection('montantHT')}
              style={{...styles.button, ...styles.buttonBlue}}
              disabled={!uploadedFile}
              title="Corriger ce champ"
            >
              <MousePointer size={12} />
            </button>
          </div>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Montant TVA (DH)
          </label>
          <div style={styles.flexRow}>
            <input
              type="number"
              name="montantTVA"
              value={invoiceData.montantTVA}
              onChange={handleInputChange}
              step="0.01"
              style={{
                ...styles.input,
                ...(invoiceData.montantTVA && extractionStatus === 'success' ? styles.inputExtracted : {})
              }}
              placeholder="55.00"
            />
            <button
              onClick={() => startFieldCorrection('montantTVA')}
              style={{...styles.button, ...styles.buttonBlue}}
              disabled={!uploadedFile}
              title="Corriger ce champ"
            >
              <MousePointer size={12} />
            </button>
          </div>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Montant TTC (DH) *
          </label>
          <div style={styles.flexRow}>
            <input
              type="number"
              name="montantTTC"
              value={invoiceData.montantTTC}
              onChange={handleInputChange}
              step="0.01"
              style={{
                ...styles.input,
                ...styles.flexOne,
                ...(invoiceData.montantTTC && extractionStatus === 'success' ? styles.inputExtracted : {}),
                ...(!invoiceData.montantTTC ? styles.inputRequired : {})
              }}
              placeholder="330.00"
            />
            <button
              onClick={() => startFieldCorrection('montantTTC')}
              style={{...styles.button, ...styles.buttonBlue}}
              disabled={!uploadedFile}
              title="Corriger ce champ"
            >
              <MousePointer size={12} />
            </button>
          </div>
        </div>
        <div style={styles.flexRow}>
          <button
            type="button"
            onClick={saveInvoice}
            style={{...styles.button, ...styles.buttonGreen, flex: 1}}
          >
            Enregistrer la Facture
          </button>
        </div>
      </div>
    </div>
  );
} 