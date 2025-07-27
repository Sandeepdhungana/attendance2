import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  useTheme,
  alpha,
  Container,
  Paper,
} from '@mui/material';
import {
  Email as EmailIcon,
  Security as SecurityIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  ArrowBack,
  CheckCircle,
} from '@mui/icons-material';
import { useNavigate, Link } from 'react-router-dom';
import { useNotification } from '../components/ui/NotificationProvider';
import authService from '../api/services/auth';

interface ForgotPasswordData {
  email: string;
  otpCode: string;
  newPassword: string;
  confirmPassword: string;
}

const steps = ['Enter Email', 'Verify OTP', 'Reset Password'];

export default function ForgotPassword() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [expiresInMinutes, setExpiresInMinutes] = useState(15);
  const [formData, setFormData] = useState<ForgotPasswordData>({
    email: '',
    otpCode: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Partial<ForgotPasswordData>>({});

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): boolean => {
    return password.length >= 6;
  };

  const handleInputChange = (field: keyof ForgotPasswordData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSendOTP = async () => {
    if (!validateEmail(formData.email)) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const response = await authService.forgotPassword(formData.email);
      setExpiresInMinutes(response.expires_in_minutes);
      setActiveStep(1);
      showNotification({
        message: response.message,
        type: 'success',
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to send OTP. Please try again.';
      setErrors({ email: errorMessage });
      showNotification({
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!formData.otpCode || formData.otpCode.length !== 6) {
      setErrors({ otpCode: 'Please enter a valid 6-digit OTP' });
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      await authService.verifyOTP(formData.email, formData.otpCode);
      setActiveStep(2);
      showNotification({
        message: 'OTP verified successfully',
        type: 'success',
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Invalid or expired OTP';
      setErrors({ otpCode: errorMessage });
      showNotification({
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const newErrors: Partial<ForgotPasswordData> = {};

    if (!validatePassword(formData.newPassword)) {
      newErrors.newPassword = 'Password must be at least 6 characters long';
    }

    if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const response = await authService.resetPassword(
        formData.email,
        formData.otpCode,
        formData.newPassword
      );
      
      showNotification({
        message: response.message,
        type: 'success',
        duration: 6000,
      });

      // Redirect to login after a short delay
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to reset password. Please try again.';
      showNotification({
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
      setErrors({});
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box sx={{ textAlign: 'center' }}>
            <EmailIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Enter Your Email Address
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              We'll send you a 6-digit OTP to reset your password
            </Typography>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={handleInputChange('email')}
              error={!!errors.email}
              helperText={errors.email}
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleSendOTP}
              disabled={loading}
              sx={{ py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Send OTP'}
            </Button>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ textAlign: 'center' }}>
            <SecurityIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Enter OTP Code
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Enter the 6-digit code sent to {formData.email}
              <br />
              <small>Code expires in {expiresInMinutes} minutes</small>
            </Typography>
            <TextField
              fullWidth
              label="OTP Code"
              value={formData.otpCode}
              onChange={handleInputChange('otpCode')}
              error={!!errors.otpCode}
              helperText={errors.otpCode}
              inputProps={{ maxLength: 6, style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' } }}
              sx={{ mb: 3 }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={handleBack}
                sx={{ flex: 1 }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                onClick={handleVerifyOTP}
                disabled={loading}
                sx={{ flex: 1 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify OTP'}
              </Button>
            </Box>
          </Box>
        );

      case 2:
        return (
          <Box sx={{ textAlign: 'center' }}>
            <LockIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Set New Password
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create a strong password for your account
            </Typography>
            <TextField
              fullWidth
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={handleInputChange('newPassword')}
              error={!!errors.newPassword}
              helperText={errors.newPassword}
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Confirm New Password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={handleInputChange('confirmPassword')}
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword}
              sx={{ mb: 3 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={handleBack}
                sx={{ flex: 1 }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                onClick={handleResetPassword}
                disabled={loading}
                sx={{ flex: 1 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Reset Password'}
              </Button>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper
        elevation={8}
        sx={{
          p: 4,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Reset Password
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Follow the steps below to reset your password
          </Typography>
        </Box>

        {/* Stepper */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step Content */}
        <Card elevation={2} sx={{ mb: 3 }}>
          <CardContent sx={{ p: 4 }}>
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Back to Login */}
        <Box sx={{ textAlign: 'center' }}>
          <Button
            component={Link}
            to="/login"
            startIcon={<ArrowBack />}
            color="inherit"
            sx={{ textTransform: 'none' }}
          >
            Back to Login
          </Button>
        </Box>
      </Paper>
    </Container>
  );
} 