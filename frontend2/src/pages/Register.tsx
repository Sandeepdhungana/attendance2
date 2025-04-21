import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Snackbar,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  alpha,
  useTheme,
  Divider,
  FormHelperText,
  Stack,
  Switch,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';
import { PersonAdd, Save, Badge } from '@mui/icons-material';
import { useWebSocket } from '../App';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { CameraView } from '../components/register/CameraView';
import { ImagePreview } from '../components/register/ImagePreview';
import { CaptureTypeSelector } from '../components/register/CaptureTypeSelector';
import api from '../api/config';

interface Shift {
  objectId: string;
  name: string;
  login_time: string;
  logout_time: string;
}

const Register: React.FC = () => {
  const theme = useTheme();
  const [employee_id, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState('active');
  const [shift_id, setShiftId] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sendMessage } = useWebSocket();

  const {
    image,
    captureType,
    availableCameras,
    selectedCamera,
    webcamRef,
    fileInputRef,
    handleCameraChange,
    handleCaptureTypeChange,
    handleCapture,
    handleFileUpload,
    setImage,
  } = useCameraCapture();

  useEffect(() => {
    fetchShifts();
  }, []);

  // Auto-clear messages after 10 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (error || success) {
      timer = setTimeout(() => {
        if (error) setError(null);
        if (success) setSuccess(null);
      }, 10000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [error, success]);

  const fetchShifts = async () => {
    try {
      const response = await api.get('/shifts');
      setShifts(response.data);
    } catch (error) {
      console.error('Error fetching shifts:', error);
      setError('Failed to load shifts');
    }
  };

  const validateEmail = (email: string) => {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    
    if (value && !validateEmail(value)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  const validatePhone = (phone: string) => {
    const regex = /^[0-9]{10,15}$/;
    return regex.test(phone);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhone(value);
    
    if (value && !validatePhone(value)) {
      setPhoneError('Please enter a valid phone number (10-15 digits only)');
    } else {
      setPhoneError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    if (!employee_id || !name || !department || !position || !shift_id) {
      setError('Please fill in all required fields');
      setIsSubmitting(false);
      return;
    }

    if (phone && !validatePhone(phone)) {
      setError('Please enter a valid phone number');
      setIsSubmitting(false);
      return;
    }

    if (email && !validateEmail(email)) {
      setError('Please enter a valid email address');
      setIsSubmitting(false);
      return;
    }

    if (!image) {
      setError('Please capture or upload a photo');
      setIsSubmitting(false);
      return;
    }

    try {
      // Convert base64 to File object
      let imageFile: File;
      if (typeof image === 'string') {
        // If image is a base64 string
        const base64Data = image.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        
        for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
          const slice = byteCharacters.slice(offset, offset + 1024);
          const byteNumbers = new Array(slice.length);
          
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          
          const byteArray = new Uint8Array(byteNumbers);
          byteArrays.push(byteArray);
        }
        
        const blob = new Blob(byteArrays, { type: 'image/jpeg' });
        imageFile = new File([blob], 'employee_photo.jpg', { type: 'image/jpeg' });
      } else {
        // If image is already a File object
        imageFile = image;
      }

      const formData = new FormData();
      formData.append('employee_id', employee_id);
      formData.append('name', name);
      formData.append('department', department);
      formData.append('position', position);
      formData.append('status', status);
      formData.append('shift_id', shift_id);
      formData.append('phone_number', phone);
      formData.append('email', email);
      formData.append('is_admin', isAdmin.toString());
      formData.append('image', imageFile);

      await api.post('/register', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess('Employee registered successfully!');
      setEmployeeId('');
      setName('');
      setDepartment('');
      setPosition('');
      setStatus('active');
      setShiftId('');
      setPhone('');
      setEmail('');
      setIsAdmin(false);
      setImage(null);
    } catch (err: any) {
      console.error('Registration error:', err);
      
      // Handle axios error response data
      if (err.response && err.response.data) {
        console.log('Error response data:', err.response.data);
        console.log('Error status:', err.response.status);
        
        const errorDetail = err.response.data.detail;
        
        // Check if the error contains face similarity information
        if (typeof errorDetail === 'string' && errorDetail.includes('Face already registered')) {
          setError(errorDetail);
        } else {
          setError(errorDetail || 'Failed to register employee. Please try again.');
        }
      } else {
        setError('Failed to register employee. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <PersonAdd 
          fontSize="large" 
          sx={{ 
            color: theme.palette.primary.main,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            p: 1,
            borderRadius: 2,
            mr: 2
          }} 
        />
        <Typography variant="h4" fontWeight="700" color="text.primary">
          Register Employee
        </Typography>
      </Box>

      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 3,
            borderRadius: 2,
            '& .MuiAlert-icon': {
              alignItems: 'center'
            },
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
          onClose={() => setError(null)}
        >
          <Typography variant="body1" sx={{ fontWeight: 500 }}>{error}</Typography>
        </Alert>
      )}

      {success && (
        <Alert 
          severity="success" 
          sx={{ 
            mb: 3,
            borderRadius: 2,
            '& .MuiAlert-icon': {
              alignItems: 'center'
            },
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}
          onClose={() => setSuccess(null)}
        >
          {success}
        </Alert>
      )}

      <Card 
        sx={{ 
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          mb: 4
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ 
            p: 3, 
            backgroundColor: alpha(theme.palette.primary.main, 0.05),
            borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
          }}>
            <Typography variant="h6" fontWeight="600">
              Employee Information
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter the basic information about the employee
            </Typography>
          </Box>
          
          <form onSubmit={handleSubmit}>
            <Box sx={{ p: 3 }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Employee ID"
                    value={employee_id}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    required
                    variant="outlined"
                    InputProps={{
                      startAdornment: <Badge sx={{ mr: 1, color: theme.palette.text.secondary }} />
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  />
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Position"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    required
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Phone Number"
                    value={phone}
                    onChange={handlePhoneChange}
                    error={!!phoneError}
                    helperText={phoneError}
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Email"
                    value={email}
                    onChange={handleEmailChange}
                    error={!!emailError}
                    helperText={emailError}
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl 
                    fullWidth
                    variant="outlined"
                    required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  >
                    <InputLabel>Shift</InputLabel>
                    <Select
                      value={shift_id}
                      onChange={(e) => setShiftId(e.target.value)}
                      label="Shift"
                    >
                      {shifts.map((shift) => (
                        <MenuItem key={shift.objectId} value={shift.objectId}>
                          {shift.name} ({shift.login_time} - {shift.logout_time})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                  <FormControl 
                    fullWidth
                    variant="outlined"
                    required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                      }
                    }}
                  >
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      label="Status"
                    >
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Inactive</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={isAdmin}
                        onChange={(e) => setIsAdmin(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Typography 
                        variant="body2"
                        sx={{ 
                          fontWeight: isAdmin ? 600 : 400,
                          color: isAdmin ? 'primary.main' : 'text.primary'
                        }}
                      >
                        Administrator Access
                      </Typography>
                    }
                  />
                </Grid>
              </Grid>
            </Box>
            
            <Divider />
            
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight="600" gutterBottom>
                Photo
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Capture or upload a photo of the employee
              </Typography>

              <Paper 
                sx={{ 
                  p: 3, 
                  backgroundColor: alpha(theme.palette.background.default, 0.8),
                  borderRadius: 2,
                  border: `1px solid ${alpha(theme.palette.divider, 0.7)}`
                }}
              >
                <Box sx={{ mb: 3 }}>
                  <CaptureTypeSelector
                    captureType={captureType}
                    onChange={handleCaptureTypeChange}
                  />
                </Box>

                {captureType === 'webcam' ? (
                  <CameraView
                    webcamRef={webcamRef}
                    availableCameras={availableCameras}
                    selectedCamera={selectedCamera}
                    onCameraChange={handleCameraChange}
                    onCapture={handleCapture}
                  />
                ) : (
                  <Box>
                    <Button
                      variant="outlined"
                      component="label"
                      fullWidth
                      sx={{ 
                        p: 1.5, 
                        borderRadius: 2,
                        borderStyle: 'dashed',
                        borderWidth: 2,
                        textTransform: 'none',
                        fontWeight: 600
                      }}
                    >
                      Upload Photo
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                      />
                    </Button>
                  </Box>
                )}

                <ImagePreview image={image} />
              </Paper>
            </Box>

            <Box sx={{ 
              p: 3, 
              backgroundColor: alpha(theme.palette.background.default, 0.6),
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
              display: 'flex', 
              justifyContent: 'flex-end'
            }}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                startIcon={!isSubmitting && <Save />}
                disabled={isSubmitting}
                sx={{ 
                  px: 4, 
                  py: 1.2,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  minWidth: 200,
                  position: 'relative'
                }}
              >
                {isSubmitting ? (
                  <>
                    <CircularProgress 
                      size={20} 
                      color="inherit" 
                      sx={{ 
                        position: 'absolute',
                        left: 24
                      }} 
                    />
                    Registering...
                  </>
                ) : 'Register Employee'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Register; 