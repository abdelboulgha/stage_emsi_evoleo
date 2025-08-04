import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import './AuthPage.css';

const AuthPage = () => {  // view decided by URL
      const location = useLocation();
  const navigate = useNavigate();

  // determine which sub-route we are on
  const isLogin = location.pathname !== '/register';

  const switchToRegister = () => navigate('/register');
  const switchToLogin = () => navigate('/login');

  return (
    <div className="auth-page">
      <div className="auth-background">
        <div className="auth-content">
          <div className="auth-header">
            <h1>Evoléo - Extraction de Factures</h1>
            <p>Système d'extraction automatique de données de factures</p>
          </div>
          
          {isLogin ? (
            <LoginForm onSwitchToRegister={switchToRegister} />
          ) : (
            <RegisterForm onSwitchToLogin={switchToLogin} />
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage; 