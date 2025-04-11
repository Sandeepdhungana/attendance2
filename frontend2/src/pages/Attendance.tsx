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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  ListItemAvatar,
  Avatar,
  Chip,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Tooltip,
  DialogContentText,
  Paper,
} from '@mui/material';
import Webcam from 'react-webcam';
import api from '../api/config';
import { Login as LoginIcon, Logout as LogoutIcon, CloudUpload as CloudUploadIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import { useWebSocket } from '../App';
import { SelectChangeEvent } from '@mui/material';

interface UserResult {
  message: string;
  user_id: string;
  name: string;
  timestamp?: string;
  similarity?: number;
  is_late?: boolean;
  is_early_exit?: boolean;
  late_message?: string;
  early_exit_message?: string;
  attendance_id?: number;
}

interface WebSocketResponse {
  type?: string;
  status?: string;
  message?: string;
  multiple_users?: boolean;
  users?: UserResult[];
  data?: any[];
}

interface AttendanceUpdate {
  user_id: string;
  name: string;
  entry_type: 'entry' | 'exit';
  timestamp: string;
  is_late?: boolean;
  is_early_exit?: boolean;
  late_message?: string;
  early_exit_message?: string;
  similarity?: number;
  entry_time?: string;
  exit_time?: string;
}

interface EarlyExitReason {
  id: number;
  user_id: string;
  name: string;
  timestamp: string;
  early_exit_message: string;
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
  const [earlyExitReasons, setEarlyExitReasons] = useState<EarlyExitReason[]>([]);
  const [earlyExitDialog, setEarlyExitDialog] = useState<{
    open: boolean;
    reason: EarlyExitReason | null;
  }>({
    open: false,
    reason: null,
  });

  // Add WebSocket reconnection logic
  useEffect(() => {
    if (!ws || !isConnected) {
      // Try to reconnect if connection is lost
      if (!isConnectingRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        isConnectingRef.current = true;
        reconnectAttemptsRef.current++;
        
        // Clear any existing timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // Set a new timeout for reconnection
        reconnectTimeoutRef.current = window.setTimeout(() => {
          isConnectingRef.current = false;
          // The actual reconnection will be handled by the WebSocket context
        }, 2000); // Wait 2 seconds before attempting to reconnect
      }
    } else {
      // Reset reconnection attempts when connected
      reconnectAttemptsRef.current = 0;
      isConnectingRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [ws, isConnected]);

  // Update WebSocket message handler
  useEffect(() => {
    if (!ws) return;

    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data: WebSocketResponse = JSON.parse(event.data);
        // console.log('Received WebSocket message:', data);
        
        // Handle different message types
        if (data.type === 'attendance_update') {
          // Process attendance updates
          if (data.data) {
            data.data.forEach((update: {
              action: 'entry' | 'exit' | 'delete' | 'early_exit_reason';
              user_id: string;
              name: string;
              timestamp: string;
              similarity?: number;
              attendance_id?: number;
              is_late?: boolean;
              is_early_exit?: boolean;
              late_message?: string;
              early_exit_message?: string;
              entry_time?: string;
              exit_time?: string;
            }) => {
              // Convert the action to entry_type format expected by the UI
              const entry_type = update.action === 'delete' ? 'exit' : 
                               update.action === 'early_exit_reason' ? 'exit' : 
                               update.action;
              
              // Create an attendance update object
              const attendanceUpdate: AttendanceUpdate = {
                user_id: update.user_id,
                name: update.name,
                entry_type: entry_type as 'entry' | 'exit',
                timestamp: update.timestamp,
                is_late: update.is_late,
                is_early_exit: update.is_early_exit,
                late_message: update.late_message,
                early_exit_message: update.early_exit_message,
                similarity: update.similarity,
                entry_time: update.entry_time,
                exit_time: update.exit_time
              };
              
              // Update recent attendance with the new update
              setRecentAttendance(prev => {
                const newList = [attendanceUpdate, ...prev];
                return newList.slice(0, 10);
              });
              
              // Format the timestamp
              const localTime = format(new Date(update.timestamp), 'PPpp');
              
              // Create a detailed message
              let messageText = `${update.name} (${update.user_id}) marked ${entry_type} at ${localTime}`;
              if (update.similarity !== undefined) {
                messageText += ` - Confidence: ${(update.similarity * 100).toFixed(1)}%`;
              }
              if (update.entry_time) {
                messageText += ` - Entry: ${format(new Date(update.entry_time), 'HH:mm')}`;
              }
              if (update.exit_time) {
                messageText += ` - Exit: ${format(new Date(update.exit_time), 'HH:mm')}`;
              }
              if (update.is_late && update.late_message) {
                messageText += ` - ${update.late_message}`;
              }
              if (update.is_early_exit && update.early_exit_message) {
                messageText += ` - ${update.early_exit_message}`;
              }
              
              // Update the message state
              setMessage({
                type: 'success',
                text: messageText,
              });

              // Check for early exit
              if (update.action === 'exit' && update.is_early_exit) {
                setEarlyExitDialog({
                  open: true,
                  reason: {
                    id: Number(update.attendance_id) || 0,
                    user_id: update.user_id,
                    name: update.name,
                    timestamp: update.timestamp,
                    early_exit_message: update.early_exit_message || ''
                  },
                });
              }

              // Handle early exit reason updates
              if (update.action === 'early_exit_reason') {
                setEarlyExitReasons(prev => [{
                  id: Number(update.attendance_id) || 0,
                  user_id: update.user_id,
                  name: update.name,
                  timestamp: update.timestamp,
                  early_exit_message: update.early_exit_message || ''
                }, ...prev]);
              }
            });
          }
        } 
        else if (data.multiple_users && data.users) {
          // Update multiple users state
          setMultipleUsers(data.users);
          setFaceCount(data.users.length);
          
          // Process success messages
          const successCount = data.users.filter((u: UserResult) => 
            u.message.includes('successfully') || 
            u.message.includes('already marked')
          ).length;
          
          if (successCount > 0) {
            setMessage({
              type: 'success',
              text: `Successfully processed ${successCount} user${successCount > 1 ? 's' : ''}`,
            });
          }
        }
        else if (data.status === 'no_face_detected') {
          setFaceCount(0);
          setMultipleUsers([]);
          setMessage({
            type: 'error',
            text: 'No face detected in the image',
          });
        }
        else if (data.status === 'no_matching_users') {
          setMultipleUsers([]);
          setFaceCount(0);
          setMessage({
            type: 'error',
            text: 'No matching users found',
          });
        }
        else if (data.status === 'error') {
          setMessage({
            type: 'error',
            text: data.message || 'An error occurred',
          });
        }
        else if (data.status === 'success') {
          setMessage({
            type: 'success',
            text: data.message || 'Operation successful',
          });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        setMessage({
          type: 'error',
          text: 'Error processing server response',
        });
      }
    };

    ws.onmessage = handleWebSocketMessage;

    // Request initial data when connection is established
    if (isConnected) {
      sendMessage({ type: 'get_attendance' });
      sendMessage({ type: 'get_users' });
    }

    return () => {
      ws.onmessage = null;
    };
  }, [ws, isConnected, sendMessage]);

  // Remove the duplicate WebSocket message handler
  useEffect(() => {
    if (!ws || !isConnected) return;

    // Request initial data when connection is established
    sendMessage({ type: 'get_attendance' });
    sendMessage({ type: 'get_users' });
  }, [ws, isConnected, sendMessage]);

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

  const handleEarlyExitReason = async () => {
    if (!earlyExitDialog.reason) {
      setMessage({
        type: 'error',
        text: 'Invalid early exit reason',
      });
      return;
    }

    try {
      // Create form data
      const formData = new FormData();
      formData.append('early_exit_message', earlyExitDialog.reason.early_exit_message);

      // Log the form data contents for debugging
      console.log('FormData contents:');
      for (let [key, value] of formData.entries()) {
        console.log(key, value);
      }

      // Send the early exit reason to the backend
      const response = await api.post('/early-exit-reason', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.status === 200) {
        // Close the dialog and reset the form
        setEarlyExitDialog({
          open: false,
          reason: null,
        });

        // Show success message
        setMessage({
          type: 'success',
          text: 'Early exit reason submitted successfully',
        });

        // Refresh the early exit reasons list
        sendMessage({ type: 'get_early_exit_reasons' });
      }
    } catch (error: any) {
      console.error('Failed to submit early exit reason:', error);
      console.error('Error response:', error.response?.data);
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to submit early exit reason',
      });
    }
  };

  const handleDeleteEarlyExitReason = (reason: EarlyExitReason) => {
    setEarlyExitDialog({
      open: true,
      reason,
    });
  };

  const handleDeleteEarlyExitConfirm = async () => {
    if (!earlyExitDialog.reason) return;

    try {
      // Send WebSocket message to delete the reason
      sendMessage({
        type: 'delete_early_exit_reason',
        reason_id: earlyExitDialog.reason.id,
      });

      // Close the dialog
      setEarlyExitDialog({
        open: false,
        reason: null,
      });

      // Remove the reason from the local state
      setEarlyExitReasons((prev) => 
        prev.filter((r) => r.id !== earlyExitDialog.reason?.id)
      );
    } catch (error) {
      setError('Failed to delete early exit reason');
    }
  };

  // Add effect to fetch early exit reasons
  useEffect(() => {
    if (isConnected) {
      sendMessage({ type: 'get_early_exit_reasons' });
    }
  }, [isConnected, sendMessage]);

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

          {/* Face Detection Results */}
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
                              {user.similarity !== undefined && (
                                <Typography component="span" variant="body2" color="text.secondary">
                                  {' • Confidence: '}
                                  {(user.similarity * 100).toFixed(1)}%
                                </Typography>
                              )}
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
                                {attendance.entry_type === 'entry' ? 'Entry' : 'Exit'} Recorded
                              </Typography>
                              <Typography component="span" variant="body2" color="text.secondary">
                                {' at '}
                                {format(new Date(attendance.timestamp), 'PPpp')}
                              </Typography>
                              {attendance.entry_time && (
                                <Typography component="span" variant="body2" color="text.secondary">
                                  {' • Entry: '}
                                  {format(new Date(attendance.entry_time), 'HH:mm')}
                                </Typography>
                              )}
                              {attendance.exit_time && (
                                <Typography component="span" variant="body2" color="text.secondary">
                                  {' • Exit: '}
                                  {format(new Date(attendance.exit_time), 'HH:mm')}
                                </Typography>
                              )}
                              {attendance.similarity && (
                                <Typography component="span" variant="body2" color="text.secondary">
                                  {' • Confidence: '}
                                  {(attendance.similarity * 100).toFixed(1)}%
                                </Typography>
                              )}
                              {attendance.is_late && attendance.late_message && (
                                <Typography component="span" variant="body2" color="error">
                                  {' • '}
                                  {attendance.late_message}
                                </Typography>
                              )}
                              {attendance.is_early_exit && attendance.early_exit_message && (
                                <Typography component="span" variant="body2" color="error">
                                  {' • '}
                                  {attendance.early_exit_message}
                                </Typography>
                              )}
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

          {/* Early Exit Reasons Section */}
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Recent Early Exit Reasons
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {earlyExitReasons.map((reason) => (
                    <TableRow key={reason.id}>
                      <TableCell>{reason.name}</TableCell>
                      <TableCell>{reason.early_exit_message}</TableCell>
                      <TableCell>
                        {new Date(reason.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Delete reason">
                          <IconButton
                            color="error"
                            onClick={() => handleDeleteEarlyExitReason(reason)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {earlyExitReasons.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        No early exit reasons found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </CardContent>
      </Card>

      {/* Early Exit Dialog */}
      <Dialog
        open={earlyExitDialog.open}
        onClose={() => setEarlyExitDialog({ open: false, reason: null })}
      >
        <DialogTitle>Early Exit Reason</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Hey {earlyExitDialog.reason?.name}, why are you leaving early?
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Reason"
            fullWidth
            multiline
            rows={4}
            value={earlyExitDialog.reason?.early_exit_message || ''}
            onChange={(e) => {
              if (earlyExitDialog.reason) {
                setEarlyExitDialog({
                  open: true,
                  reason: {
                    id: Number(earlyExitDialog.reason.id) || 0,
                    user_id: earlyExitDialog.reason.user_id,
                    name: earlyExitDialog.reason.name,
                    timestamp: earlyExitDialog.reason.timestamp,
                    early_exit_message: e.target.value
                  }
                });
              }
            }}
            placeholder="Please provide a reason for leaving early..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEarlyExitDialog({ open: false, reason: null })}>
            Cancel
          </Button>
          <Button 
            onClick={handleEarlyExitReason} 
            variant="contained" 
            color="primary"
            disabled={!earlyExitDialog.reason?.early_exit_message.trim()}
          >
            Submit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Early Exit Reason Dialog */}
      <Dialog
        open={earlyExitDialog.open}
        onClose={() => setEarlyExitDialog({ open: false, reason: null })}
      >
        <DialogTitle>Delete Early Exit Reason</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this early exit reason for{' '}
            {earlyExitDialog.reason?.name}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEarlyExitDialog({ open: false, reason: null })}
          >
            Cancel
          </Button>
          <Button onClick={handleDeleteEarlyExitConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 