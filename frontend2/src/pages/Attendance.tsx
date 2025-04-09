import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItem,
  ListItemText,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import Webcam from 'react-webcam';
import api from '../api/config';
import { Login as LoginIcon, Logout as LogoutIcon, CloudUpload as CloudUploadIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { useWebSocket } from '../App';
import { SelectChangeEvent } from '@mui/material';

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
  status?: string;
  type?: string;
  data?: any;
}

interface AttendanceUpdate {
  user_id: string;
  name: string;
  entry_type: 'entry' | 'exit';
  timestamp: string;
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
  const [recentAttendance, setRecentAttendance] = useState<AttendanceUpdate[]>([]);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [userData, setUserData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const { ws, isConnected, sendMessage } = useWebSocket();
  const streamIntervalRef = useRef<number | null>(null);
  const isStreamingRef = useRef<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Remove WebSocket connection management
  useEffect(() => {
    if (ws) {
      ws.onmessage = (event) => {
        try {
          const data: WebSocketResponse = JSON.parse(event.data);
          
          // Handle different message types
          if (data.type === 'attendance_update') {
            // Process attendance updates
            data.data.forEach((update: {
              action: 'entry' | 'exit' | 'delete';
              user_id: string;
              name: string;
              timestamp: string;
              similarity?: number;
              attendance_id?: number;
            }) => {
              // Convert the action to entry_type format expected by the UI
              const entry_type = update.action === 'delete' ? 'exit' : update.action;
              
              // Create an attendance update object
              const attendanceUpdate: AttendanceUpdate = {
                user_id: update.user_id,
                name: update.name,
                entry_type: entry_type,
                timestamp: update.timestamp
              };
              
              // Add the new attendance to the recent list
              setRecentAttendance(prev => {
                const newList = [attendanceUpdate, ...prev];
                // Keep only the 10 most recent entries
                return newList.slice(0, 10);
              });
              
              // Show a notification
              const localTime = format(new Date(update.timestamp), 'PPpp');
              setMessage({
                type: 'success',
                text: `${update.name} (${update.user_id}) marked ${entry_type} at ${localTime}`,
              });
            });
          } 
          else if (data.type === 'attendance_data') {
            // Update attendance data
            setAttendanceData(data.data || []);
          }
          else if (data.type === 'user_data') {
            // Update user data
            setUserData(data.data || []);
          }
          else if (data.type === 'ping') {
            // Respond to ping with pong
            sendMessage({ type: 'pong' });
          }
          else if (data.multiple_users && data.users) {
            // Handle multiple users
            setMultipleUsers(data.users);
            setFaceCount(data.users.length);
            
            // Create a summary message
            const successCount = data.users.filter((u: UserResult) => 
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
          else if (data.status === 'rate_limited') {
            // Handle rate limiting
            console.log('Rate limited by server, skipping frame');
          }
          else if (data.status === 'no_face_detected') {
            // Handle no face detected
            setFaceCount(0);
          }
          else if (data.status === 'no_matching_users') {
            // Handle no matching users
            setMultipleUsers([]);
            setFaceCount(0);
          }
          else if (data.status === 'error') {
            // Handle error
            setMessage({
              type: 'error',
              text: data.message || 'An error occurred',
            });
          }
          else if (data.status === 'success') {
            // Handle success
            setMessage({
              type: 'success',
              text: data.message || 'Operation successful',
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      // Request initial data
      sendMessage({ type: 'get_attendance' });
      sendMessage({ type: 'get_users' });
    }
  }, [ws, sendMessage]);

  // Update streaming functions to use shared WebSocket
  const startStreaming = useCallback(() => {
    if (webcamRef.current && isConnected) {
      setIsStreaming(true);
      setMessage({ type: null, text: '' });
      setMultipleUsers([]);
      setFaceCount(0);

      // Set up streaming to send one frame per second
      isStreamingRef.current = true;
      
      const sendFrame = () => {
        if (!isStreamingRef.current) return;
        
        if (webcamRef.current && isConnected) {
          const imageSrc = webcamRef.current.getScreenshot();
          if (imageSrc) {
            sendMessage({ 
              image: imageSrc,
              entry_type: entryType 
            });
          }
        }
      };
      
      // Send the first frame immediately
      sendFrame();
      
      // Set up interval to send frames once per second
      streamIntervalRef.current = setInterval(sendFrame, 1000);
    } else {
      setMessage({
        type: 'error',
        text: 'WebSocket connection not available',
      });
    }
  }, [webcamRef, entryType, isConnected, sendMessage]);

  const stopStreaming = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const capture = useCallback(async () => {
    if (webcamRef.current) {
      setIsCapturing(true);
      setError(null);
      setSuccess(false);
      setAttendanceData(null);

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
        const response = await api.post('/attendance', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        setAttendanceData(response.data);
        setSuccess(true);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to mark attendance');
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
    if (videoRef.current && videoFile && isConnected) {
      setIsStreaming(true);
      setMessage({ type: null, text: '' });
      setMultipleUsers([]);
      setFaceCount(0);

      // Set up video streaming
      isStreamingRef.current = true;
      
      const sendFrame = () => {
        if (!isStreamingRef.current) return;
        
        if (videoRef.current && isConnected) {
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
            sendMessage({ 
              image: imageSrc,
              entry_type: entryType 
            });
          }
        }
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
      
      // Send the first frame immediately
      sendFrame();
      
      // Set up interval to send frames every 2 seconds
      streamIntervalRef.current = setInterval(sendFrame, 750);
      
      // Clean up event listener when streaming stops
      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('ended', handleVideoEnd);
        }
      };
    } else {
      setMessage({
        type: 'error',
        text: 'WebSocket connection not available or video not loaded',
      });
    }
  }, [videoFile, entryType, stopStreaming, isConnected, sendMessage]);

  // Add useEffect to enumerate cameras
  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableCameras(videoDevices);
        
        // Set the first camera as default if available
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error('Error enumerating cameras:', error);
        setMessage({
          type: 'error',
          text: 'Failed to access cameras. Please check your camera permissions.',
        });
      }
    };

    getCameras();
  }, []);

  // Add handler for camera selection
  const handleCameraChange = (event: SelectChangeEvent<string>) => {
    setSelectedCamera(event.target.value);
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Face Attendance
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ position: 'relative', mb: 2 }}>
            {!isVideoMode ? (
              <>
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
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{
                    width: 640,
                    height: 480,
                    deviceId: selectedCamera
                  }}
                  style={{ width: '100%', borderRadius: 8 }}
                />
              </>
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

          {/* Streaming status text */}
          {isStreaming && (
            <Typography variant="body2" color="primary" sx={{ mb: 2, textAlign: 'center' }}>
              Streaming in progress...
            </Typography>
          )}

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

          {/* Recent Attendance Updates */}
          {recentAttendance.length > 0 && (
            <Card variant="outlined" sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Attendance Updates
                </Typography>
                <List>
                  {recentAttendance.map((attendance, index) => (
                    <div key={`${attendance.user_id}-${attendance.timestamp}-${index}`}>
                      <ListItem>
                        <ListItemText
                          primary={`${attendance.name} (${attendance.user_id})`}
                          secondary={
                            <>
                              <Typography component="span" variant="body2" color="text.primary">
                                Marked {attendance.entry_type}
                              </Typography>
                              <Typography component="span" variant="body2" color="text.secondary">
                                {' at '}
                                {format(new Date(attendance.timestamp), 'PPpp')}
                              </Typography>
                            </>
                          }
                        />
                      </ListItem>
                      {index < recentAttendance.length - 1 && <Divider />}
                    </div>
                  ))}
                </List>
              </CardContent>
            </Card>
          )}

          {success && attendanceData && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {attendanceData.multiple_users ? (
                `Successfully processed ${attendanceData.users?.length || 0} user${attendanceData.users?.length === 1 ? '' : 's'}`
              ) : (
                `Attendance marked successfully for ${attendanceData.name || 'Unknown User'} (${attendanceData.user_id || 'Unknown ID'})`
              )}
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
} 