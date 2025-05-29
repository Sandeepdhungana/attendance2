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
  IconButton,
  Avatar,
} from '@mui/material';
import { 
  PersonAdd, 
  Save, 
  Badge, 
  ArrowBack, 
  PhotoCamera, 
  AccountCircle 
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
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

interface Employee {
  objectId: string;
  employee_id: string;
  name: string;
  department: string;
  position: string;
  status: string;
  shift?: {
    objectId: string;
    name: string;
    login_time: string;
    logout_time: string;
  };
  email?: string;
  phone_number?: string;
  created_at: string;
  updated_at: string;
}

const ProfileUpdate: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { employee_id } = useParams<{ employee_id: string }>();
  
  // Form states
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState('active');
  const [shift_id, setShiftId] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  
  // Component states
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [updatePhoto, setUpdatePhoto] = useState(false);
  
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
    if (employee_id) {
      fetchEmployee();
    }
    fetchShifts();
  }, [employee_id]);

  // Auto-clear messages after 10 seconds
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
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

  const fetchEmployee = async () => {
    if (!employee_id) return;
    
    try {
      const response = await api.get(`/employees/${employee_id}`);
      const employeeData = response.data;
      setEmployee(employeeData);
      
      // Populate form fields
      setName(employeeData.name || '');
      setDepartment(employeeData.department || '');
      setPosition(employeeData.position || '');
      setStatus(employeeData.status || 'active');
      setEmail(employeeData.email || '');
      setPhone(employeeData.phone_number || '');
      setShiftId(employeeData.shift?.objectId || '');
      
    } catch (error) {
      console.error('Error fetching employee:', error);
      setError('Failed to load employee data');
    } finally {
      setIsLoading(false);
    }
  };

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

    if (!name || !department || !position || !shift_id) {
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

    if (updatePhoto && !image) {
      setError('Please capture or upload a photo');
      setIsSubmitting(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('department', department);
      formData.append('position', position);
      formData.append('status', status);
      formData.append('shift_id', shift_id);
      formData.append('phone_number', phone);
      formData.append('email', email);

      // Only add image if updating photo
      if (updatePhoto && image) {
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
        
        formData.append('image', imageFile);
      }

      const response = await api.put(`/employees/${employee_id}/profile`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess('Employee profile updated successfully!');
      
      // Refresh employee data
      await fetchEmployee();
      
      // Reset photo update state
      if (updatePhoto) {
        setUpdatePhoto(false);
        setImage(null);
      }

    } catch (error: any) {
      console.error('Error updating employee:', error);
      if (error.response?.data?.detail) {
        setError(error.response.data.detail);
      } else {
        setError('Failed to update employee profile');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const handlePhotoUpdateToggle = () => {
    setUpdatePhoto(!updatePhoto);
    if (updatePhoto) {
      setImage(null);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh' 
      }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!employee) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Alert severity="error">
          Employee not found
        </Alert>
        <Button 
          startIcon={<ArrowBack />} 
          onClick={handleBack} 
          sx={{ mt: 2 }}
        >
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: alpha(theme.palette.background.default, 0.3)
    }}>
      {/* Main Content */}
      <Box sx={{ 
        flex: 1,
        p: { xs: 2, sm: 3, md: 4 },
        maxWidth: '1200px'
      }}>
        {/* Header */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          mb: 4,
          p: 3,
          backgroundColor: 'background.paper',
          borderRadius: 3,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
        }}>
          <IconButton 
            onClick={handleBack} 
            sx={{ 
              mr: 2,
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.2),
              }
            }}
          >
            <ArrowBack color="primary" />
          </IconButton>
          <Box sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            mr: 3
          }}>
            <AccountCircle 
              fontSize="large" 
              sx={{ 
                color: theme.palette.primary.main,
                fontSize: '2.5rem'
              }} 
            />
          </Box>
          <Box>
            <Typography variant="h4" fontWeight="700" color="text.primary" sx={{ mb: 0.5 }}>
              Update Employee Profile
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Badge color="primary" sx={{ fontSize: '1rem' }} />
              <Typography variant="body1" color="text.secondary" fontWeight="500">
                Employee ID: {employee.employee_id}
              </Typography>
            </Box>
          </Box>
        </Box>

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Photo Section */}
            <Grid item xs={12} lg={4}>
              <Card sx={{ 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                height: 'fit-content',
                position: 'sticky',
                top: 20
              }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight="600" color="text.primary">
                      Profile Photo
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={updatePhoto}
                          onChange={handlePhotoUpdateToggle}
                          color="primary"
                        />
                      }
                      label="Update Photo"
                      sx={{ m: 0 }}
                    />
                  </Box>
                  
                  {!updatePhoto && (
                    <Box sx={{ 
                      textAlign: 'center', 
                      p: 4, 
                      backgroundColor: alpha(theme.palette.background.default, 0.8),
                      borderRadius: 2,
                      border: `2px dashed ${alpha(theme.palette.divider, 0.3)}`
                    }}>
                      <Avatar 
                        sx={{ 
                          width: 120, 
                          height: 120, 
                          mx: 'auto', 
                          mb: 2,
                          backgroundColor: alpha(theme.palette.primary.main, 0.1),
                          border: `3px solid ${alpha(theme.palette.primary.main, 0.2)}`
                        }}
                      >
                        <PersonAdd sx={{ fontSize: 60, color: theme.palette.primary.main }} />
                      </Avatar>
                      <Typography variant="body2" color="text.secondary" fontWeight="500">
                        Current photo will be kept unchanged
                      </Typography>
                    </Box>
                  )}
                  
                  {updatePhoto && (
                    <>
                      <CaptureTypeSelector
                        captureType={captureType}
                        onChange={handleCaptureTypeChange}
                      />
                      
                      <Box sx={{ mt: 3 }}>
                        {captureType === 'webcam' ? (
                          <CameraView
                            availableCameras={availableCameras}
                            selectedCamera={selectedCamera}
                            webcamRef={webcamRef}
                            onCameraChange={handleCameraChange}
                            onCapture={handleCapture}
                          />
                        ) : (
                          <Box sx={{ 
                            textAlign: 'center', 
                            p: 4,
                            border: `2px dashed ${alpha(theme.palette.primary.main, 0.3)}`,
                            borderRadius: 2,
                            backgroundColor: alpha(theme.palette.primary.main, 0.02)
                          }}>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleFileUpload}
                              style={{ display: 'none' }}
                            />
                            <PhotoCamera 
                              sx={{ 
                                fontSize: 48, 
                                color: theme.palette.primary.main, 
                                mb: 2 
                              }} 
                            />
                            <Button
                              variant="contained"
                              onClick={() => fileInputRef.current?.click()}
                              startIcon={<PhotoCamera />}
                              size="large"
                              sx={{ 
                                mb: 2,
                                borderRadius: 2,
                                px: 3
                              }}
                            >
                              Choose Photo
                            </Button>
                            <Typography variant="body2" color="text.secondary" fontWeight="500">
                              Select a clear photo showing your face
                            </Typography>
                          </Box>
                        )}
                        
                        {image && (
                          <Box sx={{ mt: 3 }}>
                            <ImagePreview image={image} />
                            <Button
                              variant="outlined"
                              color="error"
                              onClick={() => setImage(null)}
                              size="small"
                              fullWidth
                              sx={{ mt: 2, borderRadius: 2 }}
                            >
                              Clear Photo
                            </Button>
                          </Box>
                        )}
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Employee Information */}
            <Grid item xs={12} lg={8}>
              <Card sx={{ 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
              }}>
                <CardContent sx={{ p: 4 }}>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    mb: 4,
                    pb: 2,
                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
                  }}>
                    <PersonAdd 
                      sx={{ 
                        fontSize: '1.5rem', 
                        color: theme.palette.primary.main,
                        mr: 2 
                      }} 
                    />
                    <Typography variant="h5" fontWeight="600" color="text.primary">
                      Employee Information
                    </Typography>
                  </Box>
                  
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Employee ID"
                        value={employee.employee_id}
                        disabled
                        variant="outlined"
                        sx={{
                          '& .MuiInputBase-input.Mui-disabled': {
                            WebkitTextFillColor: theme.palette.text.secondary,
                          },
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Full Name *"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        variant="outlined"
                        required
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
                        label="Department *"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        variant="outlined"
                        required
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
                        label="Position *"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        variant="outlined"
                        required
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth variant="outlined" required>
                        <InputLabel>Status</InputLabel>
                        <Select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          label="Status"
                          sx={{
                            borderRadius: 2,
                          }}
                        >
                          <MenuItem value="active">Active</MenuItem>
                          <MenuItem value="inactive">Inactive</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth variant="outlined" required>
                        <InputLabel>Shift *</InputLabel>
                        <Select
                          value={shift_id}
                          onChange={(e) => setShiftId(e.target.value)}
                          label="Shift *"
                          sx={{
                            borderRadius: 2,
                          }}
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
                      <TextField
                        fullWidth
                        label="Phone Number"
                        value={phone}
                        onChange={handlePhoneChange}
                        variant="outlined"
                        error={!!phoneError}
                        helperText={phoneError}
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
                        label="Email Address"
                        value={email}
                        onChange={handleEmailChange}
                        variant="outlined"
                        type="email"
                        error={!!emailError}
                        helperText={emailError}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                          }
                        }}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Submit Button Section */}
            <Grid item xs={12}>
              <Card sx={{ 
                borderRadius: 3, 
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                backgroundColor: alpha(theme.palette.background.paper, 0.8)
              }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <Button
                      variant="outlined"
                      onClick={handleBack}
                      size="large"
                      sx={{ 
                        borderRadius: 2,
                        px: 4,
                        fontWeight: 600
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={isSubmitting}
                      startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <Save />}
                      size="large"
                      sx={{ 
                        minWidth: 180,
                        borderRadius: 2,
                        px: 4,
                        fontWeight: 600,
                        boxShadow: '0 4px 12px rgba(25, 118, 210, 0.25)'
                      }}
                    >
                      {isSubmitting ? 'Updating...' : 'Update Profile'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </form>
      </Box>

      {/* Success/Error Snackbars */}
      <Snackbar
        open={!!success}
        autoHideDuration={10000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSuccess(null)} 
          severity="success"
          variant="filled"
          sx={{ borderRadius: 2 }}
        >
          {success}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={10000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setError(null)} 
          severity="error"
          variant="filled"
          sx={{ borderRadius: 2 }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ProfileUpdate; 