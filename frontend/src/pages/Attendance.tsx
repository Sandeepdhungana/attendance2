import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Switch,
  FormControlLabel,
} from '@mui/material';
import Webcam from 'react-webcam';
import axios from 'axios';

export default function Attendance() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({
    type: null,
    text: '',
  });
  const webcamRef = useRef<Webcam>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamIntervalRef = useRef<number | null>(null);

  // Clean up WebSocket connection on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (streamIntervalRef.current) {
        window.clearInterval(streamIntervalRef.current);
      }
    };
  }, []);

  const startStreaming = useCallback(() => {
    if (!webcamRef.current) return;

    // Create WebSocket connection
    const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws/attendance`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established');
      setIsStreaming(true);
      setMessage({ type: null, text: '' });
    };

    ws.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        
        if (response.error) {
          setMessage({
            type: 'error',
            text: response.error,
          });
        } else {
          setMessage({
            type: 'success',
            text: `${response.message} for ${response.name} (${response.user_id})`,
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setMessage({
        type: 'error',
        text: 'WebSocket connection error',
      });
      setIsStreaming(false);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setIsStreaming(false);
      if (streamIntervalRef.current) {
        window.clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
    };

    // Start sending images at regular intervals
    streamIntervalRef.current = window.setInterval(() => {
      if (webcamRef.current && ws.readyState === WebSocket.OPEN) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          ws.send(JSON.stringify({ image: imageSrc }));
        }
      }
    }, 1000); // Send an image every second
  }, [webcamRef]);

  const stopStreaming = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (streamIntervalRef.current) {
      window.clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    
    setIsStreaming(false);
  }, []);

  const capture = useCallback(async () => {
    if (webcamRef.current) {
      setIsCapturing(true);
      setMessage({ type: null, text: '' });

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

        // Send to backend
        const response = await axios.post('http://localhost:8000/attendance', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        setMessage({
          type: 'success',
          text: `Attendance marked for ${response.data.name} (${response.data.user_id})`,
        });
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Failed to mark attendance',
        });
      } finally {
        setIsCapturing(false);
      }
    }
  }, [webcamRef]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Mark Attendance
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
            {(isCapturing || isStreaming) && (
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

          <Box sx={{ mt: 2, textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              onClick={capture}
              disabled={isCapturing || isStreaming}
              size="large"
            >
              {isCapturing ? 'Processing...' : 'Mark Attendance'}
            </Button>
            
            <FormControlLabel
              control={
                <Switch
                  checked={isStreaming}
                  onChange={(e) => {
                    if (e.target.checked) {
                      startStreaming();
                    } else {
                      stopStreaming();
                    }
                  }}
                  color="primary"
                />
              }
              label="Continuous Mode"
            />
          </Box>

          {message.type && (
            <Alert
              severity={message.type}
              sx={{ mt: 2 }}
              onClose={() => setMessage({ type: null, text: '' })}
            >
              {message.text}
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
} 