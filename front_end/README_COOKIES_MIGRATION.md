# Migration vers les Cookies HttpOnly - Frontend

## Vue d'ensemble

Ce document décrit les modifications apportées au frontend pour migrer de l'authentification par token localStorage vers les cookies HttpOnly.

## Changements principaux

### 🔧 **Modifications des requêtes API**

Toutes les requêtes fetch ont été mises à jour pour inclure `credentials: 'include'` :

#### Avant (avec Authorization header)
```javascript
const response = await fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data)
});
```

#### Après (avec cookies HttpOnly)
```javascript
const response = await fetch('/api/endpoint', {
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // Inclut automatiquement les cookies
  body: JSON.stringify(data)
});
```

### 📁 **Fichiers modifiés**

1. **`src/contexts/AuthContext.js`**
   - Suppression de la gestion manuelle des tokens
   - Ajout de `credentials: 'include'` à toutes les requêtes
   - Suppression de `localStorage.setItem/getItem/removeItem`
   - Modification de la fonction `logout` pour appeler l'endpoint de déconnexion

2. **`src/MiseAJour/MiseAJourPage.jsx`**
   - Ajout de `credentials: 'include'` à toutes les requêtes fetch
   - Amélioration de la gestion des erreurs

3. **`src/hooks/useExtraction.js`**
   - Ajout de `credentials: 'include'` aux requêtes de sauvegarde et lancement FoxPro
   - Simplification des fonctions

4. **`src/components/auth/UserManagement.jsx`**
   - Remplacement des headers Authorization par `credentials: 'include'`
   - Suppression de la dépendance au token

5. **`src/hooks/useSetup.js`**
   - Suppression de la dépendance au token
   - Ajout de `credentials: 'include'` aux requêtes d'upload

6. **`src/hooks/useDataPreparation.js`**
   - Simplification et ajout de `credentials: 'include'`
   - Suppression de la gestion manuelle des tokens

### 🆕 **Nouveaux fichiers**

1. **`src/config/api.js`**
   - Configuration centralisée de l'API
   - Fonctions utilitaires pour les requêtes
   - Gestion automatique des cookies

## Avantages de la migration

### ✅ **Sécurité renforcée**
- Protection contre les attaques XSS
- Tokens non accessibles via JavaScript
- Authentification automatique

### ✅ **Simplicité**
- Plus de gestion manuelle des tokens
- Moins de code à maintenir
- Configuration centralisée

### ✅ **Fiabilité**
- Authentification automatique
- Pas de problèmes de synchronisation des tokens
- Gestion d'erreur améliorée

## Configuration

### Variables d'environnement

```bash
# URL de l'API (optionnel, par défaut: http://localhost:8000)
REACT_APP_API_URL=http://localhost:8000
```

### Utilisation des fonctions utilitaires

```javascript
import { apiGet, apiPost, apiPut, apiDelete } from '../config/api';

// GET request
const data = await apiGet('/auth/me');

// POST request
const result = await apiPost('/auth/login', { email, password });

// PUT request
const updated = await apiPut('/factures/123', { field: 'value' });

// DELETE request
await apiDelete('/factures/123');

// FormData request
const formData = new FormData();
formData.append('file', file);
const upload = await apiPostFormData('/upload', formData);
```

## Dépannage

### Problèmes courants

1. **Erreur 401 Unauthorized**
   - Vérifier que l'utilisateur est connecté
   - Vérifier que `credentials: 'include'` est présent
   - Vérifier la configuration CORS côté backend

2. **Cookies non envoyés**
   - Vérifier que le domaine correspond
   - Vérifier que `credentials: 'include'` est utilisé
   - Vérifier la configuration SameSite

3. **Erreurs CORS**
   - Vérifier la configuration CORS côté backend
   - Vérifier que `allow_credentials: true` est configuré

## Tests

### Vérification de l'authentification
```javascript
// Test de connexion automatique
const response = await fetch('/auth/me', {
  credentials: 'include'
});
console.log('Authentifié:', response.ok);
```

### Vérification des cookies
```javascript
// Les cookies ne doivent pas être accessibles via JavaScript
console.log(document.cookie); // Ne devrait pas contenir auth_token
```

## Migration complète

La migration est maintenant terminée avec :
- ✅ Toutes les requêtes utilisent les cookies HttpOnly
- ✅ Plus de gestion manuelle des tokens
- ✅ Authentification automatique
- ✅ Configuration centralisée
- ✅ Protection contre les attaques XSS

Votre application est maintenant sécurisée avec les cookies HttpOnly ! 🚀 