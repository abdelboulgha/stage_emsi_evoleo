import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, CreditCard, CheckCircle, AlertCircle } from 'lucide-react';
import './SubscriptionModal.css';

// Initialize Stripe (you'll need to add your publishable key to .env)
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_your_key_here');

// Debug: Log the Stripe key being used
console.log('Stripe key:', process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);
console.log('Stripe promise:', stripePromise);

const SubscriptionModal = ({ isOpen, onClose, onSubscriptionSuccess }) => {
  const [selectedPlan, setSelectedPlan] = useState('trial');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const plans = [
    {
      id: 'trial',
      name: 'Essai gratuit',
      price: '0 DH',
      duration: '1 semaine',
      description: '1 semaine d\'essai gratuit',
      popular: false
    },
    {
      id: 'monthly',
      name: 'Abonnement mensuel',
      price: '100 DH',
      duration: '1 mois',
      description: '1 mois d\'accès complet',
      popular: false
    },
    {
      id: 'semester',
      name: 'Abonnement semestriel',
      price: '500 DH',
      duration: '6 mois',
      description: '6 mois d\'accès complet',
      popular: true
    },
    {
      id: 'yearly',
      name: 'Abonnement annuel',
      price: '800 DH',
      duration: '1 an',
      description: '1 an d\'accès complet',
      popular: false
    }
  ];

  const handlePlanSelect = (planId) => {
    setSelectedPlan(planId);
    setError('');
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="subscription-overlay">
      <div className="subscription-modal">
        <div className="modal-header">
          <h2>Choisissez votre plan d'abonnement</h2>
          <button className="close-button" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        <div className="plans-container">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''} ${plan.popular ? 'popular' : ''}`}
              onClick={() => handlePlanSelect(plan.id)}
            >
              {plan.popular && <div className="popular-badge">Populaire</div>}
              <h3>{plan.name}</h3>
              <div className="plan-price">
                <span className="price">{plan.price}</span>
                <span className="duration">/{plan.duration}</span>
              </div>
              <p className="plan-description">{plan.description}</p>
              {selectedPlan === plan.id && (
                <div className="selected-indicator">
                  <CheckCircle size={20} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="payment-section">
          <h3>Informations de paiement</h3>
          <p className="payment-note">
            Même pour l'essai gratuit, nous devons vérifier vos informations de paiement
          </p>
          
          <Elements stripe={stripePromise}>
            <PaymentForm 
              selectedPlan={selectedPlan}
              onSuccess={onSubscriptionSuccess}
              onClose={onClose}
            />
          </Elements>
        </div>

        {error && (
          <div className="error-message">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

// Separate component for Stripe payment form
const PaymentForm = ({ selectedPlan, onSuccess, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      console.log('Stripe ou Elements non disponibles');
      return;
    }

    console.log('Début de la soumission...');
    setIsLoading(true);
    setError('');

    try {
      // Create payment method
      console.log('Création de la méthode de paiement...');
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
      });

      if (paymentMethodError) {
        console.error('Erreur Stripe:', paymentMethodError);
        setError(paymentMethodError.message);
        setIsLoading(false);
        return;
      }

      console.log('Méthode de paiement créée:', paymentMethod.id);

      console.log('Envoi de la requête vers le backend...');
      // Call backend to create subscription - Les cookies seront envoyés automatiquement
      const response = await fetch('http://localhost:8000/subscription/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pas besoin d'Authorization header - le cookie sera envoyé automatiquement
        },
        credentials: 'include', // Important : inclut les cookies
        body: JSON.stringify({
          plan_type: selectedPlan,
          payment_method_id: paymentMethod.id
        })
      });

      console.log('Réponse du backend:', response.status, response.statusText);

      if (!response.ok) {
        if (response.status === 401) {
          console.error('Erreur 401: Non autorisé');
          setError('Vous devez être connecté pour créer un abonnement');
          return;
        }
        const errorData = await response.json();
        console.error('Erreur backend:', errorData);
        throw new Error(errorData.detail || 'Erreur lors de la création de l\'abonnement');
      }

      const result = await response.json();
      console.log('Succès:', result);

      if (result.success) {
        onSuccess(result.data);
        onClose();
      } else {
        setError(result.message || 'Erreur lors de la création de l\'abonnement');
      }
    } catch (error) {
      console.error('Erreur complète:', error);
      setError(error.message || 'Erreur de connexion. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardChange = (event) => {
    // Reset error when user starts typing
    if (event.error) {
      setError(event.error.message);
    } else {
      setError('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="card-element-container">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
              },
            },
          }}
          onChange={handleCardChange}
        />
      </div>

      <button
        type="submit"
        disabled={!stripe || isLoading}
        className="subscribe-button"
      >
        {isLoading ? (
          <div className="loading-spinner"></div>
        ) : (
          <>
            <CreditCard size={16} />
            {selectedPlan === 'trial' ? 'Commencer l\'essai gratuit' : 'S\'abonner maintenant'}
          </>
        )}
      </button>
    </form>
  );
};

export default SubscriptionModal;
