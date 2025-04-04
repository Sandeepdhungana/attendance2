import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import Webcam from 'react-webcam';
import api from '../api/config';

export default function Debug() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [threshold, setThreshold] = useState(0.6);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);

  const capture = useCallback(async () => {
    if (webcamRef.current) {
      setIsCapturing(true);
      setError(null);
      setResult(null);

      try {
        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
          throw new Error('Failed to capture image');
        }

        // Convert base64 to blob
        const base64Response = await fetch(imageSrc);
        const blob = await base64Response.blob();

        // Create form data
        const formData = new FormData();
        formData.append('image', blob, 'capture.jpg');
        formData.append('threshold', threshold.toString());

        // Send to backend
        const response = await api.post('/debug/face-recognition', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        setResult(response.data);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to process image');
      } finally {
        setIsCapturing(false);
      }
    }
  }, [webcamRef, threshold]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Face Recognition Debug
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ position: 'relative', width: '100%', maxWidth: 640, mx: 'auto' }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width: 640,
                height: 480,
                facingMode: 'user',
              }}
              style={{ width: '100%', borderRadius: 8 }}
            />
            {isCapturing && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: 8,
                }}
              >
                <CircularProgress color="primary" />
              </Box>
            )}
          </Box>

          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              label="Threshold"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              inputProps={{ step: 0.1 }}
              sx={{ width: 120 }}
            />
            
            <Button
              variant="contained"
              onClick={capture}
              disabled={isCapturing}
              size="large"
            >
              {isCapturing ? 'Processing...' : 'Test Face Recognition'}
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {result && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                Results
              </Typography>
              
              {result.multiple_users && result.users && result.users.length > 0 ? (
                <>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    {result.users.length} user{result.users.length === 1 ? '' : 's'} recognized
                  </Alert>
                  
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>User ID</TableCell>
                          <TableCell>Name</TableCell>
                          <TableCell>Similarity</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {result.users.map((user: any) => (
                          <TableRow key={user.user_id}>
                            <TableCell>{user.user_id}</TableCell>
                            <TableCell>{user.name}</TableCell>
                            <TableCell>{(user.similarity * 100).toFixed(1)}%</TableCell>
                            <TableCell>{user.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              ) : (
                <Alert severity="warning">
                  No users recognized
                </Alert>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
} 