import { useState } from 'react';
import { Upload, FileText, Image, X, Loader2, CheckCircle, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';

export default function FactureDocument({
  uploadedFile,
  filePreview,
  ocrBoxes,
  correctionField,
  onOcrBoxClick,
  fieldMappings,
  removeFile,
  isExtracting,
  extractionStatus,
  extractionMessage,
  styles,
  handleFileInputChange,
  isDragOver,
  handleDrop,
  handleDragOver,
  handleDragLeave
}) {
  const [fullscreen, setFullscreen] = useState(false);

  const previewContainerStyle = {
    ...styles.previewContainer,
    cursor: correctionField ? 'pointer' : 'default',
    position: 'relative',
    width: '100%',
    height: '400px',
    overflow: 'auto',
    ...(fullscreen ? {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 2000,
      background: 'rgba(0,0,0,0.95)',
      padding: 0,
      margin: 0
    } : {})
  };

  const pdfContentStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: '400px',
    minWidth: '100%',
    overflow: 'visible',
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>
        <Upload style={{...styles.iconMargin, color: '#059669'}} />
        Document de la Facture
      </h2>
      {/* Statut de l'extraction */}
      {isExtracting && (
        <div style={{...styles.statusBanner, ...styles.statusLoading}}>
          <Loader2 size={16} style={{animation: 'spin 1s linear infinite'}} />
          {extractionMessage}
        </div>
      )}
      {extractionStatus === 'success' && (
        <div style={{...styles.statusBanner, ...styles.statusSuccess}}>
          <CheckCircle size={16} />
          {extractionMessage}
        </div>
      )}
      {extractionStatus === 'error' && (
        <div style={{...styles.statusBanner, ...styles.statusError}}>
          <AlertCircle size={16} />
          {extractionMessage}
        </div>
      )}
      {!uploadedFile ? (
        <div
          style={{
            ...styles.dropZone,
            ...(isDragOver ? styles.dropZoneActive : {})
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div style={styles.dropZoneContent}>
            <div style={styles.iconContainer}>
              <Upload style={{color: '#6b7280'}} />
            </div>
            <div>
              <p style={styles.uploadText}>
                Glissez-déposez votre facture ici
              </p>
              <p style={styles.uploadSubtext}>
                PDF ou Image (JPG, PNG, etc.) - Extraction automatique
              </p>
              <p style={styles.uploadSubtext}>
                Formats supportés: Émetteur, TVA, Montants HT/TTC
              </p>
            </div>
            <label style={styles.uploadButton}>
              Choisir un fichier
              <input
                type="file"
                style={styles.fileInput}
                accept=".pdf,image/*"
                onChange={handleFileInputChange}
              />
            </label>
          </div>
        </div>
      ) : (
        <div>
          <div style={styles.fileInfo}>
            <div style={styles.fileInfoLeft}>
              {uploadedFile.type.startsWith('image/') ? (
                <Image style={{color: '#059669'}} />
              ) : (
                <FileText style={{color: '#dc2626'}} />
              )}
              <span style={styles.fileName}>
                {uploadedFile.name}
              </span>
            </div>
            <button
              onClick={removeFile}
              style={styles.removeButton}
              disabled={isExtracting}
            >
              <X size={16} />
            </button>
          </div>
          <div style={previewContainerStyle}>
            {/* Fullscreen button */}
            <button
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 2100,
                background: 'rgba(255,255,255,0.9)',
                border: 'none',
                borderRadius: 6,
                padding: 6,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
              }}
              onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? 'Quitter le mode plein écran' : 'Plein écran'}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <div style={pdfContentStyle}>
              {uploadedFile.type.startsWith('image/') ? (
                <img
                  src={filePreview}
                  alt="Preview"
                  style={styles.previewImage}
                  draggable={false}
                />
              ) : (
                <iframe
                  src={filePreview}
                  style={styles.previewIframe}
                  title="PDF Preview"
                />
              )}
              {/* OCR Boxes Overlay - clickable in correction mode for both images and PDFs */}
              {ocrBoxes.length > 0 && correctionField && (
                <>
                  {ocrBoxes.map((box, index) => {
                    const isMapped = Object.keys(fieldMappings).some(field => 
                      fieldMappings[field].left === box.left && 
                      fieldMappings[field].top === box.top
                    );
                    return (
                      <div
                        key={index}
                        style={{
                          ...styles.ocrBox,
                          left: `${box.left}px`,
                          top: `${box.top}px`,
                          width: `${box.width}px`,
                          height: `${box.height}px`,
                          ...(isMapped ? styles.ocrBoxMapped : {}),
                          border: '2px solid #f59e0b',
                          backgroundColor: 'rgba(245, 158, 11, 0.2)',
                          cursor: 'pointer',
                          zIndex: 100
                        }}
                        title={box.text}
                        onClick={() => onOcrBoxClick(box)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 