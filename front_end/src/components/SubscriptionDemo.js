import React, { useState } from 'react';
import SubscriptionModal from './SubscriptionModal';
import useSubscription from '../hooks/useSubscription';
import { CreditCard, CheckCircle, XCircle } from 'lucide-react';
import './SubscriptionDemo.css';

const SubscriptionDemo = () => {
  const [showModal, setShowModal] = useState(false);
  const { subscriptionStatus, canAccessServices, isLoading } = useSubscription();

  const handleSubscriptionSuccess = (data) => {
    console.log('Subscription created:', data);
    setShowModal(false);
    // Refresh the subscription status
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="demo-loading">
        <div className="loading-spinner"></div>
        <p>Chargement du statut d'abonnement...</p>
      </div>
    );
  }

  return (
    <div className="subscription-demo">
      <div className="demo-header">
        <h2>Démonstration du Système d'Abonnement</h2>
        <p>Testez le système de paiement et d'abonnement</p>
      </div>

      <div className="demo-status">
        <h3>Statut de votre abonnement</h3>
        {canAccessServices ? (
          <div className="status-success">
            <CheckCircle size={24} />
            <span>Accès autorisé aux services</span>
          </div>
        ) : (
          <div className="status-error">
            <XCircle size={24} />
            <span>Aucun abonnement actif</span>
          </div>
        )}
      </div>

      {subscriptionStatus && (
        <div className="subscription-details">
          <h3>Détails de l'abonnement</h3>
          <div className="details-grid">
            <div className="detail-item">
              <strong>Type de plan :</strong>
              <span>{subscriptionStatus.plan_type || 'Aucun'}</span>
            </div>
            <div className="detail-item">
              <strong>Montant :</strong>
              <span>{subscriptionStatus.amount || 0} DH</span>
            </div>
            <div className="detail-item">
              <strong>Date de début :</strong>
              <span>{subscriptionStatus.start_date || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <strong>Date de fin :</strong>
              <span>{subscriptionStatus.end_date || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <strong>Jours restants :</strong>
              <span>{subscriptionStatus.days_remaining || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="demo-actions">
        <button 
          className="demo-button primary"
          onClick={() => setShowModal(true)}
        >
          <CreditCard size={20} />
          {canAccessServices ? 'Gérer l\'abonnement' : 'S\'abonner maintenant'}
        </button>
        
        <button 
          className="demo-button secondary"
          onClick={() => window.location.reload()}
        >
          Actualiser le statut
        </button>
      </div>

      <div className="demo-info">
        <h3>Comment tester</h3>
        <ul>
          <li>Cliquez sur "S'abonner maintenant" pour ouvrir le modal</li>
          <li>Choisissez un plan (essai gratuit recommandé pour les tests)</li>
          <li>Utilisez une carte de test Stripe : <code>4242 4242 4242 4242</code></li>
          <li>Date d'expiration : n'importe quelle date future</li>
          <li>CVC : n'importe quels 3 chiffres</li>
        </ul>
      </div>

      <SubscriptionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubscriptionSuccess={handleSubscriptionSuccess}
      />
    </div>
  );
};

export default SubscriptionDemo;
