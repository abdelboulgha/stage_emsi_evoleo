import React, { useEffect, useState, useCallback } from "react";
import { Edit2, Trash2, Search, X, ChevronUp, ChevronDown } from "lucide-react";

import "./MiseAJourPage.css";

const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const formatDateOnly = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const FIELDS = [
  { key: "fournisseur", label: "Fournisseur" },
  { key: "numFacture", label: "Numéro de facture" },
  { key: "dateFacturation", label: "Date de facturation" },
  { key: "tauxTVA", label: "Taux TVA" },
  { key: "montantHT", label: "Montant HT" },
  { key: "montantTVA", label: "Montant TVA" },
  { key: "montantTTC", label: "Montant TTC" },
  { key: "date_creation", label: "Date D'ajout" },
];

const MiseAJourPage = () => {
  const [factures, setFactures] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const fetchFactures = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "10",
        search: search,
      });
      const res = await fetch(`http://localhost:8000/factures?${params}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setFactures(data.factures || []);
        setTotalPages(data.total_pages || 1);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des factures:", error);
      setFactures([]);
      setTotalPages(1);
    }
  }, [page, search]);

  useEffect(() => {
    fetchFactures();
  }, [fetchFactures]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortData = (data) => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle date fields
      if (sortConfig.key === 'dateFacturation' || sortConfig.key === 'date_creation') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }
      // Handle numeric fields
      else if (['montantHT', 'montantTVA', 'montantTTC', 'tauxTVA'].includes(sortConfig.key)) {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      }
      // Handle string fields
      else {
        aValue = String(aValue || '').toLowerCase();
        bValue = String(bValue || '').toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const convertNumericFields = (data) => {
    const copy = { ...data };
    ["montantHT", "montantTVA", "montantTTC", "tauxTVA"].forEach((key) => {
      if (copy[key] !== undefined) {
        const num = parseFloat(copy[key]);
        if (!isNaN(num)) copy[key] = num;
      }
    });
    return copy;
  };

  const handleDelete = async (id) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette facture ?")) {
      try {
        await fetch(`http://localhost:8000/factures/${id}`, { 
          method: "DELETE",
          credentials: 'include', // Ajout des cookies
        });
        fetchFactures();
      } catch (error) {
        console.error("Erreur lors de la suppression:", error);
      }
    }
  };

  const openEditModal = (facture) => {
    setEditing({ ...facture });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditing(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleDateChange = (date, field) => {
    setEditing(prev => ({
      ...prev,
      [field]: date
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editing) return;

    try {
      const body = convertNumericFields({
        ...editing,
        // Format dateFacturation back to YYYY-MM-DD for the backend
        dateFacturation: editing.dateFacturation ? new Date(editing.dateFacturation).toISOString().split('T')[0] : ''
      });

      const response = await fetch(`http://localhost:8000/factures/${editing.id}`, {
        method: "PUT",
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ajout des cookies
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to update facture");
      }

      closeModal();
    } catch (error) {
      console.error("Error updating facture:", error);
    } finally {
      // Always refresh the facture list, whether the update succeeded or failed
      fetchFactures();
    }
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ChevronUp className="miseajour-sort-icon inactive" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="miseajour-sort-icon" /> 
      : <ChevronDown className="miseajour-sort-icon" />;
  };

  const sortedFactures = sortData(factures);

  return (
    <div className="miseajour-container">
      <div className="miseajour-content">
        <div className="miseajour-header">
          <h1 className="miseajour-title">Mise à jour</h1>
          <p className="miseajour-subtitle">
            Gérez et modifiez vos factures extraites
          </p>
        </div>

        <div className="miseajour-main">
          <div className="miseajour-search-section">
            <div className="miseajour-search-container">
              <Search className="miseajour-search-icon" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="miseajour-search-input"
              />
            </div>
          </div>

          <div className="miseajour-table-section">
            <div className="miseajour-table-container">
              <table className="miseajour-table">
                <thead>
                  <tr>
                    {FIELDS.map((f) => (
                      <th 
                        key={f.key} 
                        className="miseajour-table-header"
                        onClick={() => handleSort(f.key)}
                      >
                        <div className="miseajour-header-content">
                          <span>{f.label}</span>
                          <div className="miseajour-sort-icons">
                            {getSortIcon(f.key)}
                          </div>
                        </div>
                      </th>
                    ))}
                    <th className="miseajour-table-header">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFactures.map((facture) => (
                    <tr 
                      key={facture.id} 
                      className="miseajour-table-row"
                      onClick={() => openEditModal(facture)}
                    >
                      {FIELDS.map((f) => (
                        <td key={f.key} className="miseajour-table-cell">
                          <div className="miseajour-cell-content">
                            {f.key === 'date_creation' 
                              ? formatDateTime(facture[f.key])
                              : f.key === 'dateFacturation'
                                ? formatDateOnly(facture[f.key])
                                : f.key === 'montantHT' || f.key === 'montantTVA' || f.key === 'montantTTC'
                                  ? `${facture[f.key]}`
                                  : f.key === 'tauxTVA'
                                    ? `${facture[f.key]}%`
                                    : facture[f.key]}
                          </div>
                        </td>
                      ))}
                      <td className="miseajour-table-cell">
                        <div className="miseajour-actions">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(facture);
                            }} 
                            className="miseajour-action-button edit"
                            title="Modifier"
                          >
                            <Edit2 className="miseajour-action-icon" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(facture.id);
                            }} 
                            className="miseajour-action-button delete"
                            title="Supprimer"
                          >
                            <Trash2 className="miseajour-action-icon" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="miseajour-pagination">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(page - 1)} 
              className="miseajour-pagination-button prev"
            >
              Précédent
            </button>
            <span className="miseajour-pagination-info">Page {page} / {totalPages}</span>
            <button 
              disabled={page === totalPages} 
              onClick={() => setPage(page + 1)} 
              className="miseajour-pagination-button next"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isModalOpen && editing && (
        <div className="miseajour-modal-overlay">
          <div className="miseajour-modal">
            <div className="miseajour-modal-header">
              <h3 className="miseajour-modal-title">Modifier la facture</h3>
              <button 
                onClick={closeModal}
                className="miseajour-modal-close"
              >
                <X className="miseajour-modal-close-icon" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="miseajour-modal-form">
              <div className="miseajour-modal-fields">
                {FIELDS.map((f) => (
                  <div key={f.key} className="miseajour-modal-field">
                    <label className="miseajour-modal-label">
                      {f.label}
                    </label>
                    
                    {f.key === 'date_creation' ? (
                      <div className="miseajour-modal-readonly">
                        {formatDateTime(editing[f.key])}
                      </div>
                    ) : f.key === 'dateFacturation' ? (
                      <input
                        type="date"
                        name={f.key}
                        value={editing[f.key] ? new Date(editing[f.key]).toISOString().split('T')[0] : ''}
                        onChange={(e) => handleDateChange(e.target.value, f.key)}
                        className="miseajour-modal-input"
                      />
                    ) : (
                      <input
                        type={f.key === 'montantHT' || f.key === 'montantTVA' || f.key === 'montantTTC' || f.key === 'tauxTVA' ? 'number' : 'text'}
                        name={f.key}
                        value={editing[f.key] || ''}
                        onChange={handleInputChange}
                        className="miseajour-modal-input"
                        step={f.key === 'tauxTVA' ? '0.01' : '1'}
                        placeholder={`Entrez ${f.label.toLowerCase()}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              
              <div className="miseajour-modal-actions">
                <button
                  type="button"
                  onClick={closeModal}
                  className="miseajour-modal-button cancel"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="miseajour-modal-button submit"
                >
                  Appliquer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiseAJourPage;
