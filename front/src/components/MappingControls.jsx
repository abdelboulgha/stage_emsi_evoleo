import { Edit3, Save } from 'lucide-react';

export default function MappingControls({
  fieldMappings,
  getFieldDisplayName,
  saveMapping,
  styles
}) {
  if (!fieldMappings || Object.keys(fieldMappings).length === 0) return null;
  return (
    <div style={styles.mappingControls}>
      <h4 style={{marginBottom: '12px', fontSize: '14px', fontWeight: '600'}}>
        <Edit3 size={14} style={{marginRight: '8px'}} />
        Champs mappés
      </h4>
      <div style={{marginBottom: '12px'}}>
        {Object.keys(fieldMappings).map(field => (
          <span
            key={field}
            style={{
              ...styles.fieldButton,
              ...styles.fieldButtonMapped,
              margin: '4px'
            }}
          >
            {getFieldDisplayName(field)} ✓
          </span>
        ))}
      </div>
      <div style={styles.flexRow}>
        <button
          onClick={saveMapping}
          style={{...styles.button, ...styles.buttonYellow}}
        >
          <Save size={14} style={{marginRight: '4px'}} />
          Sauvegarder Mapping
        </button>
      </div>
    </div>
  );
} 