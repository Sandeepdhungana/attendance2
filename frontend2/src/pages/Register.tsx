import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Snackbar,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useWebSocket } from '../App';
import Webcam from 'react-webcam';

const Register: React.FC = () => {
  const [user_id, setUserId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<'webcam' | 'upload'>('webcam');
  const [isCapturing, setIsCapturing] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage } = useWebSocket();

  const handleCaptureTypeChange = (
    event: React.MouseEvent<HTMLElement>,
    newCaptureType: 'webcam' | 'upload'
  ) => {
    if (newCaptureType !== null) {
      setCaptureType(newCaptureType);
      setImage(null);
    }
  };

  const handleCapture = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setImage(imageSrc);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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
    <Box sx={{ p: 3 }}>
      <Paper elevation={3} sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          Register New User
        </Typography>
        
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
              <ToggleButtonGroup
                value={captureType}
                exclusive
                onChange={handleCaptureTypeChange}
                fullWidth
              >
                <ToggleButton value="webcam">Use Webcam</ToggleButton>
                <ToggleButton value="upload">Upload Photo</ToggleButton>
              </ToggleButtonGroup>
            </Grid>

            {captureType === 'webcam' ? (
              <Grid item xs={12}>
                <Box sx={{ mb: 2 }}>
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width="100%"
                    videoConstraints={{
                      facingMode: 'user'
                    }}
                  />
                </Box>
                <Button
                  variant="contained"
                  onClick={handleCapture}
                  fullWidth
                >
                  Capture Photo
                </Button>
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

            {image && (
              <Grid item xs={12}>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Preview:
                  </Typography>
                  <img
                    src={image}
                    alt="Captured"
                    style={{ maxWidth: '100%', maxHeight: 300 }}
                  />
                </Box>
              </Grid>
            )}

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
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!success}
          autoHideDuration={6000}
          onClose={() => setSuccess(null)}
        >
          <Alert severity="success" onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        </Snackbar>
      </Paper>
    </Box>
  );
};

export default Register; 