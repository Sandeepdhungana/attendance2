import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
} from '@mui/material';
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
  return (
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
  );
}; 