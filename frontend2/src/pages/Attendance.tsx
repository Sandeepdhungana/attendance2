import { useState, useCallback } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
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
  const [isCapturing, setIsCapturing] = useState(false);
  const [entryType, setEntryType] = useState<'entry' | 'exit'>('entry');

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
  } = useStreaming(entryType);

  const {
    handleEarlyExitReason,
    handleEarlyExitDialogChange,
  } = useEarlyExit();

  const handleEntryTypeChange = (
    event: React.MouseEvent<HTMLElement>,
    newEntryType: 'entry' | 'exit' | null,
  ) => {
    if (newEntryType !== null) {
      setEntryType(newEntryType);
    }
  };

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
        formData.append('entry_type', entryType);

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
  }, [webcamRef, entryType]);

  const handleStartStreaming = useCallback(() => {
    if (webcamRef.current) {
      startStreaming(() => webcamRef.current?.getScreenshot() || null);
    }
  }, [webcamRef, startStreaming]);

  const handleStartVideoStream = useCallback(() => {
    startVideoStream(videoRef);
  }, [startVideoStream, videoRef]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Face Attendance
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
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

          <StreamingStatus isStreaming={isStreaming} />

          <Controls
            entryType={entryType}
            isVideoMode={isVideoMode}
            isCapturing={isCapturing}
            isStreaming={isStreaming}
            webcamRef={webcamRef}
            videoFile={videoFile}
            handleEntryTypeChange={handleEntryTypeChange}
            handleVideoChange={handleVideoChange}
            capture={capture}
            startStreaming={handleStartStreaming}
            stopStreaming={stopStreaming}
            startVideoStream={handleStartVideoStream}
            message={message}
          />

          <DetectedUsers users={multipleUsers} />
          <AttendanceList recentAttendance={recentAttendance} />
        </CardContent>
      </Card>

      <EarlyExitDialog
        open={earlyExitDialog.open}
        reason={earlyExitDialog.reason}
        onClose={() => setEarlyExitDialog({ open: false, reason: null })}
        onSubmit={handleEarlyExitReason}
      />
    </Box>
  );
} 