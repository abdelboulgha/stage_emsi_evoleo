import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, CreditCard, CheckCircle, AlertCircle } from 'lucide-react';
import './SubscriptionModal.css';

// Icônes pour les différents types de cartes
const CardTypeIcon = ({ brand }) => {
  if (!brand) return <CreditCard size={20} className="card-icon-default" />;
  
  const brandLower = brand.toLowerCase();
  
  if (brandLower === 'visa') {
    return (
      <div className="card-icon visa">
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M22.4 4.6c-.4-.3-.9-.4-1.4-.4H3c-.5 0-1 .1-1.4.4C1.2 5.1 1 5.6 1 6.2v11.6c0 .6.2 1.1.6 1.6.4.3.9.4 1.4.4h18c.5 0 1-.1 1.4-.4.4-.5.6-1 .6-1.6V6.2c0-.6-.2-1.1-.6-1.6zM9.5 15.5l-2.5-6.3h2.1l1.4 3.7 1.4-3.7h2.1L12.5 15.5h-3z"/>
        </svg>
      </div>
    );
  }
  
  if (brandLower === 'mastercard') {
    return (
      <div className="card-icon mastercard">
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <circle cx="9" cy="12" r="7" fill="#ff5f00"/>
          <circle cx="15" cy="12" r="7" fill="#eb001b"/>
          <path d="M12 5c-2.8 0-5.2 1.5-6.5 3.8C7.2 11.1 9.4 12 12 12s4.8-.9 6.5-3.2C17.2 5.5 14.8 4 12 4z" fill="#f79e1b"/>
        </svg>
      </div>
    );
  }
  
  if (brandLower === 'amex') {
    return (
      <div className="card-icon amex">
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M22.4 4.6c-.4-.3-.9-.4-1.4-.4H3c-.5 0-1 .1-1.4.4C1.2 5.1 1 5.6 1 6.2v11.6c0 .6.2 1.1.6 1.6.4.3.9.4 1.4.4h18c.5 0 1-.1 1.4-.4.4-.5.6-1 .6-1.6V6.2c0-.6-.2-1.1-.6-1.6zM7.5 15.5l-1.5-3.5-1.5 3.5H3l2.5-6.3h2l2.5 6.3h-2zM15.5 15.5l-1.5-3.5-1.5 3.5h-2l2.5-6.3h2l2.5 6.3h-2z"/>
        </svg>
      </div>
    );
  }
  
  if (brandLower === 'discover') {
    return (
      <div className="card-icon discover">
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
    );
  }
  
  // Icône par défaut pour les autres types de cartes
  return <CreditCard size={20} className="card-icon-default" />;
};

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
  const [cardholderName, setCardholderName] = useState('');
  const [cardBrand, setCardBrand] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    console.log('🔄 Début de handleSubmit');
    console.log('Stripe disponible:', !!stripe);
    console.log('Elements disponible:', !!elements);
    
    if (!stripe || !elements) {
      console.log('❌ Stripe ou Elements non disponibles');
      setError('Erreur: Stripe n\'est pas initialisé');
      return;
    }

    if (!cardholderName.trim()) {
      setError('Veuillez saisir le nom figurant sur la carte');
      return;
    }

    // Vérifier que tous les éléments Stripe sont disponibles
    if (!elements.getElement(CardNumberElement) || 
        !elements.getElement(CardExpiryElement) || 
        !elements.getElement(CardCvcElement)) {
      setError('Veuillez remplir tous les champs de carte');
      return;
    }

    console.log('Début de la soumission...');
    setIsLoading(true);
    setError('');

    try {
      // Create payment method with separate card elements
      console.log('Création de la méthode de paiement...');
      
      // Get the card elements
      const cardNumberElement = elements.getElement(CardNumberElement);
      const cardExpiryElement = elements.getElement(CardExpiryElement);
      const cardCvcElement = elements.getElement(CardCvcElement);
      
      if (!cardNumberElement || !cardExpiryElement || !cardCvcElement) {
        setError('Erreur: Impossible de récupérer les éléments de carte');
        setIsLoading(false);
        return;
      }
      
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardNumberElement,
        billing_details: {
          name: cardholderName,
        },
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
    
    // Détecter le type de carte
    if (event.brand) {
      setCardBrand(event.brand);
      console.log('💳 Type de carte détecté:', event.brand);
    }
  };

  const commonCardElementStyle = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
        padding: '12px',
        backgroundColor: 'transparent',
      },
      invalid: {
        color: '#9e2146',
      },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="payment-fields-container">
        {/* Nom sur la carte */}
        <div className="payment-field-group">
          <label htmlFor="cardholder-name" className="payment-field-label">
            Nom figurant sur la carte
          </label>
          <div className="payment-input-container">
            <input
              id="cardholder-name"
              type="text"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
              placeholder="Nom complet"
              className="payment-input"
              required
            />
          </div>
        </div>

        {/* Numéro de carte */}
        <div className="payment-field-group">
          <label className="payment-field-label">
            Numéro de carte
          </label>
          <div className="payment-input-container card-number-container">
            <CardNumberElement
              options={commonCardElementStyle}
              onChange={handleCardChange}
              className="stripe-element"
            />
            <div className="card-brand-icon">
              <CardTypeIcon brand={cardBrand} />
            </div>
          </div>
        </div>

        {/* Date d'expiration et CVC */}
        <div className="payment-row">
          <div className="payment-field-group payment-field-half">
            <label className="payment-field-label">
              Date d'expiration
            </label>
            <div className="payment-input-container">
              <CardExpiryElement
                options={commonCardElementStyle}
                onChange={handleCardChange}
                className="stripe-element"
              />
            </div>
          </div>

          <div className="payment-field-group payment-field-half">
            <label className="payment-field-label">
              Cryptogramme (CVC)
            </label>
            <div className="payment-input-container">
              <CardCvcElement
                options={commonCardElementStyle}
                onChange={handleCardChange}
                className="stripe-element"
              />
            </div>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || isLoading}
        className="subscribe-button"
        onClick={() => console.log('🖱️ Bouton cliqué, stripe:', !!stripe, 'loading:', isLoading)}
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
