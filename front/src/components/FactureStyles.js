const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  maxWidth: {
    maxWidth: '1400px',
    margin: '0 auto'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
    textAlign: 'center'
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: '32px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
    gap: '32px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    padding: '24px'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center'
  },
  iconMargin: {
    marginRight: '8px'
  },
  formGroup: {
    marginBottom: '16px'
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '16px',
    transition: 'all 0.2s',
    outline: 'none',
    boxSizing: 'border-box'
  },
  inputExtracted: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9'
  },
  inputRequired: {
    borderColor: '#ef4444'
  },
  flexRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  flexOne: {
    flex: 1
  },
  button: {
    padding: '12px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  buttonSecondary: {
    backgroundColor: '#6b7280',
    marginRight: '8px'
  },
  buttonSmall: {
    padding: '8px 12px',
    fontSize: '12px'
  },
  buttonGreen: {
    backgroundColor: '#059669',
    width: '100%',
    marginTop: '24px',
    padding: '16px'
  },
  buttonYellow: {
    backgroundColor: '#f59e0b',
    marginRight: '8px'
  },
  buttonRed: {
    backgroundColor: '#dc2626',
    padding: '8px 12px',
    fontSize: '12px'
  },
  buttonBlue: {
    backgroundColor: '#3b82f6',
    padding: '8px 12px',
    fontSize: '12px'
  },
  dropZone: {
    border: '2px dashed #d1d5db',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    transition: 'all 0.2s',
    cursor: 'pointer'
  },
  dropZoneActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff'
  },
  dropZoneContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px'
  },
  iconContainer: {
    padding: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '50%',
    display: 'inline-flex'
  },
  uploadText: {
    fontSize: '18px',
    fontWeight: '500',
    color: '#374151'
  },
  uploadSubtext: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '4px'
  },
  fileInput: {
    display: 'none'
  },
  uploadButton: {
    padding: '12px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    border: 'none'
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '16px'
  },
  fileInfoLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  fileName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151'
  },
  removeButton: {
    padding: '4px',
    color: '#dc2626',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  previewContainer: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative'
  },
  previewImage: {
    width: '100%',
    height: 'auto',
    maxHeight: '400px',
    objectFit: 'contain'
  },
  previewIframe: {
    width: '100%',
    height: '400px',
    border: 'none'
  },
  ocrBox: {
    position: 'absolute',
    border: '2px solid #3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  ocrBoxSelected: {
    border: '2px solid #f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.2)'
  },
  ocrBoxMapped: {
    border: '2px solid #059669',
    backgroundColor: 'rgba(5, 150, 105, 0.1)'
  },
  drawingBox: {
    position: 'absolute',
    border: '2px dashed #dc2626',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    pointerEvents: 'none'
  },
  statusBanner: {
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  statusLoading: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fbbf24'
  },
  statusSuccess: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    border: '1px solid #10b981'
  },
  statusError: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #ef4444'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '2px solid #e5e7eb'
  },
  mappingControls: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  },
  fieldButton: {
    padding: '8px 12px',
    margin: '4px',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.2s'
  },
  fieldButtonSelected: {
    backgroundColor: '#f59e0b',
    color: 'white',
    borderColor: '#f59e0b'
  },
  fieldButtonMapped: {
    backgroundColor: '#059669',
    color: 'white',
    borderColor: '#059669'
  },
  drawingModeIndicator: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    backgroundColor: '#dc2626',
    color: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }
};

export default styles; 