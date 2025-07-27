export interface User {
  user_id: string;
  email: string;
  employee_id: string;
  is_admin: boolean;
  is_active: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  employee_id: string;
  is_admin?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface AuthContextType {
  state: AuthState;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (userData: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface AuthError {
  message: string;
  status?: number;
}

// Additional interfaces for compatibility
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  employee_id: string;
  is_admin?: boolean;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  user_id: string;
  email: string;
  employee_id: string;
  is_admin: boolean;
  is_active: boolean;
} 