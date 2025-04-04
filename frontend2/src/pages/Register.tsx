import React, { useState, useRef } from 'react';
import { Box, Button, TextField, Typography, Paper, Alert, Snackbar, Tabs, Tab } from '@mui/material';
import { useWebSocket } from '../App';
import Webcam from 'react-webcam';

const Register: React.FC = () => {
  const { sendMessage } = useWebSocket();
  const [user_id, setUserId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const webcamRef = useRef<Webcam>(null);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setCapturedImage(null);
    setSelectedFile(null);
  };

  const capture = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setCapturedImage(imageSrc);
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      
      // Create a preview URL for the image
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setCapturedImage(e.target.result as string);
        }
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

    if (!capturedImage) {
      setError('Please capture or upload a photo');
      return;
    }

    try {
      sendMessage({
        type: 'register_user',
        user_id,
        name,
        image: capturedImage
      });

      setSuccess('User registered successfully!');
      setUserId('');
      setName('');
      setCapturedImage(null);
      setSelectedFile(null);
    } catch (err) {
      setError('Failed to register user. Please try again.');
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Register New User
        </Typography>

        <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Camera" />
          <Tab label="Upload Photo" />
        </Tabs>

        {activeTab === 0 && (
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
            <Button
              variant="contained"
              onClick={capture}
              fullWidth
              sx={{ mt: 1 }}
            >
              Capture Photo
            </Button>
          </Box>
        )}

        {activeTab === 1 && (
          <Box sx={{ mb: 2 }}>
            <input
              accept="image/*"
              style={{ display: 'none' }}
              id="photo-upload"
              type="file"
              onChange={handleFileChange}
            />
            <label htmlFor="photo-upload">
              <Button variant="contained" component="span" fullWidth>
                Upload Photo
              </Button>
            </label>
          </Box>
        )}

        {capturedImage && (
          <Box sx={{ mb: 2, textAlign: 'center' }}>
            <Typography variant="subtitle1" gutterBottom>
              Preview
            </Typography>
            <img
              src={capturedImage}
              alt="Captured"
              style={{ maxWidth: '100%', maxHeight: 200 }}
            />
          </Box>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            label="User ID"
            value={user_id}
            onChange={(e) => setUserId(e.target.value)}
            fullWidth
            margin="normal"
            required
          />
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            margin="normal"
            required
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 2 }}
            disabled={!capturedImage}
          >
            Register
          </Button>
        </form>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

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