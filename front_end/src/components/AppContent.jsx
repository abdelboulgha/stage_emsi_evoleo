import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthPage from './auth/AuthPage';
import ExtractorNew from './ExtractorNew';
import UserManagement from './auth/UserManagement';
import MiseAJourPage from '../MiseAJour/MiseAJourPage';
import StepNavigation from './StepNavigation';
import './AppContent.css';

const AppContent = ({ initialView = 'extractor', initialStep = 'setup' }) => {
  const navigate = useNavigate();
  const { user, loading, logout, isAdmin } = useAuth();
    const [currentView, setCurrentView] = useState(initialView);
    const [currentStep, setCurrentStep] = useState(initialStep);

  // Map URL paths to steps
  const pathToStep = {
    '/prepare': 'setup',
    '/extract': 'extract',
    '/parametre': 'dataprep'
  };

  // Update state when URL changes
  const updateStateFromUrl = () => {
    const path = window.location.pathname;
    const stepFromUrl = pathToStep[path];
    
    if (stepFromUrl) {
      setCurrentStep(stepFromUrl);
      setCurrentView('extractor');
    } else if (path === '/update') {
      setCurrentView('miseajour');
    } else if (path === '/') {
      // Default to prepare if root path
      navigate('/prepare');
      setCurrentStep('setup');
      setCurrentView('extractor');
    }
  };

  // Set initial state when component mounts or user changes
  useEffect(() => {
    if (user) {
      updateStateFromUrl();
    }
  }, [user]);
  
  // Listen for browser back/forward navigation
  useEffect(() => {
    window.addEventListener('popstate', updateStateFromUrl);
    return () => window.removeEventListener('popstate', updateStateFromUrl);
  }, []);

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
                  navigate('/prepare');
                  setCurrentView('extractor');
                  setCurrentStep('setup');
                }}
              >
                Préparation
              </button>
              <button 
                className={`main-nav-button ${currentView === 'extractor' && currentStep === 'extract' ? 'active' : ''}`}
                onClick={() => {
                  navigate('/extract');
                  setCurrentView('extractor');
                  setCurrentStep('extract');
                }}
              >
                Extraction
              </button>
              <button 
                className={`main-nav-button ${currentView === 'extractor' && currentStep === 'dataprep' ? 'active' : ''}`}
                onClick={() => {
                  navigate('/parametre');
                  setCurrentView('extractor');
                  setCurrentStep('dataprep');
                }}
              >
                Paramétrage
              </button>
              <button 
                className={`main-nav-button ${currentView === 'miseajour' ? 'active' : ''}`}
                onClick={() => {
                  navigate('/update');
                  setCurrentView('miseajour');
                }}
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