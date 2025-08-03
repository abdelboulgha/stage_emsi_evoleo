import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AuthPage from './auth/AuthPage';
import ExtractorNew from './ExtractorNew';
import UserManagement from './auth/UserManagement';
import './AppContent.css';

const AppContent = () => {
  const { user, loading, logout, isAdmin } = useAuth();
  const [currentView, setCurrentView] = useState('extractor');

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
        return <ExtractorNew />;
      case 'users':
        return <UserManagement />;
      default:
        return <ExtractorNew />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Evoléo - Extraction de Factures</h1>
          </div>
          
          <nav className="header-nav">
            <button
              className={`nav-button ${currentView === 'extractor' ? 'active' : ''}`}
              onClick={() => setCurrentView('extractor')}
            >
              Extraction
            </button>
            
            {isAdmin() && (
              <button
                className={`nav-button ${currentView === 'users' ? 'active' : ''}`}
                onClick={() => setCurrentView('users')}
              >
                Gestion Utilisateurs
              </button>
            )}
          </nav>
          
          <div className="header-right">
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