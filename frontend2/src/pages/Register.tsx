import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Snackbar,
  Alert,
} from '@mui/material';
import { useWebSocket } from '../App';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { CameraView } from '../components/register/CameraView';
import { ImagePreview } from '../components/register/ImagePreview';
import { CaptureTypeSelector } from '../components/register/CaptureTypeSelector';

const Register: React.FC = () => {
  const [user_id, setUserId] = useState('');
  const [name, setName] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user_id || !name) {
      setError('Please fill in all fields');
      return;
    }

    if (!image) {
      setError('Please capture or upload a photo');
      return;
    }

    try {
      sendMessage({
        type: 'register_user',
        user_id,
        name,
        image
      });

      setSuccess('User registered successfully!');
      setUserId('');
      setName('');
      setImage(null);
    } catch (err) {
      setError('Failed to register user. Please try again.');
      console.error('Registration error:', err);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Register User
      </Typography>

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="User ID"
                value={user_id}
                onChange={(e) => setUserId(e.target.value)}
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