import React from 'react';
import {
  Box,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  useTheme,
  alpha,
  Paper,
  Divider,
  Typography,
} from '@mui/material';
import { 
  Login as LoginIcon, 
  Logout as LogoutIcon, 
  CloudUpload as CloudUploadIcon,
  Videocam as VideocamIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
} from '@mui/icons-material';

interface ControlsProps {
  entryType: 'entry' | 'exit';
  isVideoMode: boolean;
  isCapturing: boolean;
  isStreaming: boolean;
  webcamRef: React.RefObject<any | null>;
  videoFile: File | null;
  handleEntryTypeChange: (event: React.MouseEvent<HTMLElement>, newEntryType: 'entry' | 'exit' | null) => void;
  handleVideoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  capture: () => void;
  startStreaming: () => void;
  stopStreaming: () => void;
  startVideoStream: () => void;
  message: { type: 'success' | 'error' | null; text: string };
}

export const Controls: React.FC<ControlsProps> = ({
  entryType,
  isVideoMode,
  isCapturing,
  isStreaming,
  webcamRef,
  videoFile,
  handleEntryTypeChange,
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
      <Box sx={{ mb: 3 }}>
        <Paper
          elevation={0}
          sx={{ 
            p: 0.5, 
            backgroundColor: alpha(theme.palette.background.default, 0.8),
            borderRadius: 3,
            border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
            display: 'inline-block',
          }}
        >
          <ToggleButtonGroup
            value={entryType}
            exclusive
            onChange={handleEntryTypeChange}
            aria-label="entry type"
            sx={{
              '& .MuiToggleButtonGroup-grouped': {
                border: 'none',
                borderRadius: 2,
                px: 3,
                py: 1,
                fontWeight: 600,
                mx: 0.5,
                textTransform: 'none',
                '&.Mui-selected': {
                  backgroundColor: entryType === 'entry' 
                    ? alpha(theme.palette.primary.main, 0.8)
                    : alpha(theme.palette.secondary.main, 0.8),
                  color: '#fff',
                  '&:hover': {
                    backgroundColor: entryType === 'entry' 
                      ? alpha(theme.palette.primary.main, 1)
                      : alpha(theme.palette.secondary.main, 1),
                  }
                },
                '&:not(.Mui-selected)': {
                  backgroundColor: alpha(theme.palette.action.selected, 0.08),
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.action.selected, 0.15),
                  }
                }
              }
            }}
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
        </Paper>
      </Box>

      <Box sx={{ 
        display: 'flex', 
        flexWrap: 'wrap',
        gap: 2, 
        mb: 3,
        alignItems: 'center'
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
          color={entryType === 'entry' ? 'primary' : 'secondary'}
          onClick={isVideoMode ? startVideoStream : capture}
          disabled={isCapturing || isStreaming || (!isVideoMode && !webcamRef.current) || (isVideoMode && !videoFile)}
          startIcon={entryType === 'entry' ? <LoginIcon /> : <LogoutIcon />}
          sx={{ 
            borderRadius: 2,
            py: 1.2,
            px: 3,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: `0 4px 12px ${alpha(
              entryType === 'entry' ? theme.palette.primary.main : theme.palette.secondary.main, 
              0.2
            )}`,
          }}
        >
          {isCapturing ? 'Processing...' : `Capture ${entryType === 'entry' ? 'Entry' : 'Exit'}`}
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