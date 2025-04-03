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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Login as LoginIcon, Logout as LogoutIcon } from '@mui/icons-material';
import { format } from 'date-fns';

export default function Attendance() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [entryType, setEntryType] = useState<'entry' | 'exit'>('entry');
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
    if (webcamRef.current) {
      setIsStreaming(true);
      setMessage({ type: null, text: '' });

      // Create WebSocket connection
      const ws = new WebSocket('ws://localhost:8000/ws/attendance');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connection established');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) {
          setMessage({
            type: 'error',
            text: data.error,
          });
        } else {
          // Format the timestamp in local time zone if it exists in the response
          let messageText = `${data.message}: ${data.name} (${data.user_id})`;
          if (data.timestamp) {
            const localTime = format(new Date(data.timestamp), 'PPpp');
            messageText += ` at ${localTime}`;
          }

          setMessage({
            type: 'success',
            text: messageText,
          });
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setMessage({
          type: 'error',
          text: 'WebSocket connection error',
        });
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        setIsStreaming(false);
      };

      // Set up interval to send images
      const interval = window.setInterval(() => {
        if (webcamRef.current && ws.readyState === WebSocket.OPEN) {
          const imageSrc = webcamRef.current.getScreenshot();
          if (imageSrc) {
            ws.send(JSON.stringify({ 
              image: imageSrc,
              entry_type: entryType 
            }));
          }
        }
      }, 1000); // Send image every second

      streamIntervalRef.current = interval;
    }
  }, [webcamRef, entryType]);

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
        formData.append('entry_type', entryType);

        // Send to backend
        const response = await axios.post('/api/attendance', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        // Format the timestamp in local time zone if it exists in the response
        let messageText = `${response.data.message}: ${response.data.name} (${response.data.user_id})`;
        if (response.data.timestamp) {
          const localTime = format(new Date(response.data.timestamp), 'PPpp');
          messageText += ` at ${localTime}`;
        }

        setMessage({
          type: 'success',
          text: messageText,
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
  }, [webcamRef, entryType]);

  const handleEntryTypeChange = (
    event: React.MouseEvent<HTMLElement>,
    newEntryType: 'entry' | 'exit' | null,
  ) => {
    if (newEntryType !== null) {
      setEntryType(newEntryType);
    }
  };

  const handleWebSocketMessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    if (data.error) {
      setMessage({
        type: 'error',
        text: data.error,
      });
    } else {
      // Format the timestamp in local time zone if it exists in the response
      let messageText = `${data.message}: ${data.name} (${data.user_id})`;
      if (data.timestamp) {
        const localTime = format(new Date(data.timestamp), 'PPpp');
        messageText += ` at ${localTime}`;
      }

      setMessage({
        type: 'success',
        text: messageText,
      });
    }
  };

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

          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <ToggleButtonGroup
              value={entryType}
              exclusive
              onChange={handleEntryTypeChange}
              aria-label="entry type"
              sx={{ mb: 2 }}
            >
              <ToggleButton value="entry" aria-label="entry">
                <LoginIcon sx={{ mr: 1 }} />
                Entry
              </ToggleButton>
              <ToggleButton value="exit" aria-label="exit">
                <LogoutIcon sx={{ mr: 1 }} />
                Exit
              </ToggleButton>
            </ToggleButtonGroup>
            
            <Button
              variant="contained"
              onClick={capture}
              disabled={isCapturing || isStreaming}
              size="large"
              color={entryType === 'entry' ? 'primary' : 'secondary'}
            >
              {isCapturing ? 'Processing...' : `Mark ${entryType === 'entry' ? 'Entry' : 'Exit'}`}
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