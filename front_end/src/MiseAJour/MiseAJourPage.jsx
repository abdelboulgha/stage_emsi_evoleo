import React, { useEffect, useState, useCallback } from "react";
import { registerLocale,DatePicker } from "react-datepicker";
import fr from 'date-fns/locale/fr';
import { Edit2, Trash2, Search, X, ChevronUp, ChevronDown, Calendar,ChevronRight } from "lucide-react";
import "react-datepicker/dist/react-datepicker.css";
import "./MiseAJourPage.css";

// Register French locale for date picker
registerLocale('fr', fr);

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
  { key: "created_at", label: "Date D'ajout" },
];

const MiseAJourPage = () => {
  // Sous valeurs state (array of objects)
  const [sousValeurs, setSousValeurs] = useState([]);
  const [showSousHT, setShowSousHT] = useState(false);
  const [showSousTVA, setShowSousTVA] = useState(false);
  const [showSousTTC, setShowSousTTC] = useState(false);
  const [factures, setFactures] = useState([]);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDateFacturation, setSelectedDateFacturation] = useState(null);
  const [selectedDateAjout, setSelectedDateAjout] = useState(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchTimeout, setSearchTimeout] = useState(null);

  const fetchFactures = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        search: searchTerm,
      });
      
      const res = await fetch(`http://localhost:8000/factures?${params}`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        setFactures(data.factures || []);
        
        // Calculate total pages based on the response
        let totalPages = 1;
        
        if (data.pagination) {
          totalPages = data.pagination.total_pages || 1;
        } else if (data.total_count !== undefined) {
          totalPages = Math.ceil((data.total_count || 0) / 10);
        }
        
        // Ensure we have at least 1 page
        totalPages = Math.max(1, totalPages);
        setTotalPages(totalPages);
        
        // If current page is greater than total pages, reset to page 1
        if (page > totalPages) {
          setPage(1);
          return; // This will trigger a refetch with page=1
        }
      }
    } catch (error) {
      setFactures([]);
      setTotalPages(1);
    }
  }, [page, searchTerm]);

  // Format date to YYYY-MM-DD in local timezone
  const formatDateForSearch = (date) => {
    if (!date) return '';
    const d = new Date(date);
    // Use local date components to avoid timezone issues
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle search input with debounce
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      let searchQuery = search;
      
      // Remove any existing date filters
      searchQuery = searchQuery.replace(/\s*(date|date_ajout):[^\s]+/g, '').trim();
      
      // Add date facturation filter if selected
      if (selectedDateFacturation) {
        const formattedDate = formatDateForSearch(selectedDateFacturation);
        searchQuery = searchQuery ? `${searchQuery} date:${formattedDate}` : `date:${formattedDate}`;
      }
      
      // Add date ajout filter if selected
      if (selectedDateAjout) {
        const formattedDate = formatDateForSearch(selectedDateAjout);
        searchQuery = searchQuery ? `${searchQuery} date_ajout:${formattedDate}` : `date_ajout:${formattedDate}`;
      }
      
      setSearchTerm(searchQuery);
      setPage(1);
    }, 500);

    setSearchTimeout(timeout);

    return () => {
      clearTimeout(timeout);
    };
  }, [search, selectedDateFacturation, selectedDateAjout]);

  
  // Fetch data when page or searchTerm changes
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
      if (sortConfig.key === 'dateFacturation' || sortConfig.key === 'created_at') {
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
    try {
      await fetch(`http://localhost:8000/factures/${id}`, { 
        method: "DELETE",
        credentials: 'include', // Ajout des cookies
      });
      fetchFactures();
    } catch (error) {
      // Optionally show error in modal
    }
    setDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  const openDeleteModal = (facture) => {
    setDeleteTarget(facture);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteTarget(null);
  };
  const openEditModal = (facture) => {
    setEditing({ ...facture });
    setIsModalOpen(true);
    // Fetch sous_valeurs for this facture
    fetch(`http://localhost:8000/sous_valeurs?facture_id=${facture.id}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.resolve({ sous_valeurs: [] }))
      .then(data => {
        setSousValeurs((data.sous_valeurs || []).map(val => ({
          id: val.id,
          HT: val.HT,
          TVA: val.TVA,
          TTC: val.TTC
        })));
        setShowSousHT(false);
      });
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
      // Build sous_valeurs array for backend
      const sousValeursArray = sousValeurs.map(val => ({
        id: val.id,
        HT: parseFloat(val.HT) || 0,
        TVA: parseFloat(val.TVA) || 0,
        TTC: parseFloat(val.TTC) || 0
      }));
      const body = convertNumericFields({
        ...editing,
        // Format dateFacturation back to YYYY-MM-DD for the backend
        dateFacturation: editing.dateFacturation ? new Date(editing.dateFacturation).toISOString().split('T')[0] : '',
        sous_valeurs: sousValeursArray
      });
  // console.log('[DEBUG] PUT /factures payload:', body);
      const response = await fetch(`http://localhost:8000/factures/${editing.id}`, {
        method: "PUT",
        headers: { 
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ajout des cookies
        body: JSON.stringify(body),
      });
      const respJson = await response.json();
  // console.log('[DEBUG] PUT /factures response:', respJson);
      if (!response.ok) {
        throw new Error(respJson.detail || "Failed to update facture");
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
        <div className="miseajour-main">
          <div className="miseajour-search-section">
            <div className="miseajour-search-container">
              <Search className="miseajour-search-icon" />
              <input
                type="text"
                placeholder="Rechercher par fournisseur, numéro de facture, etc..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                className="miseajour-search-input"
              />
            </div>
            <div className="miseajour-datepicker-container">
              <Calendar className="miseajour-datepicker-icon" size={18} />
              <DatePicker
                selected={selectedDateFacturation}
                onChange={(date) => {
                  setSelectedDateFacturation(date);
                }}
                dateFormat="dd/MM/yyyy"
                placeholderText="Date facturation"
                className="miseajour-datepicker"
                isClearable={false}
                showYearDropdown
                dropdownMode="select"
                locale="fr"
              />
              {selectedDateFacturation && (
                <button 
                  className="miseajour-datepicker-clear" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDateFacturation(null);
                  }}
                  title="Effacer la date"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            
            <div className="miseajour-datepicker-container">
              <Calendar className="miseajour-datepicker-icon" size={18} />
              <DatePicker
                selected={selectedDateAjout}
                onChange={(date) => {
                  setSelectedDateAjout(date);
                }}
                dateFormat="dd/MM/yyyy"
                placeholderText="Date d'ajout"
                className="miseajour-datepicker"
                isClearable={false}
                showYearDropdown
                dropdownMode="select"
                locale="fr"
              />
              {selectedDateAjout && (
                <button 
                  className="miseajour-datepicker-clear" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDateAjout(null);
                  }}
                  title="Effacer la date"
                >
                  <X size={16} />
                </button>
              )}
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
                            {f.key === 'created_at' 
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
                              openDeleteModal(facture);
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
                    {f.key === 'created_at' ? (
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
                {/* Sous HT toggleable list */}
                <div className="miseajour-modal-field">
                  <div className="miseajour-modal-label-row">
                    <label className="miseajour-modal-label">Sous HT</label>
                    <button type="button" className="miseajour-modal-toggle" onClick={() => setShowSousHT(v => !v)}>
                      {showSousHT ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                  {showSousHT && (
                    <ul className="miseajour-modal-list">
                      {sousValeurs.length === 0 ? (
                        <li className="miseajour-modal-list-empty">Aucune valeur</li>
                      ) : sousValeurs.map((valObj, idx) => (
                        <li key={valObj.id ?? idx} className="miseajour-modal-list-item">
                          <input
                            type="number"
                            value={valObj.HT}
                            onChange={e => {
                              const newVal = e.target.value;
                              setSousValeurs(prev => prev.map((v, i) => i === idx ? { ...v, HT: newVal } : v));
                            }}
                            className="miseajour-modal-input sousvaleurs-input"
                            placeholder="HT"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Sous TVA toggleable list */}
                <div className="miseajour-modal-field">
                  <div className="miseajour-modal-label-row">
                    <label className="miseajour-modal-label">Sous TVA</label>
                    <button type="button" className="miseajour-modal-toggle" onClick={() => setShowSousTVA(v => !v)}>
                      {showSousTVA ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                  {showSousTVA && (
                    <ul className="miseajour-modal-list">
                      {sousValeurs.length === 0 ? (
                        <li className="miseajour-modal-list-empty">Aucune valeur</li>
                      ) : sousValeurs.map((valObj, idx) => (
                        <li key={valObj.id ?? idx} className="miseajour-modal-list-item">
                          <input
                            type="number"
                            value={valObj.TVA}
                            onChange={e => {
                              const newVal = e.target.value;
                              setSousValeurs(prev => prev.map((v, i) => i === idx ? { ...v, TVA: newVal } : v));
                            }}
                            className="miseajour-modal-input sousvaleurs-input"
                            placeholder="TVA"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Sous TTC toggleable list */}
                <div className="miseajour-modal-field">
                  <div className="miseajour-modal-label-row">
                    <label className="miseajour-modal-label">Sous TTC</label>
                    <button type="button" className="miseajour-modal-toggle" onClick={() => setShowSousTTC(v => !v)}>
                      {showSousTTC ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                  {showSousTTC && (
                    <ul className="miseajour-modal-list">
                      {sousValeurs.length === 0 ? (
                        <li className="miseajour-modal-list-empty">Aucune valeur</li>
                      ) : sousValeurs.map((valObj, idx) => (
                        <li key={valObj.id ?? idx} className="miseajour-modal-list-item">
                          <input
                            type="number"
                            value={valObj.TTC}
                            onChange={e => {
                              const newVal = e.target.value;
                              setSousValeurs(prev => prev.map((v, i) => i === idx ? { ...v, TTC: newVal } : v));
                            }}
                            className="miseajour-modal-input sousvaleurs-input"
                            placeholder="TTC"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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

      {/* Delete Modal */}
      {deleteModalOpen && deleteTarget && (
        <div className="miseajour-modal-overlay">
          <div className="miseajour-modal">
            <div className="miseajour-modal-header">
              <h3 className="miseajour-modal-title">Confirmer la suppression</h3>
              <button 
                onClick={closeDeleteModal}
                className="miseajour-modal-close"
              >
                <X className="miseajour-modal-close-icon" />
              </button>
            </div>
            <div className="miseajour-modal-fields">
              <div className="miseajour-modal-field">
                <label className="miseajour-modal-label">Fournisseur</label>
                <div className="miseajour-modal-readonly">{deleteTarget.fournisseur}</div>
              </div>
              <div className="miseajour-modal-field">
                <label className="miseajour-modal-label">Numéro de facture</label>
                <div className="miseajour-modal-readonly">{deleteTarget.numFacture}</div>
              </div>
              
            </div>
            <div className="miseajour-modal-actions">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="miseajour-modal-button cancel"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteTarget.id)}
                className="miseajour-modal-button submit"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  }

  export default MiseAJourPage;
