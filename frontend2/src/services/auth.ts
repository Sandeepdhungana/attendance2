import api, { setAuthService } from '../api/config';
import { 
  LoginRequest, 
  RegisterRequest, 
  TokenResponse, 
  RefreshTokenRequest, 
  User 
} from '../types/auth';

const TOKEN_STORAGE_KEY = 'accessToken';
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';
const USER_STORAGE_KEY = 'user';

export class AuthService {
  private static instance: AuthService;
  private refreshTokenPromise: Promise<string> | null = null;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  constructor() {
    // Set this instance in the API config to avoid circular imports
    setAuthService(this);
  }

  // Token management
  public getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  public getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  public setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  }

  public clearTokens(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  // User management
  public getUser(): User | null {
    const userStr = localStorage.getItem(USER_STORAGE_KEY);
    return userStr ? JSON.parse(userStr) : null;
  }

  public setUser(user: User): void {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }

  public clearUser(): void {
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  // Token validation
  public isTokenExpired(token: string): boolean {
    if (!token) return true;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch {
      return true;
    }
  }

  public isAccessTokenValid(): boolean {
    const token = this.getAccessToken();
    return token ? !this.isTokenExpired(token) : false;
  }

  // API calls
  public async login(credentials: LoginRequest): Promise<TokenResponse> {
    try {
      const response = await api.post<TokenResponse>('/auth/login', credentials);
      this.setTokens(response.data.access_token, response.data.refresh_token);
      
      // Get user info after successful login
      const userResponse = await api.get<User>('/auth/me', {
        headers: {
          'Authorization': `Bearer ${response.data.access_token}`
        }
      });
      this.setUser(userResponse.data);
      
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  }

  public async register(userData: RegisterRequest): Promise<User> {
    try {
      const response = await api.post<User>('/auth/register', userData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  }

  public async refreshAccessToken(): Promise<string> {
    // Prevent multiple concurrent refresh attempts
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    this.refreshTokenPromise = this.performTokenRefresh(refreshToken);
    
    try {
      const newAccessToken = await this.refreshTokenPromise;
      return newAccessToken;
    } finally {
      this.refreshTokenPromise = null;
    }
  }

  private async performTokenRefresh(refreshToken: string): Promise<string> {
    try {
      const response = await api.post<TokenResponse>('/auth/refresh', {
        refresh_token: refreshToken
      });
      
      this.setTokens(response.data.access_token, response.data.refresh_token);
      return response.data.access_token;
    } catch (error: any) {
      this.clearTokens();
      this.clearUser();
      throw new Error('Token refresh failed');
    }
  }

  public async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refresh_token: refreshToken });
      } catch (error) {
        // Ignore logout errors, still clear local tokens
        console.warn('Logout request failed, clearing tokens anyway');
      }
    }
    
    this.clearTokens();
    this.clearUser();
  }

  public async logoutAll(): Promise<void> {
    try {
      await api.post('/auth/logout-all');
    } catch (error) {
      console.warn('Logout all request failed, clearing tokens anyway');
    }
    
    this.clearTokens();
    this.clearUser();
  }

  public async getCurrentUser(): Promise<User> {
    try {
      const response = await api.get<User>('/auth/me');
      this.setUser(response.data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to get user info');
    }
  }

  public isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const user = this.getUser();
    return !!(token && user && !this.isTokenExpired(token));
  }

  // Auto-refresh token if it's about to expire
  public async ensureValidToken(): Promise<string | null> {
    const accessToken = this.getAccessToken();
    
    if (!accessToken) {
      return null;
    }

    // Check if token is about to expire (within 5 minutes)
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = payload.exp - currentTime;

      // If token expires within 5 minutes, refresh it
      if (timeUntilExpiry < 300) {
        return await this.refreshAccessToken();
      }

      return accessToken;
    } catch {
      // If token is invalid, try to refresh
      return await this.refreshAccessToken();
    }
  }
}

export default AuthService.getInstance(); 