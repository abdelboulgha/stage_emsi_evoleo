import React, { useEffect, useState } from "react";
import { Edit2, Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import fr from 'date-fns/locale/fr';
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
  { key: "numFacture", label: "Numéro de Facture" },
  { key: "dateFacturation", label: "Date Facturation" },
  { key: "tauxTVA", label: "Taux TVA" },
  { key: "montantHT", label: "Montant HT" },
  { key: "montantTVA", label: "Montant TVA" },
  { key: "date_creation", label: "Date D'ajout" },
  { key: "montantTTC", label: "Montant TTC" },
];

const PAGE_SIZE = 10;

const MiseAJourPage = () => {
  const [factures, setFactures] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  useEffect(() => {
    fetchFactures();
  }, [page, search]);

  const fetchFactures = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const params = new URLSearchParams({
        page,
        page_size: PAGE_SIZE,
        search,
      });

      const res = await fetch(`http://localhost:8000/factures?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          console.error('Authentication failed - please log in again');
          // Optionally redirect to login
          // window.location.href = '/login';
        }
        throw new Error('Failed to fetch factures');
      }

      const data = await res.json();
      setFactures(data.factures || []);
      setTotalPages(data.total_pages || 1);
    } catch (error) {
      console.error('Error fetching factures:', error);
      setFactures([]);
      setTotalPages(1);
    }
  };

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

  const handleEdit = (id, field, value) => {
    setEditing((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
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
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const response = await fetch(`http://localhost:8000/factures/${id}`, {
        method: "DELETE",
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete facture');
      }

      fetchFactures();
    } catch (error) {
      console.error('Error deleting facture:', error);
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
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        return;
      }

      const body = convertNumericFields({
        ...editing,
        // Format dateFacturation back to YYYY-MM-DD for the backend
        dateFacturation: editing.dateFacturation ? new Date(editing.dateFacturation).toISOString().split('T')[0] : ''
      });

      const response = await fetch(`http://localhost:8000/factures/${editing.id}`, {
        method: "PUT",
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to update facture");
      }

      closeModal();
    } catch (error) {
      console.error("Error updating facture:", error);
      // Show error to user if needed
    } finally {
      // Always refresh the facture list, whether the update succeeded or failed
      fetchFactures();
    }
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ChevronUp className="w-4 h-4 opacity-30" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-4 h-4" /> 
      : <ChevronDown className="w-4 h-4" />;
  };

  const sortedFactures = sortData(factures);

  return (
    <div className="max-w-[90rem] mx-auto mt-9">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-12 pt-16 pb-16" >
       
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="mb-6 px-4 py-3 border border-white/30 rounded-lg w-full bg-white/20 text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
        />
        
        <div className="overflow-x-auto rounded-xl border border-white/20">
          <table className="w-full text-white">
            <thead>
              <tr className="bg-white/10">
                {FIELDS.map((f) => (
                  <th 
                    key={f.key} 
                    className="border-b border-white/20 px-4 py-4 text-left font-semibold cursor-pointer hover:bg-white/20 transition-colors duration-200"
                    onClick={() => handleSort(f.key)}
                  >
                    <div className="flex items-center justify-between">
                      <span>{f.label}</span>
                      <div className="flex flex-col">
                        {getSortIcon(f.key)}
                      </div>
                    </div>
                  </th>
                ))}
                <th className="border-b border-white/20 px-4 py-4 text-center font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFactures.map((facture, index) => (
                <tr 
                  key={facture.id} 
                  className="hover:bg-white/10 cursor-pointer transition-colors duration-200 border-b border-white/10"
                  onClick={() => openEditModal(facture)}
                >
                  {FIELDS.map((f) => (
                    <td key={f.key} className="px-4 py-4">
                      <div className="px-2 py-1">
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
                  <td className="px-4 py-4">
                    <div className="flex gap-2 items-center justify-center">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(facture);
                        }} 
                        className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105" 
                        title="Modifier"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(facture.id);
                        }} 
                        className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105" 
                        title="Supprimer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="flex justify-between items-center mt-6">
          <button 
            disabled={page === 1} 
            onClick={() => setPage(page - 1)} 
            className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Précédent
          </button>
          <span className="text-white font-medium">Page {page} / {totalPages}</span>
          <button 
            disabled={page === totalPages} 
            onClick={() => setPage(page + 1)} 
            className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant
          </button>
        </div>
        
        {/* Edit Modal */}
        {isModalOpen && editing && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white/20 backdrop-blur-lg border border-white/30 rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Modifier la facture</h3>
                <button 
                  onClick={closeModal}
                  className="text-white hover:text-gray-300 transition-colors duration-200"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="mb-4">
                      <label className="block text-sm font-semibold text-white mb-2">
                        {f.label}
                      </label>
                      
                      {f.key === 'date_creation' ? (
                        <div className="px-4 py-3 bg-white/10 rounded-lg text-white border border-white/20">
                          {formatDateTime(editing[f.key])}
                        </div>
                      ) : f.key === 'dateFacturation' ? (
                        <DatePicker
                          selected={editing[f.key] ? new Date(editing[f.key]) : null}
                          onChange={(date) => handleDateChange(date, f.key)}
                          dateFormat="dd/MM/yyyy"
                          locale="fr"
                          className="w-full px-4 py-3 border border-white/30 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          placeholderText="Sélectionner une date"
                        />
                      ) : (
                        <input
                          type={f.key === 'montantHT' || f.key === 'montantTVA' || f.key === 'montantTTC' || f.key === 'tauxTVA' ? 'number' : 'text'}
                          name={f.key}
                          value={editing[f.key] || ''}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 border border-white/30 rounded-lg bg-white/20 text-white focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                          step={f.key === 'tauxTVA' ? '0.01' : '1'}
                          placeholder={`Entrez ${f.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-200"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200"
                  >
                    Appliquer les modifications
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiseAJourPage;
