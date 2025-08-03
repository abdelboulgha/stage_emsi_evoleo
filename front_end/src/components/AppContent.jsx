import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AuthPage from './auth/AuthPage';
import ExtractorNew from './ExtractorNew';
import UserManagement from './auth/UserManagement';
import MiseAJourPage from '../MiseAJour/MiseAJourPage';
import StepNavigation from './StepNavigation';
import './AppContent.css';

const AppContent = () => {
  const { user, loading, logout, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState('extractor');
  const [currentStep, setCurrentStep] = useState('setup');

  // Réinitialiser currentStep à 'setup' à chaque nouvelle connexion
  useEffect(() => {
    if (user) {
      setCurrentStep('setup');
    }
  }, [user]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleLogout = () => {
    logout();
  };

  const renderView = () => {
    switch (currentView) {
      case 'extractor':
        return <ExtractorNew currentStep={currentStep} setCurrentStep={setCurrentStep} />;
      case 'users':
        return <UserManagement />;
      case 'miseajour':
        return <MiseAJourPage />;
      default:
        return <ExtractorNew currentStep={currentStep} setCurrentStep={setCurrentStep} />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Evoléo - Extraction de Factures</h1>
          </div>
          
          <div className="header-center">
            <div className="main-nav-buttons">
              <button 
                className={`main-nav-button ${currentView === 'extractor' && currentStep === 'setup' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentView('extractor');
                  setCurrentStep('setup');
                }}
              >
                Préparation
              </button>
              <button 
                className={`main-nav-button ${currentView === 'extractor' && currentStep === 'extract' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentView('extractor');
                  setCurrentStep('extract');
                }}
              >
                Extraction
              </button>
              <button 
                className={`main-nav-button ${currentView === 'extractor' && currentStep === 'dataprep' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentView('extractor');
                  setCurrentStep('dataprep');
                }}
              >
                Paramétrage
              </button>
              <button 
                className={`main-nav-button ${currentView === 'miseajour' ? 'active' : ''}`}
                onClick={() => setCurrentView('miseajour')}
              >
                Mise à jour
              </button>
            </div>
          </div>
          
          <div className="header-right">
            {isAdmin() && (
              <div className="admin-nav-buttons">
                <button 
                  className={`nav-button ${currentView === 'users' ? 'active' : ''}`}
                  onClick={() => setCurrentView('users')}
                >
                  Gestion Utilisateurs
                </button>
              </div>
            )}
            <div className="user-info">
              <span className="user-name">{user.prenom} {user.nom}</span>
              <span className={`user-role ${user.role}`}>
                {user.role === 'admin' ? 'Administrateur' : 'Comptable'}
              </span>
            </div>
            <button className="logout-button" onClick={handleLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {renderView()}
      </main>
    </div>
  );
};

export default AppContent; 