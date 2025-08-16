import { useState, useEffect, useCallback } from 'react';

const useSubscription = () => {
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkSubscriptionStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:8000/subscription/status', {
        credentials: 'include', // Important : inclut les cookies
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data.status);
      } else {
        throw new Error('Failed to fetch subscription status');
      }
    } catch (err) {
      setError(err.message);
      setSubscriptionStatus({ hasSubscription: false, can_access_services: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyServiceAccess = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/subscription/verify-access', {
        credentials: 'include', // Important : inclut les cookies
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        return { can_access: false, redirect_to_subscription: true };
      }
    } catch (err) {
      return { can_access: false, redirect_to_subscription: true };
    }
  }, []);

  const refreshSubscriptionStatus = useCallback(() => {
    checkSubscriptionStatus();
  }, [checkSubscriptionStatus]);

  useEffect(() => {
    checkSubscriptionStatus();
  }, [checkSubscriptionStatus]);

  return {
    subscriptionStatus,
    isLoading,
    error,
    checkSubscriptionStatus,
    verifyServiceAccess,
    refreshSubscriptionStatus,
    hasActiveSubscription: subscriptionStatus?.hasSubscription || false,
    canAccessServices: subscriptionStatus?.can_access_services || false
  };
};

export default useSubscription;
