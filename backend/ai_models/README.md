# Modèle AI pour l'Extraction de Factures

## Description
Ce dossier contient le modèle YOLO entraîné pour l'extraction automatique de données de factures.

## Fichiers requis
- `best.pt` : Le modèle YOLO entraîné (à placer dans ce dossier)

## Classes détectées
Le modèle détecte automatiquement les champs suivants :
- **HT** (Montant Hors Taxes)
- **TTC** (Montant Toutes Taxes Comprises)
- **TVA** (Montant de la TVA)
- **date** (Date de facturation)
- **fournisseur** (Nom du fournisseur)
- **numFacture** (Numéro de facture)
- **taux** (Taux de TVA)

## Installation des dépendances
```bash
pip install -r ../Requirements+Readme/requirements.txt
```

## Utilisation
1. Placez votre fichier `best.pt` dans ce dossier
2. Le service AI sera automatiquement initialisé au démarrage du backend
3. Utilisez l'endpoint `/api/ai-extract` pour l'extraction

## Structure des données retournées
```json
{
  "success": true,
  "results": [
    {
      "file_path": "chemin/vers/fichier.pdf",
      "extracted_data": {
        "HT": ["100.00"],
        "TTC": ["120.00"],
        "TVA": ["20.00"],
        "date": ["01/01/2024"],
        "fournisseur": ["Nom Fournisseur"],
        "numFacture": ["FACT-001"],
        "taux": ["20.0"]
      },
      "detections": [...],
      "total_detections": 7
    }
  ]
}
```

## Notes
- Le modèle utilise Tesseract OCR pour l'extraction de texte
- Supporte les formats PDF et images (PNG, JPG, JPEG, BMP, TIFF)
- Seuil de confiance configurable (défaut: 0.5)
