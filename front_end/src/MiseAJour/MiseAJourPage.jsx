import React, { useEffect, useState } from "react";

const FIELDS = [
  { key: "fournisseur", label: "Fournisseur" },
  { key: "numFacture", label: "Numéro de Facture" },
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
    const params = new URLSearchParams({
      page,
      page_size: PAGE_SIZE,
      search,
    });
    const res = await fetch(`http://localhost:8000/factures?${params}`);
    const data = await res.json();
    setFactures(data.factures);
    setTotalPages(data.total_pages);
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

  const handleUpdate = async (id) => {
    // Get the original facture data from the state
    const originalFacture = factures.find(f => f.id === id);
    if (!originalFacture) {
      console.error(`Facture with ID ${id} not found in state.`);
      return;
    }

    // Combine original data with any edits.
    // If editing[id] is undefined (no edits made), it will be an empty object,
    // so originalFacture's properties will be used.
    const dataToProcess = { ...originalFacture, ...(editing[id] || {}) };

    // Use numFacture directly, as this is what the backend expects and what the inputs use
    const casted = {
      ...dataToProcess,
      numFacture: dataToProcess.numFacture,
    };
    const body = convertNumericFields(casted);

    try {
      const response = await fetch(`http://localhost:8000/factures/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to update facture");
      }
      setEditing((prev) => ({ ...prev, [id]: undefined }));
      fetchFactures();
    } catch (error) {
      console.error("Error updating facture:", error);
    }
  };

  const handleDelete = async (id) => {
    await fetch(`http://localhost:8000/factures/${id}`, { method: "DELETE" });
    fetchFactures();
  };

  const handleSelect = (facture) => {
    // Use facture directly since backend consistently uses numFacture
    setSelected(facture);
    setEditing({ [facture.id]: { ...facture } });
  };

  const handleGlobalUpdate = async () => {
    if (!selected) return;

    // Get the original facture data for the selected item
    const originalFacture = factures.find(f => f.id === selected.id);
    if (!originalFacture) {
      console.error(`Selected facture with ID ${selected.id} not found in state.`);
      return;
    }

    // Combine original data with any edits from the global form
    const dataToProcess = { ...originalFacture, ...(editing[selected.id] || {}) };

    // Use numFacture directly
    const casted = {
      ...dataToProcess,
      numFacture: dataToProcess.numFacture,
    };
    const body = convertNumericFields(casted);

    try {
      const response = await fetch(`http://localhost:8000/factures/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to update facture globally");
      }
      setSelected(null);
      setEditing({});
      fetchFactures();
    } catch (error) {
      console.error("Error global updating facture:", error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8">
        <h2 className="text-2xl font-bold text-white mb-6">4. Mise à jour des factures</h2>
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="mb-4 px-4 py-2 border border-white/30 rounded w-full bg-white/20 text-white placeholder-blue-200 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
        <div className="overflow-x-auto">
          <table className="w-full border mb-4 text-white">
            <thead>
              <tr>
                {FIELDS.map((f) => (
                  <th key={f.key} className="border border-white/30 px-2 py-1 bg-white/10">
                    {f.label}
                  </th>
                ))}
                <th className="border border-white/30 px-2 py-1 bg-white/10">Actions</th>
              </tr>
            </thead>
            <tbody>
              {factures.map((facture) => (
                <tr key={facture.id} className="hover:bg-blue-500/10">
                  {FIELDS.map((f) => (
                    <td key={f.key} className="border border-white/30 px-2 py-1">
                      <input
                        value={editing[facture.id]?.[f.key] ?? facture[f.key]}
                        onChange={(e) => handleEdit(facture.id, f.key, e.target.value)}
                        className="w-full px-1 py-1 border border-white/30 rounded bg-white/20 text-white"
                      />
                    </td>
                  ))}
                  <td className="border border-white/30 px-2 py-1 flex gap-2">
                    <button onClick={() => handleUpdate(facture.id)} className="bg-blue-500 text-white px-2 py-1 rounded">
                      Update
                    </button>
                    <button onClick={() => handleDelete(facture.id)} className="bg-red-500 text-white px-2 py-1 rounded">
                      Delete
                    </button>
                    <button onClick={() => handleSelect(facture)} className="bg-green-500 text-white px-2 py-1 rounded">
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mb-4">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-4 py-2 bg-gray-200/70 text-gray-800 rounded">
            Précédent
          </button>
          <span className="text-white">Page {page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="px-4 py-2 bg-gray-200/70 text-gray-800 rounded">
            Suivant
          </button>
        </div>
        {selected && (
          <div className="bg-white/20 p-4 rounded-2xl shadow border border-white/30 mt-4">
            <h3 className="text-lg font-bold text-white mb-2">Modifier la facture</h3>
            {FIELDS.map((f) => (
              <div key={f.key} className="mb-2">
                <label className="block font-medium text-white mb-1">{f.label}</label>
                <input
                  value={editing[selected.id]?.[f.key] ?? selected[f.key]}
                  onChange={(e) => handleEdit(selected.id, f.key, e.target.value)}
                  className="w-full px-2 py-1 border border-white/30 rounded bg-white/20 text-white"
                />
              </div>
            ))}
            <button onClick={handleGlobalUpdate} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
              Appliquer les modifications
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiseAJourPage;
