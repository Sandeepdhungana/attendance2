import React from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  useTheme,
  alpha,
  Paper,
  Typography,
} from '@mui/material';
import { CameraAlt, Videocam } from '@mui/icons-material';
import Webcam from 'react-webcam';

interface CameraViewProps {
  webcamRef: React.RefObject<Webcam | null>;
  availableCameras: MediaDeviceInfo[];
  selectedCamera: string;
  onCameraChange: (event: SelectChangeEvent) => void;
  onCapture: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  webcamRef,
  availableCameras,
  selectedCamera,
  onCameraChange,
  onCapture,
}) => {
  const theme = useTheme();
  
  return (
    <>
      <FormControl 
        fullWidth 
        sx={{ 
          mb: 2,
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
          }
        }}
      >
        <InputLabel id="camera-select-label">Select Camera</InputLabel>
        <Select
          labelId="camera-select-label"
          value={selectedCamera}
          label="Select Camera"
          onChange={onCameraChange}
          startAdornment={<Videocam sx={{ mr: 1, ml: -0.5, color: theme.palette.text.secondary }} />}
        >
          {availableCameras.map((camera) => (
            <MenuItem key={camera.deviceId} value={camera.deviceId}>
              {camera.label || `Camera ${camera.deviceId}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      <Box sx={{ 
        mb: 3,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        boxShadow: `0 4px 16px ${alpha(theme.palette.common.black, 0.05)}`,
      }}>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          width="100%"
          height="auto"
          videoConstraints={{
            width: 640,
            height: 480,
            deviceId: selectedCamera
          }}
        />
        <Box sx={{ 
          position: 'absolute', 
          top: 10, 
          left: 10, 
          backgroundColor: alpha(theme.palette.common.black, 0.5),
          color: theme.palette.common.white,
          px: 1.5,
          py: 0.5,
          borderRadius: 4,
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
        }}>
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center' }}>
            <Videocam fontSize="small" sx={{ mr: 0.5, fontSize: '0.875rem' }} />
            Live Camera
          </Typography>
        </Box>
      </Box>
      
      <Button
        variant="contained"
        onClick={onCapture}
        fullWidth
        startIcon={<CameraAlt />}
        size="large"
        sx={{ 
          borderRadius: 2,
          py: 1.2,
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
        }}
      >
        Capture Photo
      </Button>
    </>
  );
}; 