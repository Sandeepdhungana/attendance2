import React from 'react';
import {
  Box,
  Button,
  Alert,
  useTheme,
  alpha,
  Paper,
  Typography,
} from '@mui/material';
import { 
  CloudUpload as CloudUploadIcon,
  Videocam as VideocamIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  PersonAdd as PersonAddIcon
} from '@mui/icons-material';

interface ControlsProps {
  isVideoMode: boolean;
  isCapturing: boolean;
  isStreaming: boolean;
  webcamRef: React.RefObject<any | null>;
  videoFile: File | null;
  handleVideoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  capture: () => void;
  startStreaming: () => void;
  stopStreaming: () => void;
  startVideoStream: () => void;
  message: { type: 'success' | 'error' | null; text: string };
}

export const Controls: React.FC<ControlsProps> = ({
  isVideoMode,
  isCapturing,
  isStreaming,
  webcamRef,
  videoFile,
  handleVideoChange,
  capture,
  startStreaming,
  stopStreaming,
  startVideoStream,
  message,
}) => {
  const theme = useTheme();
  
  return (
    <>
      <Box sx={{ 
        display: 'flex', 
        flexWrap: 'wrap',
        gap: 2, 
        mb: 3,
        alignItems: 'center',
        justifyContent: 'center'
      }}>
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
            sx={{ 
              borderRadius: 2,
              py: 1.2,
              px: 2,
              textTransform: 'none',
              fontWeight: 600,
              borderColor: alpha(theme.palette.primary.main, 0.3),
              '&:hover': {
                borderColor: alpha(theme.palette.primary.main, 0.5),
                backgroundColor: alpha(theme.palette.primary.main, 0.05),
              }
            }}
          >
            Upload Video
          </Button>
        </label>
        
        <Button
          variant="contained"
          color="primary"
          onClick={isVideoMode ? startVideoStream : capture}
          disabled={isCapturing || isStreaming || (!isVideoMode && !webcamRef.current) || (isVideoMode && !videoFile)}
          startIcon={<PersonAddIcon />}
          sx={{ 
            borderRadius: 2,
            py: 1.2,
            px: 3,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
          }}
        >
          {isCapturing ? 'Processing...' : 'Mark Attendance'}
        </Button>
        
        {!isVideoMode && (
          <Button
            variant={isStreaming ? 'contained' : 'outlined'}
            onClick={isStreaming ? stopStreaming : startStreaming}
            color={isStreaming ? 'error' : 'primary'}
            startIcon={isStreaming ? <StopIcon /> : <PlayArrowIcon />}
            sx={{ 
              borderRadius: 2,
              py: 1.2,
              px: 2,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: isStreaming ? `0 4px 12px ${alpha(theme.palette.error.main, 0.2)}` : 'none',
              borderColor: isStreaming ? 'transparent' : alpha(theme.palette.primary.main, 0.3),
              '&:hover': {
                borderColor: isStreaming ? 'transparent' : alpha(theme.palette.primary.main, 0.5),
                backgroundColor: isStreaming 
                  ? alpha(theme.palette.error.main, 0.9)
                  : alpha(theme.palette.primary.main, 0.05),
              }
            }}
          >
            {isStreaming ? 'Stop Streaming' : 'Start Streaming'}
          </Button>
        )}
      </Box>

      {message.type && (
        <Alert 
          severity={message.type} 
          variant="filled"
          sx={{ 
            mb: 2,
            borderRadius: 2,
            '& .MuiAlert-icon': {
              alignItems: 'center'
            }
          }}
        >
          {message.text}
        </Alert>
      )}
    </>
  );
}; 