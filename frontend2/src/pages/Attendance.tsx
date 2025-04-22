import { useState, useCallback } from 'react';
import { Box, Card, CardContent, Typography, Grid, useTheme, alpha, Paper, Divider } from '@mui/material';
import { AccessTime, CameraAlt, Videocam } from '@mui/icons-material';
import { useCamera } from '../hooks/useCamera';
import { useWebSocketHandler } from '../hooks/useWebSocketHandler';
import { useStreaming } from '../hooks/useStreaming';
import { useEarlyExit } from '../hooks/useEarlyExit';
import { CameraView } from '../components/attendance/CameraView';
import { Controls } from '../components/attendance/Controls';
import { AttendanceList } from '../components/attendance/AttendanceList';
import { EarlyExitDialog } from '../components/attendance/EarlyExitDialog';
import { EarlyExitList } from '../components/attendance/EarlyExitList';
import { DetectedUsers } from '../components/attendance/DetectedUsers';
import { StreamingStatus } from '../components/attendance/StreamingStatus';
import api from '../api/config';

export default function Attendance() {
  const theme = useTheme();
  const [isCapturing, setIsCapturing] = useState(false);

  const {
    isVideoMode,
    videoFile,
    videoPreview,
    availableCameras,
    selectedCamera,
    webcamRef,
    videoRef,
    handleVideoChange,
    handleCameraChange,
    setIsVideoMode,
  } = useCamera();

  const {
    message,
    multipleUsers,
    faceCount,
    recentAttendance,
    earlyExitReasons,
    earlyExitDialog,
    setEarlyExitDialog,
    sendMessage,
    isConnected,
  } = useWebSocketHandler();

  const {
    isStreaming,
    startStreaming,
    stopStreaming,
    startVideoStream,
  } = useStreaming();

  const {
    handleEarlyExitReason,
    handleEarlyExitDialogChange,
  } = useEarlyExit();

  const capture = useCallback(async () => {
    if (webcamRef.current) {
      setIsCapturing(true);

      try {
        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) {
          throw new Error('Failed to capture image');
        }

        const base64Response = await fetch(imageSrc);
        const blob = await base64Response.blob();

        const formData = new FormData();
        formData.append('image', blob, 'capture.jpg');
        formData.append('entry_type', 'entry');

        await api.post('/attendance', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } catch (error) {
        console.error('Failed to mark attendance:', error);
      } finally {
        setIsCapturing(false);
      }
    }
  }, [webcamRef]);

  const handleStartStreaming = useCallback(() => {
    if (webcamRef.current) {
      startStreaming(() => webcamRef.current?.getScreenshot() || null);
    }
  }, [webcamRef, startStreaming]);

  const handleStartVideoStream = useCallback(() => {
    startVideoStream(videoRef);
  }, [startVideoStream, videoRef]);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <AccessTime 
          fontSize="large" 
          sx={{ 
            color: theme.palette.primary.main,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            p: 1,
            borderRadius: 2,
            mr: 2
          }} 
        />
        <Typography variant="h4" fontWeight="700" color="text.primary">
          Face Attendance
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Card sx={{ 
            mb: 3, 
            borderRadius: 3,
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            overflow: 'hidden'
          }}>
            <Box sx={{ 
              p: 3, 
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {isVideoMode ? (
                    <Videocam sx={{ mr: 1, color: theme.palette.primary.main }} />
                  ) : (
                    <CameraAlt sx={{ mr: 1, color: theme.palette.primary.main }} />
                  )}
                  <Typography variant="h6" fontWeight="600">
                    {isVideoMode ? 'Video Mode' : 'Camera Mode'}
                  </Typography>
                </Box>
                <StreamingStatus isStreaming={isStreaming} />
              </Box>
            </Box>
            
            <CardContent sx={{ p: 3 }}>
              <CameraView
                isVideoMode={isVideoMode}
                videoPreview={videoPreview}
                availableCameras={availableCameras}
                selectedCamera={selectedCamera}
                webcamRef={webcamRef}
                videoRef={videoRef}
                handleCameraChange={handleCameraChange}
                faceCount={faceCount}
              />
            </CardContent>

            <Box sx={{ 
              p: 3, 
              backgroundColor: alpha(theme.palette.background.default, 0.6),
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.7)}`
            }}>
              <Controls
                isVideoMode={isVideoMode}
                isCapturing={isCapturing}
                isStreaming={isStreaming}
                webcamRef={webcamRef}
                videoFile={videoFile}
                handleVideoChange={handleVideoChange}
                capture={capture}
                startStreaming={handleStartStreaming}
                stopStreaming={stopStreaming}
                startVideoStream={handleStartVideoStream}
                message={message}
              />
            </Box>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
              mb: 3,
              overflow: 'hidden'
            }}
          >
            <Box sx={{ 
              p: 2, 
              backgroundColor: alpha(theme.palette.info.main, 0.05),
              borderBottom: `1px solid ${alpha(theme.palette.info.main, 0.1)}`
            }}>
              <Typography variant="h6" fontWeight="600">
                Detected Users
              </Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <DetectedUsers users={multipleUsers} />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <AttendanceList recentAttendance={recentAttendance} />
        </Grid>
        
        {earlyExitReasons.length > 0 && (
          <Grid item xs={12}>
            <EarlyExitList 
              earlyExitReasons={earlyExitReasons} 
              onDelete={(reason) => setEarlyExitDialog({ open: true, reason })}
            />
          </Grid>
        )}
      </Grid>

      <EarlyExitDialog
        open={earlyExitDialog.open}
        reason={earlyExitDialog.reason}
        onClose={() => setEarlyExitDialog({ open: false, reason: null })}
        onSubmit={(reasonText, attendanceId) => handleEarlyExitReason(reasonText, attendanceId)}
      />
    </Box>
  );
} 