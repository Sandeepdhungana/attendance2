import axios from 'axios';

// API Configuration
// const API_BASE_URL = 'http://185.211.6.6:8000';
const API_BASE_URL = 'http://localhost:8000';
// const API_BASE_URL = 'https://footfall.duckdns.org/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor to handle errorsP
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default api; 