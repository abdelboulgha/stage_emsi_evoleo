// Configuration de l'API
export const API_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_URL || 'https://pacific-balance-production-7806.up.railway.app',
  CREDENTIALS: 'include', // Inclure les cookies dans toutes les requêtes
};

// Fonction utilitaire pour créer les options de requête par défaut
export const createRequestOptions = (options = {}) => {
  return {
    credentials: API_CONFIG.CREDENTIALS,
    ...options,
  };
};

// Fonction utilitaire pour les requêtes GET
export const apiGet = async (endpoint, options = {}) => {
  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
    method: 'GET',
    ...createRequestOptions(options),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Fonction utilitaire pour les requêtes POST
export const apiPost = async (endpoint, data = null, options = {}) => {
  const requestOptions = createRequestOptions({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (data) {
    requestOptions.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, requestOptions);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Fonction utilitaire pour les requêtes PUT
export const apiPut = async (endpoint, data = null, options = {}) => {
  const requestOptions = createRequestOptions({
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (data) {
    requestOptions.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, requestOptions);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Fonction utilitaire pour les requêtes DELETE
export const apiDelete = async (endpoint, options = {}) => {
  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, {
    method: 'DELETE',
    ...createRequestOptions(options),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Fonction utilitaire pour les requêtes avec FormData
export const apiPostFormData = async (endpoint, formData, options = {}) => {
  const requestOptions = createRequestOptions({
    method: 'POST',
    ...options,
  });

  if (formData) {
    requestOptions.body = formData;
  }

  const response = await fetch(`${API_CONFIG.BASE_URL}${endpoint}`, requestOptions);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}; 