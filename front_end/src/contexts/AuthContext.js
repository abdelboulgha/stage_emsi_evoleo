import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Vérifier l'authentification au chargement de l'application
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Vérifier si l'utilisateur est authentifié via les cookies
        const response = await fetch('https://pacific-balance-production-7806.up.railway.app/auth/me', {
          credentials: 'include', 
        });
        
        console.log("Réponse /auth/me:", response.status, response.statusText);
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          console.log("Utilisateur connecté:", userData.email);
        } else {
          // Pas d'authentification valide
          console.log("Aucune authentification valide trouvée");
          setUser(null);
        }
      } catch (error) {
        console.error('Erreur lors de la vérification de l\'authentification:', error);
        setUser(null);
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await fetch('https://pacific-balance-production-7806.up.railway.app/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Inclure les cookies dans la requête
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur de connexion');
      }

      const data = await response.json();
      setUser(data.user);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const register = async (userData) => {
    try {
      const response = await fetch('https://pacific-balance-production-7806.up.railway.app/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Inclure les cookies dans la requête
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur d\'inscription');
      }

      const data = await response.json();
      setUser(data.user);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      // Appeler l'endpoint de déconnexion pour supprimer le cookie
      await fetch('https://pacific-balance-production-7806.up.railway.app/auth/logout', {
        method: 'POST',
        credentials: 'include', // Inclure les cookies dans la requête
      });
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      // Toujours nettoyer l'état local
      setUser(null);
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await fetch('https://pacific-balance-production-7806.up.railway.app/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Inclure les cookies dans la requête
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors du changement de mot de passe');
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const isAdmin = () => {
    return user && user.role === 'admin';
  };

  const isComptable = () => {
    return user && user.role === 'comptable';
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    changePassword,
    isAdmin,
    isComptable,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 