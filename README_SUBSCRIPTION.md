# Système d'Abonnement et Paiement

Ce document explique comment configurer et utiliser le système d'abonnement et de paiement intégré à l'application Evoléo.

## 🎯 Fonctionnalités

### Plans d'abonnement disponibles :
- **Essai gratuit** : 1 semaine (0 DH) - Nécessite une carte bancaire
- **Abonnement mensuel** : 1 mois (100 DH)
- **Abonnement semestriel** : 6 mois (500 DH) - Plan populaire
- **Abonnement annuel** : 1 an (800 DH)

### Comportement du système :
1. **Première connexion** : L'utilisateur voit un popup d'abonnement
2. **Accès aux services** : Impossible sans abonnement actif
3. **Vérification continue** : Le système vérifie l'abonnement à chaque action
4. **Paiement sécurisé** : Intégration Stripe pour les transactions

## 🚀 Installation et Configuration

### 1. Backend (Python/FastAPI)

#### Dépendances requises :
```bash
pip install stripe python-dotenv
```

#### Variables d'environnement :
Créez un fichier `.env` dans le dossier `backend/` :
```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Database Configuration
DATABASE_URL=sqlite:///./app.db

# JWT Configuration
JWT_SECRET_KEY=your_jwt_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000"]
CORS_ALLOW_CREDENTIALS=true
```

#### Migration de la base de données :
```bash
cd backend
alembic upgrade head
```

### 2. Frontend (React)

#### Dépendances requises :
```bash
cd front_end
npm install @stripe/stripe-js @stripe/react-stripe-js
```

#### Variables d'environnement :
Créez un fichier `.env` dans le dossier `front_end/` :
```env
# Stripe Configuration
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here

# API Configuration
REACT_APP_API_BASE_URL=http://localhost:8000
```

## 🔑 Configuration Stripe

### 1. Créer un compte Stripe
- Allez sur [stripe.com](https://stripe.com)
- Créez un compte et accédez au dashboard

### 2. Obtenir les clés API
- **Clé publique** : Utilisée côté frontend (commence par `pk_test_`)
- **Clé secrète** : Utilisée côté backend (commence par `sk_test_`)

### 3. Configuration des webhooks (optionnel)
- Créez un webhook dans le dashboard Stripe
- URL : `https://votre-domaine.com/api/stripe/webhook`
- Événements : `payment_intent.succeeded`, `payment_intent.payment_failed`

## 📱 Utilisation

### 1. Connexion utilisateur
- L'utilisateur se connecte avec ses identifiants
- Le système vérifie automatiquement son statut d'abonnement

### 2. Premier accès
- Si pas d'abonnement : popup d'abonnement automatique
- L'utilisateur choisit un plan et saisit ses informations de carte
- Même pour l'essai gratuit, une carte est requise

### 3. Accès aux services
- **Avec abonnement actif** : Accès complet à toutes les fonctionnalités
- **Sans abonnement** : Redirection vers la page d'abonnement

### 4. Gestion des abonnements
- Vérification automatique de la validité
- Notification d'expiration
- Renouvellement automatique (selon le plan)

## 🏗️ Architecture Technique

### Backend
- **Models** : `Subscription`, `Payment`, `UserCard`
- **Service** : `SubscriptionService` pour la logique métier
- **Routes** : API REST pour la gestion des abonnements
- **Intégration** : Stripe pour les paiements

### Frontend
- **Composants** : `SubscriptionModal`, `SubscriptionGuard`
- **Hooks** : `useSubscription` pour la gestion d'état
- **Protection** : Vérification automatique avant l'accès aux services

### Base de données
- **Table subscriptions** : Informations des abonnements
- **Table payments** : Historique des paiements
- **Table user_cards** : Cartes sauvegardées des utilisateurs

## 🔒 Sécurité

### Mesures implémentées :
- Vérification JWT pour toutes les requêtes
- Validation des données côté serveur
- Intégration sécurisée avec Stripe
- Pas de stockage des informations de carte sensibles

### Bonnes pratiques :
- Utilisation des clés de test pour le développement
- Validation des webhooks Stripe
- Gestion des erreurs de paiement
- Logs de sécurité pour les transactions

## 🧪 Tests

### Test des paiements :
```bash
# Utilisez les cartes de test Stripe
# Succès : 4242 4242 4242 4242
# Échec : 4000 0000 0000 0002
# Expirée : 4000 0000 0000 0069
```

### Test des plans :
- **Essai gratuit** : Création sans débit
- **Plans payants** : Débit immédiat de la carte

## 🚨 Dépannage

### Problèmes courants :

#### 1. Erreur de clé Stripe
```
Error: Invalid API key provided
```
**Solution** : Vérifiez vos clés Stripe dans les fichiers `.env`

#### 2. Erreur de base de données
```
Table 'subscriptions' doesn't exist
```
**Solution** : Exécutez la migration Alembic

#### 3. Erreur CORS
```
Access to fetch at '...' from origin '...' has been blocked
```
**Solution** : Vérifiez la configuration CORS dans le backend

#### 4. Modal d'abonnement ne s'affiche pas
**Solution** : Vérifiez que le composant `SubscriptionGuard` est bien intégré

## 📈 Évolutions futures

### Fonctionnalités prévues :
- Gestion des factures Stripe
- Système de coupons et réductions
- Plans d'équipe et multi-utilisateurs
- Intégration avec d'autres processeurs de paiement
- Dashboard de gestion des abonnements

### Optimisations :
- Mise en cache des statuts d'abonnement
- Notifications push pour les renouvellements
- Analytics des conversions
- A/B testing des plans

## 📞 Support

Pour toute question ou problème :
1. Vérifiez la configuration des variables d'environnement
2. Consultez les logs de l'application
3. Testez avec les cartes de test Stripe
4. Vérifiez la connectivité avec l'API Stripe

---

**Note** : Ce système est conçu pour fonctionner en production avec des clés Stripe réelles. Assurez-vous de bien configurer la sécurité et de tester exhaustivement avant le déploiement.
