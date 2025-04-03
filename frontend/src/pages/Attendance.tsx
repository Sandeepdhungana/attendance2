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
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import Webcam from 'react-webcam';
import axios from 'axios';
import { Login as LoginIcon, Logout as LogoutIcon, CloudUpload as CloudUploadIcon } from '@mui/icons-material';
import { format } from 'date-fns';

interface UserResult {
  message: string;
  user_id: string;
  name: string;
  timestamp?: string;
  similarity: number;
}

interface WebSocketResponse {
  multiple_users?: boolean;
  users?: UserResult[];
  error?: string;
  message?: string;
  user_id?: string;
  name?: string;
  timestamp?: string;
}

export default function Attendance() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [entryType, setEntryType] = useState<'entry' | 'exit'>('entry');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({
    type: null,
    text: '',
  });
  const [multipleUsers, setMultipleUsers] = useState<UserResult[]>([]);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>('');
  const [isVideoMode, setIsVideoMode] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamIntervalRef = useRef<number | object | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Clean up WebSocket connection on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      isStreamingRef.current = false;
    };
  }, []);

  const startStreaming = useCallback(() => {
    if (webcamRef.current) {
      setIsStreaming(true);
      setMessage({ type: null, text: '' });
      setMultipleUsers([]);
      setFaceCount(0);

      // Create WebSocket connection
      const ws = new WebSocket('ws://localhost:8000/ws/attendance');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connection established');
      };

      ws.onmessage = (event) => {
        const data: WebSocketResponse = JSON.parse(event.data);
        
        if (data.error) {
          setMessage({
            type: 'error',
            text: data.error,
          });
          setMultipleUsers([]);
          setFaceCount(0);
        } else if (data.multiple_users && data.users) {
          // Handle multiple users
          setMultipleUsers(data.users);
          setFaceCount(data.users.length);
          
          // Create a summary message
          const successCount = data.users.filter(u => 
            u.message.includes('successfully') || 
            u.message.includes('already marked')
          ).length;
          
          if (successCount > 0) {
            setMessage({
              type: 'success',
              text: `Successfully processed ${successCount} user${successCount > 1 ? 's' : ''}`,
            });
          } else {
            setMessage({
              type: 'error',
              text: 'No users were processed successfully',
            });
          }
        } else {
          // Handle single user (legacy format)
          let messageText = `${data.message}: ${data.name} (${data.user_id})`;
          if (data.timestamp) {
            const localTime = format(new Date(data.timestamp), 'PPpp');
            messageText += ` at ${localTime}`;
          }

          setMessage({
            type: 'success',
            text: messageText,
          });
          setMultipleUsers([]);
          setFaceCount(1);
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
        isStreamingRef.current = false;
      };

      // Set up continuous streaming using requestAnimationFrame
      isStreamingRef.current = true;
      
      const streamFrame = () => {
        if (!isStreamingRef.current) return;
        
        if (webcamRef.current && ws.readyState === WebSocket.OPEN) {
          const imageSrc = webcamRef.current.getScreenshot();
          if (imageSrc) {
            ws.send(JSON.stringify({ 
              image: imageSrc,
              entry_type: entryType 
            }));
          }
        }
        
        // Request the next frame
        animationFrameRef.current = requestAnimationFrame(streamFrame);
      };
      
      // Start the streaming loop
      animationFrameRef.current = requestAnimationFrame(streamFrame);
    }
  }, [webcamRef, entryType]);

  const stopStreaming = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const capture = useCallback(async () => {
    if (webcamRef.current) {
      setIsCapturing(true);
      setMessage({ type: null, text: '' });
      setMultipleUsers([]);
      setFaceCount(0);

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

        const data = response.data;
        
        if (data.multiple_users && data.users) {
          // Handle multiple users
          setMultipleUsers(data.users);
          setFaceCount(data.users.length);
          
          // Create a summary message
          const successCount = data.users.filter(u => 
            u.message.includes('successfully') || 
            u.message.includes('already marked')
          ).length;
          
          if (successCount > 0) {
            setMessage({
              type: 'success',
              text: `Successfully processed ${successCount} user${successCount > 1 ? 's' : ''}`,
            });
          } else {
            setMessage({
              type: 'error',
              text: 'No users were processed successfully',
            });
          }
        } else {
          // Handle single user (legacy format)
          let messageText = `${data.message}: ${data.name} (${data.user_id})`;
          if (data.timestamp) {
            const localTime = format(new Date(data.timestamp), 'PPpp');
            messageText += ` at ${localTime}`;
          }

          setMessage({
            type: 'success',
            text: messageText,
          });
          setFaceCount(1);
        }
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

  const handleVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
      setIsVideoMode(true);
    }
  };

  const startVideoStream = useCallback(() => {
    if (videoRef.current && videoFile) {
      setIsStreaming(true);
      setMessage({ type: null, text: '' });
      setMultipleUsers([]);
      setFaceCount(0);

      // Create WebSocket connection
      const ws = new WebSocket('ws://localhost:8000/ws/attendance');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connection established');
      };

      ws.onmessage = (event) => {
        const data: WebSocketResponse = JSON.parse(event.data);
        
        if (data.error) {
          setMessage({
            type: 'error',
            text: data.error,
          });
          setMultipleUsers([]);
          setFaceCount(0);
        } else if (data.multiple_users && data.users) {
          setMultipleUsers(data.users);
          setFaceCount(data.users.length);
          
          const successCount = data.users.filter(u => 
            u.message.includes('successfully') || 
            u.message.includes('already marked')
          ).length;
          
          if (successCount > 0) {
            setMessage({
              type: 'success',
              text: `Successfully processed ${successCount} user${successCount > 1 ? 's' : ''}`,
            });
          } else {
            setMessage({
              type: 'error',
              text: 'No users were processed successfully',
            });
          }
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
        isStreamingRef.current = false;
      };

      // Set up video streaming
      isStreamingRef.current = true;
      
      const streamFrame = () => {
        if (!isStreamingRef.current) return;
        
        if (videoRef.current && ws.readyState === WebSocket.OPEN) {
          // Check if video has ended
          if (videoRef.current.ended) {
            stopStreaming();
            return;
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            const imageSrc = canvas.toDataURL('image/jpeg');
            ws.send(JSON.stringify({ 
              image: imageSrc,
              entry_type: entryType 
            }));
          }
        }
        
        animationFrameRef.current = requestAnimationFrame(streamFrame);
      };
      
      // Add event listener for video end
      const handleVideoEnd = () => {
        stopStreaming();
      };
      
      videoRef.current.addEventListener('ended', handleVideoEnd);
      
      // Start the video and streaming
      if (videoRef.current) {
        videoRef.current.currentTime = 0; // Reset to beginning
        videoRef.current.play();
      }
      
      animationFrameRef.current = requestAnimationFrame(streamFrame);
      
      // Clean up event listener when streaming stops
      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('ended', handleVideoEnd);
        }
      };
    }
  }, [videoFile, entryType, stopStreaming]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Face Attendance
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ position: 'relative', mb: 2 }}>
            {!isVideoMode ? (
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
            ) : (
              <video
                ref={videoRef}
                src={videoPreview}
                style={{ width: '100%', borderRadius: 8 }}
                controls
                autoPlay
                muted
              />
            )}
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
            
            {/* Face count indicator */}
            <Box
              sx={{
                position: 'absolute',
                top: 10,
                right: 10,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                borderRadius: '50%',
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '1.2rem',
                zIndex: 10,
              }}
            >
              {faceCount}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
            <ToggleButtonGroup
              value={entryType}
              exclusive
              onChange={handleEntryTypeChange}
              aria-label="entry type"
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
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2 }}>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoChange}
              style={{ display: 'none' }}
              id="video-upload"
            />
            <label htmlFor="video-upload">
              <Button
                variant="outlined"
                component="span"
                startIcon={<CloudUploadIcon />}
              >
                Upload Video
              </Button>
            </label>
            <Button
              variant="contained"
              color={entryType === 'entry' ? 'primary' : 'secondary'}
              onClick={isVideoMode ? startVideoStream : capture}
              disabled={isCapturing || isStreaming || (!isVideoMode && !webcamRef.current) || (isVideoMode && !videoFile)}
              startIcon={entryType === 'entry' ? <LoginIcon /> : <LogoutIcon />}
            >
              {isCapturing ? 'Processing...' : `Capture ${entryType === 'entry' ? 'Entry' : 'Exit'}`}
            </Button>
            {!isVideoMode && (
              <Button
                variant="outlined"
                onClick={isStreaming ? stopStreaming : startStreaming}
                color={isStreaming ? 'error' : 'primary'}
              >
                {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
              </Button>
            )}
          </Box>

          {message.type && (
            <Alert severity={message.type} sx={{ mb: 2 }}>
              {message.text}
            </Alert>
          )}

          {multipleUsers.length > 0 && (
            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Detected Users ({multipleUsers.length})
                </Typography>
                <List>
                  {multipleUsers.map((user, index) => (
                    <div key={`${user.user_id}-${index}`}>
                      <ListItem>
                        <ListItemText
                          primary={`${user.name} (${user.user_id})`}
                          secondary={
                            <>
                              <Typography component="span" variant="body2" color="text.primary">
                                {user.message}
                              </Typography>
                              {user.timestamp && (
                                <Typography component="span" variant="body2" color="text.secondary">
                                  {' at '}
                                  {format(new Date(user.timestamp), 'PPpp')}
                                </Typography>
                              )}
                              <Typography component="span" variant="body2" color="text.secondary">
                                {' • Confidence: '}
                                {(user.similarity * 100).toFixed(1)}%
                              </Typography>
                            </>
                          }
                        />
                      </ListItem>
                      {index < multipleUsers.length - 1 && <Divider />}
                    </div>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </Box>
  );
} 