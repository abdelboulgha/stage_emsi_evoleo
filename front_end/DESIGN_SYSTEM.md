# Système de Design Professionnel - Evoléo Extraction de Factures

## Vue d'ensemble

Ce document décrit le nouveau système de design professionnel dédié aux comptables pour l'application Evoléo Extraction de Factures. Le design a été repensé pour offrir une interface sobre, professionnelle et adaptée aux besoins des professionnels de la comptabilité.

## Philosophie du Design

### Principes
- **Professionnalisme** : Interface sobre et sérieuse adaptée aux comptables
- **Clarté** : Information bien structurée et facilement accessible
- **Efficacité** : Workflow optimisé pour les tâches comptables
- **Accessibilité** : Design inclusif et responsive

### Palette de Couleurs

#### Couleurs Principales
- **Primary** : `#1e40af` (Bleu professionnel)
- **Primary Dark** : `#1e3a8a` (Bleu foncé)
- **Primary Light** : `#3b82f6` (Bleu clair)
- **Primary Lighter** : `#dbeafe` (Bleu très clair)

#### Couleurs Secondaires
- **Secondary** : `#64748b` (Gris neutre)
- **Secondary Light** : `#94a3b8` (Gris clair)
- **Secondary Lighter** : `#f1f5f9` (Gris très clair)

#### Couleurs de Statut
- **Success** : `#059669` (Vert succès)
- **Success Light** : `#10b981` (Vert clair)
- **Success Lighter** : `#d1fae5` (Vert très clair)

- **Error** : `#dc2626` (Rouge erreur)
- **Error Light** : `#ef4444` (Rouge clair)
- **Error Lighter** : `#fee2e2` (Rouge très clair)

- **Warning** : `#d97706` (Orange avertissement)
- **Warning Light** : `#f59e0b` (Orange clair)
- **Warning Lighter** : `#fef3c7` (Orange très clair)

#### Couleurs Neutres
- **White** : `#ffffff`
- **Gray 50** : `#f8fafc`
- **Gray 100** : `#f1f5f9`
- **Gray 200** : `#e2e8f0`
- **Gray 300** : `#cbd5e1`
- **Gray 400** : `#94a3b8`
- **Gray 500** : `#64748b`
- **Gray 600** : `#475569`
- **Gray 700** : `#334155`
- **Gray 800** : `#1e293b`
- **Gray 900** : `#0f172a`

## Typographie

### Police Principale
- **Font Family** : `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Font Weight** : 400, 500, 600, 700
- **Line Height** : 1.6

### Hiérarchie Typographique
- **H1** : `2rem` (32px) - Titres principaux
- **H2** : `1.75rem` (28px) - Titres de section
- **H3** : `1.5rem` (24px) - Sous-titres
- **H4** : `1.25rem` (20px) - Titres de sous-section
- **H5** : `1.125rem` (18px) - Titres mineurs
- **H6** : `1rem` (16px) - Titres de paragraphe

### Tailles de Texte
- **Text XL** : `1.25rem` (20px)
- **Text LG** : `1.125rem` (18px)
- **Text Base** : `1rem` (16px)
- **Text SM** : `0.875rem` (14px)

## Espacement

### Système d'Espacement
- **Spacing XS** : `0.25rem` (4px)
- **Spacing SM** : `0.5rem` (8px)
- **Spacing MD** : `1rem` (16px)
- **Spacing LG** : `1.5rem` (24px)
- **Spacing XL** : `2rem` (32px)
- **Spacing 2XL** : `3rem` (48px)

## Bordures et Rayons

### Rayons de Bordure
- **Border Radius SM** : `0.375rem` (6px)
- **Border Radius MD** : `0.5rem` (8px)
- **Border Radius LG** : `0.75rem` (12px)
- **Border Radius XL** : `1rem` (16px)

## Ombres

### Système d'Ombres
- **Shadow SM** : `0 1px 2px 0 rgb(0 0 0 / 0.05)`
- **Shadow MD** : `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`
- **Shadow LG** : `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`
- **Shadow XL** : `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`

## Composants

### Boutons

#### Bouton Principal
```css
.extractor-button.primary {
    background: var(--primary-color);
    color: var(--white);
    padding: var(--spacing-md) var(--spacing-lg);
    border-radius: var(--border-radius-md);
    font-weight: 600;
    box-shadow: var(--shadow-sm);
}
```

#### Bouton Secondaire
```css
.extractor-button.secondary {
    background: var(--gray-100);
    color: var(--gray-700);
    border: 1px solid var(--gray-300);
    padding: var(--spacing-md) var(--spacing-lg);
    border-radius: var(--border-radius-md);
    font-weight: 600;
}
```

### Champs de Formulaire

#### Input Standard
```css
.form-group input {
    padding: var(--spacing-md) var(--spacing-lg);
    border: 2px solid var(--gray-200);
    border-radius: var(--border-radius-lg);
    background: var(--white);
    color: var(--gray-900);
    transition: all 0.2s ease;
}
```

#### Input Focus
```css
.form-group input:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px var(--primary-lighter);
}
```

### Cartes

#### Carte Standard
```css
.extractor-section {
    background: var(--white);
    border-radius: var(--border-radius-lg);
    padding: var(--spacing-xl);
    border: 1px solid var(--gray-200);
    box-shadow: var(--shadow-md);
}
```

## Pages et Sections

### Page d'Authentification
- Fond dégradé subtil avec motifs
- Cartes blanches avec ombres douces
- Boutons avec effets de survol
- Typographie claire et lisible

### Page Principale
- Header fixe avec navigation
- Contenu principal avec espacement généreux
- Sections bien délimitées
- Couleurs sobres et professionnelles

### Extraction
- Interface en deux colonnes
- Sidebar pour les données extraites
- Zone de prévisualisation principale
- Boutons d'action clairement identifiés

### Paramétrage
- Zone de mapping avec canvas
- Panneau de configuration des champs
- Indicateurs de progression
- Sauvegarde des mappings

### Mise à Jour
- Tableau de données avec pagination
- Actions d'édition et suppression
- Recherche intégrée
- Interface responsive

## Responsive Design

### Breakpoints
- **Desktop** : `> 1024px`
- **Tablet** : `768px - 1024px`
- **Mobile** : `< 768px`
- **Small Mobile** : `< 480px`

### Adaptations
- Navigation adaptative
- Grilles flexibles
- Tailles de police ajustées
- Espacement optimisé

## Accessibilité

### Contraste
- Ratio de contraste minimum de 4.5:1
- Couleurs de texte et de fond bien contrastées
- Indicateurs visuels clairs

### Navigation
- Navigation au clavier
- Focus visible
- Structure sémantique correcte

### Lisibilité
- Taille de police minimale de 14px
- Espacement de ligne de 1.6
- Couleurs accessibles aux daltoniens

## Utilisation

### Variables CSS
Toutes les couleurs, espacements et autres valeurs sont définis comme variables CSS dans `src/index.css` :

```css
:root {
    --primary-color: #1e40af;
    --spacing-md: 1rem;
    --border-radius-lg: 0.75rem;
    /* ... */
}
```

### Classes Utilitaires
Des classes utilitaires sont disponibles pour les alignements, couleurs et espacements :

```css
.text-center { text-align: center; }
.text-primary { color: var(--primary-color); }
.bg-white { background-color: var(--white); }
.shadow-md { box-shadow: var(--shadow-md); }
```

## Maintenance

### Ajout de Nouveaux Composants
1. Utiliser les variables CSS existantes
2. Suivre la nomenclature établie
3. Tester la responsivité
4. Vérifier l'accessibilité

### Modifications
1. Modifier les variables CSS pour les changements globaux
2. Utiliser les classes existantes quand possible
3. Documenter les nouveaux composants
4. Tester sur différents appareils

## Conclusion

Ce système de design offre une base solide pour créer une interface professionnelle et cohérente pour les comptables. Il favorise la productivité tout en maintenant une apparence soignée et moderne. 