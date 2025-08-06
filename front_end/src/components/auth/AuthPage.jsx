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
      <div className="auth-container">
        <div className="auth-logo">
          <h1>Evoléo</h1>
          <p>Extraction de Factures Professionnelle</p>
          <div className="auth-features">
            <div className="auth-feature">
              <div className="auth-feature-icon">✓</div>
              <div className="auth-feature-text">Extraction automatique des données</div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">✓</div>
              <div className="auth-feature-text">Interface professionnelle comptable</div>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">✓</div>
              <div className="auth-feature-text">Sécurité et fiabilité garanties</div>
            </div>
          </div>
        </div>
        
        <div className="auth-form-section">
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