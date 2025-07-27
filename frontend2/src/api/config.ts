import axios from 'axios';

// API Configuration
// const API_BASE_URL = 'http://185.211.6.6:8000';
// const API_BASE_URL = 'http://localhost:8000';
const API_BASE_URL = 'https://footfall.duckdns.org/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Store reference to avoid circular imports
let authServiceInstance: any = null;

// Function to set auth service instance
export const setAuthService = (authService: any) => {
  authServiceInstance = authService;
};

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    // Skip auth for login/register endpoints
    if (config.url?.includes('/auth/login') || config.url?.includes('/auth/register')) {
      return config;
    }

    // Get auth service instance
    if (!authServiceInstance) {
      const { default: AuthService } = await import('../services/auth');
      authServiceInstance = AuthService;
    }

    try {
      // Ensure we have a valid token
      const token = await authServiceInstance.ensureValidToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Failed to get auth token:', error);
      // Don't block the request, let it go through and handle 401 in response interceptor
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh and errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Skip retry for login/register endpoints
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/register')) {
        return Promise.reject(error);
      }

      try {
        // Get auth service instance
        if (!authServiceInstance) {
          const { default: AuthService } = await import('../services/auth');
          authServiceInstance = AuthService;
        }

        // Try to refresh token
        const newToken = await authServiceInstance.refreshAccessToken();
        
        if (newToken) {
          // Update the original request with new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          
          // Retry the original request
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        if (authServiceInstance) {
          authServiceInstance.clearTokens();
          authServiceInstance.clearUser();
        }
        
        // Only redirect if we're not already on login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      }
    }

    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default api; 