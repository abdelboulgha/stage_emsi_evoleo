# Structure Modulaire du Frontend

## Vue d'ensemble

Le frontend a été restructuré en composants modulaires organisés dans 4 dossiers principaux :

### 📁 Preparation/
Composants pour la section de préparation des factures
- **PreparationSetup.jsx** - Interface principale de configuration (type de facture, sélection de fichiers, modèle)

### 📁 Extraction/
Composants pour la section d'extraction des données
- **ExtractionMain.jsx** - Conteneur principal de l'extraction
- **ExtractionSidebar.jsx** - Barre latérale avec les champs extraits et boutons d'action
- **ExtractionPreview.jsx** - Zone de prévisualisation des documents avec navigation
- **InvoiceSelectionModal.jsx** - Modale de sélection des factures à enregistrer

### 📁 Parametrage/
Composants pour la section de paramétrage des mappings
- **ParametrageMain.jsx** - Conteneur principal du paramétrage
- **ParametrageCanvas.jsx** - Zone de dessin et sélection sur l'image
- **ParametrageControls.jsx** - Contrôles (upload, zoom, informations)
- **ParametrageFields.jsx** - Liste des champs à mapper avec boutons d'action

### 📁 NavBar/
Composants de navigation et interface
- **NavBar.jsx** - Barre de navigation principale avec les étapes
- **Notifications.jsx** - Système de notifications

## Composant Principal

**ExtractorNew.jsx** - Composant principal qui orchestre tous les autres composants et gère l'état global de l'application.

## Avantages de cette Structure

1. **Modularité** : Chaque composant a une responsabilité spécifique
2. **Maintenabilité** : Code plus facile à maintenir et déboguer
3. **Réutilisabilité** : Composants réutilisables dans d'autres parties de l'application
4. **Lisibilité** : Structure claire et organisée
5. **Performance** : Chargement optimisé des composants

## Flux de Données

```
ExtractorNew (État global)
├── PreparationSetup (Configuration)
├── ExtractionMain
│   ├── ExtractionSidebar (Données extraites)
│   └── ExtractionPreview (Aperçu documents)
└── ParametrageMain
    ├── ParametrageControls (Contrôles)
    ├── ParametrageCanvas (Zone de dessin)
    └── ParametrageFields (Champs à mapper)
```

## Migration

L'ancien fichier `Extractor.jsx` (2754 lignes) a été divisé en :
- 1 composant principal (ExtractorNew.jsx)
- 9 composants modulaires
- Chaque fichier fait maintenant moins de 300 lignes

## Utilisation

Pour utiliser la nouvelle structure, il suffit d'importer `ExtractorNew` dans `App.js` :

```javascript
import ExtractorNew from './components/ExtractorNew';

function App() {
  return (
    <div className="App">
      <ExtractorNew/>
    </div>
  );
}
```

Toutes les fonctionnalités de l'ancien composant sont préservées et fonctionnent de manière identique. 