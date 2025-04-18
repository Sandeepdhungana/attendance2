import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  useTheme,
  alpha,
  Chip,
} from '@mui/material';
import { Videocam, CameraAlt, Face } from '@mui/icons-material';
import Webcam from 'react-webcam';

interface CameraViewProps {
  isVideoMode: boolean;
  videoPreview: string;
  availableCameras: MediaDeviceInfo[];
  selectedCamera: string;
  webcamRef: React.RefObject<Webcam | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  handleCameraChange: (event: any) => void;
  faceCount: number;
}

export const CameraView: React.FC<CameraViewProps> = ({
  isVideoMode,
  videoPreview,
  availableCameras,
  selectedCamera,
  webcamRef,
  videoRef,
  handleCameraChange,
  faceCount,
}) => {
  const theme = useTheme();
  
  return (
    <Box sx={{ position: 'relative', mb: 2 }}>
      {!isVideoMode ? (
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
              onChange={handleCameraChange}
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
            position: 'relative', 
            overflow: 'hidden',
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            boxShadow: `0 4px 16px ${alpha(theme.palette.common.black, 0.05)}`,
          }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width: 640,
                height: 480,
                deviceId: selectedCamera
              }}
              style={{ width: '100%', display: 'block' }}
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
        </>
      ) : (
        <Box sx={{ 
          position: 'relative', 
          overflow: 'hidden',
          borderRadius: 2,
          border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
          boxShadow: `0 4px 16px ${alpha(theme.palette.common.black, 0.05)}`,
        }}>
          <video
            ref={videoRef}
            src={videoPreview}
            style={{ width: '100%', display: 'block' }}
            controls
            autoPlay
            muted
          />
          <Box sx={{ 
            position: 'absolute', 
            top: 10, 
            left: 10, 
            backgroundColor: alpha(theme.palette.warning.main, 0.8),
            color: theme.palette.common.white,
            px: 1.5,
            py: 0.5,
            borderRadius: 4,
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center' }}>
              <CameraAlt fontSize="small" sx={{ mr: 0.5, fontSize: '0.875rem' }} />
              Video Mode
            </Typography>
          </Box>
        </Box>
      )}
      
      <Chip
        icon={<Face />}
        label={`${faceCount} ${faceCount === 1 ? 'Face' : 'Faces'} Detected`}
        color={faceCount > 0 ? 'success' : 'default'}
        variant="outlined"
        sx={{
          position: 'absolute',
          top: !isVideoMode ? 56 + 16 : 16, // Account for Select height when in webcam mode
          right: 16,
          fontWeight: 600,
          borderWidth: 2,
          boxShadow: faceCount > 0 ? `0 2px 8px ${alpha(theme.palette.success.main, 0.4)}` : 'none',
        }}
      />
    </Box>
  );
}; 