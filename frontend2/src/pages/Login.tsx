import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Paper,
  useTheme,
  alpha,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Face as FaceIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { LoginRequest } from '../types/auth';

const Login: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, login, clearError } = useAuth();

  const [formData, setFormData] = useState<LoginRequest>({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  // Redirect if already authenticated
  useEffect(() => {
    if (state.isAuthenticated) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [state.isAuthenticated, navigate, location.state?.from?.pathname]);







  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    // Clear validation error when user starts typing
    if (validationErrors[name as keyof typeof validationErrors]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: undefined,
      }));
    }

    // Don't auto-clear errors - let user manually dismiss them
  };

  const validateForm = (): boolean => {
    const errors: typeof validationErrors = {};

    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // Clear any existing errors before new login attempt
    if (state.error) {
      clearError();
    }

    try {
      await login(formData);
      // Navigation will happen automatically due to useEffect
    } catch (error: any) {
      // Error is handled by the auth context
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  return (
    <Container maxWidth="sm" sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      py: 4
    }}>
      <Paper 
        elevation={24}
        sx={{
          width: '100%',
          borderRadius: 4,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`,
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        }}
      >
        {/* Header */}
        <Box sx={{ 
          p: 4, 
          textAlign: 'center',
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            mb: 2
          }}>
            <Box sx={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: alpha(theme.palette.common.white, 0.2),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 2,
            }}>
              <FaceIcon sx={{ fontSize: 32 }} />
            </Box>
            <Typography variant="h4" fontWeight="bold">
              Face Attendance
            </Typography>
          </Box>
          <Typography variant="body1" sx={{ opacity: 0.9 }}>
            Welcome back! Please sign in to your account
          </Typography>
        </Box>

        {/* Form */}
        <CardContent sx={{ p: 4 }}>
          {/* Error Alert */}
          {state.error && (
            <Alert 
              severity="error"
              sx={{ 
                mb: 3, 
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.error.main, 0.15),
                color: theme.palette.error.dark,
                border: `1px solid ${theme.palette.error.main}`,
                fontWeight: 500,
                '& .MuiAlert-icon': {
                  color: theme.palette.error.main,
                  fontSize: '1.2rem',
                },
                '& .MuiAlert-message': {
                  fontWeight: 500,
                  fontSize: '0.95rem',
                }
              }}
              onClose={clearError}
            >
              {state.error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              error={!!validationErrors.email}
              helperText={validationErrors.email}
              margin="normal"
              variant="outlined"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '&:hover fieldset': {
                    borderColor: theme.palette.primary.main,
                  },
                },
              }}
            />

            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleInputChange}
              error={!!validationErrors.password}
              helperText={validationErrors.password}
              margin="normal"
              variant="outlined"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={handleTogglePasswordVisibility}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '&:hover fieldset': {
                    borderColor: theme.palette.primary.main,
                  },
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={state.isLoading}
              sx={{
                mt: 3,
                mb: 2,
                py: 1.5,
                borderRadius: 2,
                fontSize: '1.1rem',
                fontWeight: 'bold',
                textTransform: 'none',
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
                },
                '&:disabled': {
                  background: alpha(theme.palette.primary.main, 0.5),
                },
              }}
            >
              {state.isLoading ? (
                <>
                  <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
            
            {/* Forgot Password Link */}
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button
                component={Link}
                to="/forgot-password"
                color="primary"
                sx={{ 
                  textTransform: 'none',
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline',
                    backgroundColor: 'transparent',
                  }
                }}
              >
                Forgot your password?
              </Button>
            </Box>
          </Box>
        </CardContent>

        {/* Footer */}
        <Box sx={{ 
          p: 3, 
          textAlign: 'center',
          backgroundColor: alpha(theme.palette.background.default, 0.5),
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}>
          <Typography variant="body2" color="text.secondary">
            Don't have an account? Contact your administrator
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default Login; 