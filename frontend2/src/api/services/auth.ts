import api from '../config';
import { LoginCredentials, RegisterData, AuthResponse, UserProfile } from '../../types/auth';

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  }

  async register(data: RegisterData): Promise<UserProfile> {
    const response = await api.post('/auth/register', data);
    return response.data;
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const response = await api.post('/auth/refresh', { 
      refresh_token: refreshToken 
    });
    return response.data;
  }

  async logout(refreshToken: string): Promise<void> {
    await api.post('/auth/logout', { 
      refresh_token: refreshToken 
    });
  }

  async getCurrentUser(): Promise<UserProfile> {
    const response = await api.get('/auth/me');
    return response.data;
  }

  async forgotPassword(email: string): Promise<{ message: string; expires_in_minutes: number }> {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  }

  async verifyOTP(email: string, otp_code: string): Promise<{ message: string }> {
    const response = await api.post('/auth/verify-otp', { email, otp_code });
    return response.data;
  }

  async resetPassword(email: string, otp_code: string, new_password: string): Promise<{ message: string }> {
    const response = await api.post('/auth/reset-password', { 
      email, 
      otp_code, 
      new_password 
    });
    return response.data;
  }
}

export const authService = new AuthService();
export default authService; 