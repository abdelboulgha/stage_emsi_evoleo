import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './UserManagement.css';

const UserManagement = () => {
  const { token, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (isAdmin()) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('https://pacific-balance-production-7806.up.railway.app/auth/users', {
        credentials: 'include', 
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des utilisateurs');
      }

      const data = await response.json();
      setUsers(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditForm({
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      actif: user.actif
    });
  };

  const handleUpdateUser = async () => {
    try {
      const response = await fetch(`https://pacific-balance-production-7806.up.railway.app/auth/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ajout des cookies
        body: JSON.stringify(editForm)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la mise à jour');
      }

      // Mettre à jour la liste des utilisateurs
      await fetchUsers();
      setEditingUser(null);
      setEditForm({});
    } catch (error) {
      setError(error.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir désactiver cet utilisateur ?')) {
      return;
    }

    try {
      const response = await fetch(`https://pacific-balance-production-7806.up.railway.app/auth/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include', // Ajout des cookies
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la désactivation');
      }

      await fetchUsers();
    } catch (error) {
      setError(error.message);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isAdmin()) {
    return (
      <div className="user-management">
        <div className="error-message">
          Accès refusé. Rôle administrateur requis.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="user-management">
        <div className="loading">Chargement des utilisateurs...</div>
      </div>
    );
  }

  return (
    <div className="user-management">
      <h2>Gestion des Utilisateurs</h2>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Date de création</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className={!user.actif ? 'inactive-user' : ''}>
                <td>{user.nom}</td>
                <td>{user.prenom}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role === 'admin' ? 'Administrateur' : 'Comptable'}
                  </span>
                </td>
                <td>{formatDate(user.date_creation)}</td>
                <td>
                  <span className={`status-badge ${user.actif ? 'active' : 'inactive'}`}>
                    {user.actif ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="edit-btn"
                      onClick={() => handleEditUser(user)}
                    >
                      Modifier
                    </button>
                    {user.actif && (
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        Désactiver
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal d'édition */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Modifier l'utilisateur</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleUpdateUser(); }}>
              <div className="form-group">
                <label>Nom:</label>
                <input
                  type="text"
                  value={editForm.nom}
                  onChange={(e) => setEditForm({...editForm, nom: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Prénom:</label>
                <input
                  type="text"
                  value={editForm.prenom}
                  onChange={(e) => setEditForm({...editForm, prenom: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Rôle:</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                >
                  <option value="comptable">Comptable</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editForm.actif}
                    onChange={(e) => setEditForm({...editForm, actif: e.target.checked})}
                  />
                  Actif
                </label>
              </div>
              
              <div className="modal-actions">
                <button type="submit" className="save-btn">
                  Enregistrer
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {
                    setEditingUser(null);
                    setEditForm({});
                  }}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement; 