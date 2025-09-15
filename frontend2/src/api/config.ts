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
  timeout: 10000, // 10 seconds timeout to prevent hanging requests
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
      // Ensure we have a valid token with timeout
      const tokenPromise = authServiceInstance.ensureValidToken();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Token check timeout')), 5000)
      );
      
      const token = await Promise.race([tokenPromise, timeoutPromise]);
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
      if (originalRequest.url?.includes('/auth/login') || 
          originalRequest.url?.includes('/auth/register') ||
          originalRequest.url?.includes('/auth/refresh')) {
        return Promise.reject(error);
      }

      try {
        // Get auth service instance
        if (!authServiceInstance) {
          const { default: AuthService } = await import('../services/auth');
          authServiceInstance = AuthService;
        }

        // Check if we have a valid refresh token before attempting refresh
        const refreshToken = authServiceInstance.getRefreshToken();
        if (!refreshToken || !authServiceInstance.isRefreshTokenValid()) {
          // No refresh token or refresh token expired, redirect to login
          console.log('No valid refresh token available, redirecting to login');
          if (authServiceInstance) {
            authServiceInstance.clearTokens();
            authServiceInstance.clearUser();
          }
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return Promise.reject(error);
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
        // Refresh failed - clear everything and redirect
        console.log('Token refresh failed in interceptor:', refreshError);
        if (authServiceInstance) {
          authServiceInstance.clearTokens();
          authServiceInstance.clearUser();
        }
        
        // Only redirect if we're not already on login page
        if (window.location.pathname !== '/login') {
          // Add a small delay to prevent race conditions with AuthContext
          setTimeout(() => {
            window.location.href = '/login';
          }, 100);
        }
        
        return Promise.reject(refreshError);
      }
    }

    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default api; 