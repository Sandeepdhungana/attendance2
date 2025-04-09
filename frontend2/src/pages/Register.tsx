import React, { useState, useRef, useEffect } from 'react';
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
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
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage } = useWebSocket();

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableCameras(videoDevices);
        
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error('Error enumerating cameras:', error);
        setError('Failed to access cameras. Please check your camera permissions.');
      }
    };

    getCameras();
  }, []);

  const handleCameraChange = (event: SelectChangeEvent) => {
    setSelectedCamera(event.target.value);
  };

  const handleCaptureTypeChange = (
    _event: React.MouseEvent<HTMLElement>,
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
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel id="camera-select-label">Select Camera</InputLabel>
                  <Select
                    labelId="camera-select-label"
                    value={selectedCamera}
                    label="Select Camera"
                    onChange={handleCameraChange}
                  >
                    {availableCameras.map((camera) => (
                      <MenuItem key={camera.deviceId} value={camera.deviceId}>
                        {camera.label || `Camera ${camera.deviceId}`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ mb: 2 }}>
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width="100%"
                    videoConstraints={{
                      width: 640,
                      height: 480,
                      deviceId: selectedCamera
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