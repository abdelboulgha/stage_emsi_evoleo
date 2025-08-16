import React, { useState, useEffect } from 'react';
import SubscriptionModal from './SubscriptionModal';
import useSubscription from '../hooks/useSubscription';
import { AlertCircle, Lock } from 'lucide-react';
import './SubscriptionGuard.css';

const SubscriptionGuard = ({ children, showModalOnMount = false }) => {
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const { subscriptionStatus, isLoading, canAccessServices, verifyServiceAccess } = useSubscription();

  useEffect(() => {
    // Show modal on mount if requested and user doesn't have subscription
    if (showModalOnMount && !isLoading && !canAccessServices) {
      setShowSubscriptionModal(true);
    }
  }, [showModalOnMount, isLoading, canAccessServices]);

  const handleServiceAccess = async () => {
    const accessResult = await verifyServiceAccess();
    
    if (!accessResult.can_access) {
      setShowSubscriptionModal(true);
      return false;
    }
    
    return true;
  };

  const handleSubscriptionSuccess = () => {
    setShowSubscriptionModal(false);
    // Optionally refresh the page or update the subscription status
    window.location.reload();
  };

  const handleCloseModal = () => {
    setShowSubscriptionModal(false);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="subscription-loading">
        <div className="loading-spinner"></div>
        <p>Vérification de votre abonnement...</p>
      </div>
    );
  }

  // If user has access, render children normally
  if (canAccessServices) {
    return children;
  }

  // If user doesn't have access, show subscription required message
  return (
    <>
      <div className="subscription-required">
        <div className="subscription-required-content">
          <Lock size={48} className="lock-icon" />
          <h2>Abonnement requis</h2>
          <p>
            Pour accéder à ce service, vous devez avoir un abonnement actif.
            Choisissez un plan qui vous convient.
          </p>
          <button 
            className="subscribe-now-button"
            onClick={() => setShowSubscriptionModal(true)}
          >
            S'abonner maintenant
          </button>
        </div>
      </div>

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={handleCloseModal}
        onSubscriptionSuccess={handleSubscriptionSuccess}
      />
    </>
  );
};

// Higher-order component for protecting specific features
export const withSubscriptionGuard = (Component, options = {}) => {
  return function ProtectedComponent(props) {
    return (
      <SubscriptionGuard showModalOnMount={options.showModalOnMount}>
        <Component {...props} />
      </SubscriptionGuard>
    );
  };
};

// Hook for checking service access in components
export const useServiceAccess = () => {
  const { verifyServiceAccess } = useSubscription();
  
  return {
    checkAccess: verifyServiceAccess
  };
};

export default SubscriptionGuard;
