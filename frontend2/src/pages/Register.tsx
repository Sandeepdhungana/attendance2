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
} from '@mui/material';
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

    if (!employee_id || !name || !department || !position || !shift_id) {
      setError('Please fill in all fields');
      return;
    }

    if (phone && !validatePhone(phone)) {
      setError('Please enter a valid phone number');
      return;
    }

    if (email && !validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!image) {
      setError('Please capture or upload a photo');
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
      formData.append('phone', phone);
      formData.append('email', email);
      formData.append('is_admin', isAdmin.toString());
      formData.append('image', imageFile);

      await api.post('/employees/register', formData, {
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
    } catch (err) {
      setError('Failed to register employee. Please try again.');
      console.error('Registration error:', err);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Register Employee
      </Typography>

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Employee ID"
                value={employee_id}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                required
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone Number"
                value={phone}
                onChange={handlePhoneChange}
                error={!!phoneError}
                helperText={phoneError}
                required
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={handleEmailChange}
                error={!!emailError}
                helperText={emailError}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
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
              <FormControl fullWidth>
                <InputLabel>Admin Access</InputLabel>
                <Select
                  value={isAdmin.toString()}
                  onChange={(e) => setIsAdmin(e.target.value === 'true')}
                  label="Admin Access"
                >
                  <MenuItem value="false">No</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Shift</InputLabel>
                <Select
                  value={shift_id}
                  onChange={(e) => setShiftId(e.target.value)}
                  label="Shift"
                  required
                >
                  {shifts.map((shift) => (
                    <MenuItem key={shift.objectId} value={shift.objectId}>
                      {shift.name} ({shift.login_time} - {shift.logout_time})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <CaptureTypeSelector
                captureType={captureType}
                onChange={handleCaptureTypeChange}
              />
            </Grid>

            {captureType === 'webcam' ? (
              <Grid item xs={12}>
                <CameraView
                  webcamRef={webcamRef}
                  availableCameras={availableCameras}
                  selectedCamera={selectedCamera}
                  onCameraChange={handleCameraChange}
                  onCapture={handleCapture}
                />
              </Grid>
            ) : (
              <Grid item xs={12}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  ref={fileInputRef}
                />
                <Button
                  variant="contained"
                  onClick={() => fileInputRef.current?.click()}
                  fullWidth
                >
                  Upload Photo
                </Button>
              </Grid>
            )}

            <Grid item xs={12}>
              <ImagePreview image={image} />
            </Grid>

            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                disabled={!image}
              >
                Register
              </Button>
            </Grid>
          </Grid>
        </form>

        <Snackbar
          open={!!error}
          autoHideDuration={6000}
          onClose={() => setError(null)}
        >
          <Alert onClose={() => setError(null)} severity="error">
            {error}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!success}
          autoHideDuration={6000}
          onClose={() => setSuccess(null)}
        >
          <Alert onClose={() => setSuccess(null)} severity="success">
            {success}
          </Alert>
        </Snackbar>
      </Paper>
    </Box>
  );
};

export default Register; 