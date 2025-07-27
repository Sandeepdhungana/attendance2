import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AuthState, AuthContextType, LoginRequest, RegisterRequest, User } from '../types/auth';
import AuthService from '../services/auth';

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  accessToken: null,
  refreshToken: null,
};

// Action types
type AuthAction = 
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User; accessToken: string; refreshToken: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'TOKEN_REFRESH_SUCCESS'; payload: string };

// Reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
      };
    
    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
        accessToken: null,
        refreshToken: null,
      };
    
    case 'AUTH_LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        accessToken: null,
        refreshToken: null,
      };
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    
    case 'TOKEN_REFRESH_SUCCESS':
      return {
        ...state,
        accessToken: action.payload,
      };
    
    default:
      return state;
  }
};

// Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedUser = AuthService.getUser();
        const storedAccessToken = AuthService.getAccessToken();
        const storedRefreshToken = AuthService.getRefreshToken();

        if (storedUser && storedAccessToken && storedRefreshToken) {
          // Check if token is still valid
          if (AuthService.isAccessTokenValid()) {
            dispatch({
              type: 'AUTH_SUCCESS',
              payload: {
                user: storedUser,
                accessToken: storedAccessToken,
                refreshToken: storedRefreshToken,
              },
            });
          } else {
            // Try to refresh token
            try {
              const newAccessToken = await AuthService.refreshAccessToken();
              const user = await AuthService.getCurrentUser();
              
              dispatch({
                type: 'AUTH_SUCCESS',
                payload: {
                  user,
                  accessToken: newAccessToken,
                  refreshToken: AuthService.getRefreshToken()!,
                },
              });
            } catch (error) {
              // Refresh failed, clear tokens
              AuthService.clearTokens();
              AuthService.clearUser();
              dispatch({ type: 'AUTH_LOGOUT' });
            }
          }
        } else {
          // No stored auth data
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = async (credentials: LoginRequest): Promise<void> => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      const tokenResponse = await AuthService.login(credentials);
      const user = AuthService.getUser();
      
      if (!user) {
        throw new Error('User data not found after login');
      }

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
        },
      });
    } catch (error: any) {
      dispatch({
        type: 'AUTH_FAILURE',
        payload: error.message || 'Login failed',
      });
      throw error;
    }
  };

  // Register function
  const register = async (userData: RegisterRequest): Promise<void> => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      await AuthService.register(userData);
      
      // After successful registration, the user needs to log in
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error: any) {
      dispatch({
        type: 'AUTH_FAILURE',
        payload: error.message || 'Registration failed',
      });
      throw error;
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    try {
      await AuthService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  // Logout all function
  const logoutAll = async (): Promise<void> => {
    try {
      await AuthService.logoutAll();
    } catch (error) {
      console.error('Logout all error:', error);
    } finally {
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  // Refresh token function
  const refreshToken = async (): Promise<void> => {
    try {
      const newAccessToken = await AuthService.refreshAccessToken();
      dispatch({
        type: 'TOKEN_REFRESH_SUCCESS',
        payload: newAccessToken,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      dispatch({ type: 'AUTH_LOGOUT' });
      throw error;
    }
  };

  // Clear error function
  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  // Auto-refresh token before it expires
  useEffect(() => {
    let intervalId: number;

    if (state.isAuthenticated && state.accessToken) {
      // Check token validity every 5 minutes
      intervalId = setInterval(async () => {
        try {
          await AuthService.ensureValidToken();
        } catch (error) {
          console.error('Auto token refresh failed:', error);
          dispatch({ type: 'AUTH_LOGOUT' });
        }
      }, 5 * 60 * 1000); // 5 minutes
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [state.isAuthenticated, state.accessToken]);

  const contextValue: AuthContextType = {
    state,
    login,
    register,
    logout,
    logoutAll,
    refreshToken,
    clearError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext; 