import React, { useEffect, useState } from "react";
import { Edit2, Trash2, CheckCircle, Search } from "lucide-react";
import "./MiseAJourPage.css";

const FIELDS = [
  { key: "fournisseur", label: "Fournisseur" },
  { key: "numFacture", label: "Numéro de facture" },
  { key: "dateFacturation", label: "Date de facturation" },
  { key: "tauxTVA", label: "Taux TVA" },
  { key: "montantHT", label: "Montant HT" },
  { key: "montantTVA", label: "Montant TVA" },
  { key: "montantTTC", label: "Montant TTC" },
];

const PAGE_SIZE = 10;

const MiseAJourPage = () => {
  const [factures, setFactures] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState({});
  const [selected, setSelected] = useState(null);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchFactures();
  }, [page, search]);

  const fetchFactures = async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "10",
        search: search,
      });
      const res = await fetch(`http://localhost:8000/factures?${params}`, {
        credentials: 'include', // Ajout des cookies
      });
      if (res.ok) {
        const data = await res.json();
        setFactures(data.factures);
        setTotalPages(data.total_pages);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des factures:", error);
    }
  };

  const handleEdit = (id, field, value) => {
    setEditing((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
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

  const handleUpdate = async (id) => {
    try {
      const updatedData = editing[id];
      if (!updatedData) return;

      const response = await fetch(`http://localhost:8000/factures/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include', // Ajout des cookies
        body: JSON.stringify(updatedData),
      });

      if (response.ok) {
        setEditing((prev) => {
          const newEditing = { ...prev };
          delete newEditing[id];
          return newEditing;
        });
        fetchFactures();
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
    }
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

  const handleSelect = (facture) => {
    setSelected(facture);
    setEditing((prev) => ({
      ...prev,
      [facture.id]: {
        fournisseur: facture.fournisseur,
        numFacture: facture.numFacture,
        dateFacturation: facture.dateFacturation,
        tauxTVA: facture.tauxTVA,
        montantHT: facture.montantHT,
        montantTVA: facture.montantTVA,
        montantTTC: facture.montantTTC,
      },
    }));
  };

  const handleGlobalUpdate = async () => {
    if (!selected) return;

    try {
      const updatedData = editing[selected.id];
      if (!updatedData) return;

      const response = await fetch(`http://localhost:8000/factures/${selected.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include', // Ajout des cookies
        body: JSON.stringify(updatedData),
      });

      if (response.ok) {
        setEditing((prev) => {
          const newEditing = { ...prev };
          delete newEditing[selected.id];
          return newEditing;
        });
        setSelected(null);
        fetchFactures();
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour globale:", error);
    }
  };

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
                      <th key={f.key} className="miseajour-table-header">
                        {f.label}
                      </th>
                    ))}
                    <th className="miseajour-table-header">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map((facture) => (
                    <tr key={facture.id} className="miseajour-table-row">
                      {FIELDS.map((f) => (
                        <td key={f.key} className="miseajour-table-cell">
                          <input
                            value={editing[facture.id]?.[f.key] ?? facture[f.key]}
                            onChange={(e) => handleEdit(facture.id, f.key, e.target.value)}
                            className="miseajour-table-input"
                          />
                        </td>
                      ))}
                      <td className="miseajour-table-cell">
                        <div className="miseajour-actions">
                          <button 
                            onClick={() => handleUpdate(facture.id)} 
                            className="miseajour-action-button update"
                            title="Mettre à jour"
                          >
                            <Edit2 className="miseajour-action-icon" />
                          </button>
                          <button 
                            onClick={() => handleDelete(facture.id)} 
                            className="miseajour-action-button delete"
                            title="Supprimer"
                          >
                            <Trash2 className="miseajour-action-icon" />
                          </button>
                          <button 
                            onClick={() => handleSelect(facture)} 
                            className="miseajour-action-button select"
                            title="Sélectionner"
                          >
                            <CheckCircle className="miseajour-action-icon" />
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

          {selected && (
            <div className="miseajour-edit-section">
              <div className="miseajour-edit-container">
                <h3 className="miseajour-edit-title">Modifier la facture</h3>
                <div className="miseajour-edit-fields">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="miseajour-edit-field">
                      <label className="miseajour-edit-label">{f.label}</label>
                      <input
                        value={editing[selected.id]?.[f.key] ?? selected[f.key]}
                        onChange={(e) => handleEdit(selected.id, f.key, e.target.value)}
                        className="miseajour-edit-input"
                      />
                    </div>
                  ))}
                </div>
                <button 
                  onClick={handleGlobalUpdate} 
                  className="miseajour-edit-button"
                >
                  Appliquer les modifications
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MiseAJourPage;
