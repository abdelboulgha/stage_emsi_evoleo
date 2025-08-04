# Système d'Authentification - Evoléo

## Vue d'ensemble

Ce système d'authentification a été ajouté au projet Evoléo pour sécuriser l'accès à l'application d'extraction de factures. Il utilise JWT (JSON Web Tokens) pour l'authentification et gère deux rôles : **Comptable** et **Administrateur**.

## Fonctionnalités

### 🔐 Authentification
- **Inscription** : Création de nouveaux comptes (rôle comptable par défaut)
- **Connexion** : Authentification avec email et mot de passe
- **Déconnexion** : Suppression du token et redirection
- **Persistance** : Le token est stocké dans le localStorage

### 👥 Gestion des Rôles
- **Comptable** : Accès aux fonctionnalités d'extraction de factures
- **Administrateur** : Accès complet + gestion des utilisateurs

### 🛡️ Sécurité
- Mots de passe hashés avec bcrypt
- Tokens JWT avec expiration (30 minutes)
- Validation des données côté client et serveur
- Protection des routes sensibles

## Structure des Fichiers

### Backend (Python/FastAPI)

```
├── auth_config.py          # Configuration JWT et base de données
├── auth_models.py          # Modèles Pydantic pour l'authentification
├── auth_database.py        # Gestion de la base de données utilisateurs
├── auth_jwt.py            # Gestion des tokens JWT
├── auth_routes.py         # Routes d'authentification
└── main.py                # Intégration des routes d'auth
```

### Frontend (React)

```
front_end/src/
├── contexts/
│   └── AuthContext.js     # Contexte d'authentification
├── components/
│   ├── auth/
│   │   ├── AuthPage.jsx           # Page principale d'auth
│   │   ├── LoginForm.jsx          # Formulaire de connexion
│   │   ├── RegisterForm.jsx       # Formulaire d'inscription
│   │   ├── UserManagement.jsx     # Gestion des utilisateurs (Admin)
│   │   ├── AuthForms.css          # Styles des formulaires
│   │   ├── AuthPage.css           # Styles de la page d'auth
│   │   └── UserManagement.css     # Styles de gestion utilisateurs
│   └── AppContent.jsx     # Contenu principal de l'app
└── AppContent.css         # Styles du contenu principal
```

## Installation et Configuration

### 1. Installation des dépendances

```bash
# Backend
pip install -r requirements.txt

# Frontend
cd front_end
npm install
```

### 2. Configuration de la base de données

Créez un fichier `.env` à la racine du projet :

```env
# Configuration de la base de données
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=votre_mot_de_passe
DB_NAME=evoleo

# Configuration JWT
JWT_SECRET_KEY=votre-cle-secrete-jwt-changez-cela-en-production
```

### 3. Initialisation de la base de données

La base de données sera automatiquement initialisée au démarrage du serveur avec :
- Table `utilisateurs` créée automatiquement
- Utilisateur admin par défaut créé :
  - Email: `admin@evoleo.com`
  - Mot de passe: `admin123`
  - Rôle: `admin`

## Utilisation

### Compte par défaut
- **Email** : admin@evoleo.com
- **Mot de passe** : admin123
- **Rôle** : Administrateur

### Création de nouveaux comptes
1. Accédez à la page d'inscription
2. Remplissez le formulaire
3. Le compte sera créé avec le rôle "comptable" par défaut
4. Un administrateur peut modifier le rôle si nécessaire

### Gestion des utilisateurs (Admin uniquement)
1. Connectez-vous avec un compte administrateur
2. Cliquez sur "Gestion Utilisateurs" dans la navigation
3. Vous pouvez :
   - Voir tous les utilisateurs
   - Modifier les informations (nom, prénom, rôle, statut)
   - Désactiver des comptes

## API Endpoints

### Authentification
- `POST /auth/register` - Inscription d'un nouvel utilisateur
- `POST /auth/login` - Connexion
- `GET /auth/me` - Informations de l'utilisateur connecté
- `POST /auth/change-password` - Changement de mot de passe

### Gestion des utilisateurs (Admin)
- `GET /auth/users` - Liste de tous les utilisateurs
- `PUT /auth/users/{user_id}` - Modifier un utilisateur
- `DELETE /auth/users/{user_id}` - Désactiver un utilisateur

## Sécurité

### Protection des routes
Les routes sensibles sont protégées par des dépendances :
- `require_comptable_or_admin` : Accès comptable ou admin
- `require_admin` : Accès administrateur uniquement

### Stockage sécurisé
- Tokens JWT stockés dans localStorage
- Mots de passe hashés avec bcrypt
- Validation côté client et serveur

## Personnalisation

### Modification des rôles
Dans `auth_config.py`, vous pouvez modifier :
```python
ROLES = {
    "ADMIN": "admin",
    "COMPTABLE": "comptable"
}
DEFAULT_ROLE = ROLES["COMPTABLE"]
```

### Durée de vie des tokens
Dans `auth_config.py` :
```python
ACCESS_TOKEN_EXPIRE_MINUTES = 30
```

### Styles
Les styles sont modulaires et peuvent être personnalisés dans les fichiers CSS correspondants.

## Dépannage

### Problèmes courants

1. **Erreur de connexion à la base de données**
   - Vérifiez les paramètres dans `.env`
   - Assurez-vous que MySQL est démarré

2. **Token expiré**
   - L'utilisateur sera automatiquement déconnecté
   - Reconnectez-vous pour obtenir un nouveau token

3. **Accès refusé**
   - Vérifiez que l'utilisateur a le bon rôle
   - Contactez un administrateur si nécessaire

### Logs
Les erreurs sont loggées dans `invoice_debug.log` pour le backend.

## Support

Pour toute question ou problème, consultez les logs ou contactez l'équipe de développement. 