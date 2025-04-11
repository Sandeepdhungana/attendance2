import React from 'react';
import {
  Box,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
} from '@mui/material';
import { Login as LoginIcon, Logout as LogoutIcon, CloudUpload as CloudUploadIcon } from '@mui/icons-material';

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
  return (
    <>
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
    </>
  );
}; 